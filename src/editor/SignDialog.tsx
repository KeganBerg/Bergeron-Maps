import { useEffect, useMemo, useState } from 'react';
import type { MapObject } from '../model/types';
import { qrSvg } from '../model/qr';
import type { MapRepository } from '../storage/repository';
import { Dialog } from '../ui/Dialog';
import { objectDisplayName } from './CanvasStage';
import { pinnedPicture, printSign, qrInches, scanFeet, SIGN_SIZES, type SignSize } from './qrSign';
import { currentFloor, useEditor } from './store';
import { floorImage } from './view';

export interface SignLink {
  url: string;
  /** Things to sort out before the sign goes up, in plain words. */
  warnings: string[];
}

/**
 * The link a sign's QR code holds. Online, a public map gets the site's public link (no
 * sign-in, so visitors can scan it); otherwise the employee link. Either way it names the
 * map, so a site with two live maps still opens the right one.
 */
export async function signLink(repo: MapRepository, mapId: string, objectId: string, place: string): Promise<SignLink> {
  const base = `${window.location.origin}${window.location.pathname}#/view/`;
  const from = `?from=${encodeURIComponent(objectId)}`;
  const warnings: string[] = [];
  const [published, summary] = await Promise.all([
    repo.getPublishedMap(mapId).catch(() => null),
    repo.setMapPublic ? repo.listMaps().then((l) => l.find((m) => m.id === mapId), () => undefined) : Promise.resolve(undefined),
  ]);
  if (!published) warnings.push('This map isn’t published yet. Publish it before the sign goes up, or the code opens to a map that isn’t there.');
  else if (!published.floors.some((f) => f.objects.some((o) => o.id === objectId)))
    warnings.push(`${place} was added after the last publish. Publish the map so the sign’s code shows “You are here”.`);
  if (summary?.isPublic && summary.siteSlug) return { url: `${base}${summary.siteSlug}/${mapId}${from}`, warnings };
  if (repo.setMapPublic)
    warnings.push('Only people signed in to this site can open this code. To let visitors scan it, make the map public on the Maps page, then make the sign again.');
  return { url: `${base}${mapId}${from}`, warnings };
}

/** Make a printed "You are here" sign for one object: pick a size, check the link, print. */
export function SignDialog({ repo, mapId, objectId, onClose }: { repo: MapRepository; mapId: string; objectId: string; onClose: () => void }) {
  const doc = useEditor((s) => s.doc)!;
  const floor = useEditor((s) => currentFloor(s))!;
  const obj = floor.objects.find((o) => o.id === objectId) as MapObject | undefined;
  const place = obj ? objectDisplayName(obj) : '';
  const [link, setLink] = useState<SignLink | null>(null);
  const [size, setSize] = useState<SignSize>('letter');
  const [withMap, setWithMap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void signLink(repo, mapId, objectId, place).then((l) => alive && setLink(l));
    return () => { alive = false; };
  }, [repo, mapId, objectId, place]);
  const preview = useMemo(() => (link ? qrSvg(link.url, { label: `QR code for ${place}` }) : ''), [link, place]);

  if (!obj) return null;
  const mapOn = withMap && size !== 'card';

  const print = async () => {
    if (!link) return;
    // Opened before anything slow, while the click still counts, so pop-up blockers allow it.
    const w = window.open('', '_blank');
    if (!w) {
      useEditor.getState().notify({ tone: 'error', message: 'The print window was blocked. Allow pop-ups for this site and try again.' });
      return;
    }
    setBusy(true);
    try {
      const img = mapOn ? await floorImage() : null;
      const mapPicture = img ? await pinnedPicture(img, { x: obj.x, y: obj.y }) : undefined;
      await printSign(w, { url: link.url, place, floor: floor.name, mapName: doc.name, size, mapPicture });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`“You are here” sign for ${place}`} onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={!link || busy} onClick={() => void print()} data-testid="sign-print">
            {busy ? 'Making the sign…' : 'Print sign'}
          </button>
        </>
      }>
      <p>People who scan this sign see the map open on {floor.name}, with “You are here” on {place}. From there they can get directions to any space.</p>
      {link?.warnings.map((w) => (
        <p key={w} className="callout warning" data-testid="sign-warning">{w}</p>
      ))}
      <div className="sign-setup">
        <div className="sign-qr-preview" aria-hidden={!preview} dangerouslySetInnerHTML={{ __html: preview }} data-testid="sign-qr-preview" />
        <fieldset className="sign-sizes">
          <legend>Size</legend>
          {SIGN_SIZES.map((s) => (
            <label key={s.key} className="check">
              <input type="radio" name="sign-size" checked={size === s.key} onChange={() => setSize(s.key)} data-testid={`sign-size-${s.key}`} />
              <span><strong>{s.label}</strong><br /><span className="muted small">{s.use} QR code {qrInches(s.key, withMap)} in wide, scans from up to about {scanFeet(qrInches(s.key, withMap))} ft.</span></span>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={mapOn} disabled={size === 'card'} onChange={(e) => setWithMap(e.target.checked)} data-testid="sign-with-map" />
            Show the floor with a pin on {place}{size === 'card' ? ' (not on a card)' : ''}
          </label>
        </fieldset>
      </div>
      <div className="share-link">
        <input readOnly value={link?.url ?? 'Making the link…'} aria-label="Link in the QR code" onFocus={(e) => e.currentTarget.select()} data-testid="sign-link" />
        <button className="btn" disabled={!link} onClick={() => link && void navigator.clipboard?.writeText(link.url).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="btn" disabled={!link} onClick={() => link && window.open(link.url, '_blank', 'noopener')} data-testid="sign-try">Try it</button>
      </div>
      <p className="hint">Print at 100% (“Actual size”), not “Fit to page”, so the code stays the size shown. Scan the printed sign with a phone before you put it up.</p>
    </Dialog>
  );
}
