import { useMemo, useState } from 'react';
import { createMap } from '../model/factory';
import { clampQuickLot, createQuickLot, QUICK_LOT_DEFAULTS, QUICK_LOT_LIMITS, quickLotTotal, type QuickLotSpec } from '../model/quickLot';
import type { Floor, MapDocument } from '../model/types';
import { floorBounds } from '../render/viewport';
import { Dialog } from '../ui/Dialog';

/** A tiny top-down sketch of the first level, so the manager sees what they'll get. */
function LotSketch({ floor }: { floor: Floor }) {
  const b = floorBounds(floor);
  if (!b) return null;
  const pad = 20;
  return (
    <svg className="lot-sketch" viewBox={`${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`} aria-hidden="true">
      {floor.objects.map((o) => {
        const t = `translate(${o.x} ${o.y}) rotate(${o.rotation})`;
        const r = { x: -o.width / 2, y: -o.height / 2, width: o.width, height: o.height };
        if (o.kind === 'space') return <rect key={o.id} transform={t} {...r} className={o.accessible ? 'sk-space sk-ada' : 'sk-space'} />;
        if (o.kind === 'asset' && o.assetKey === 'road') return <rect key={o.id} transform={t} {...r} className="sk-lane" />;
        if (o.kind === 'asset') return <circle key={o.id} transform={t} r={Math.min(o.width, o.height) / 2} className={`sk-mark sk-${o.assetKey}`} />;
        return null;
      })}
    </svg>
  );
}

const FIELDS: { key: keyof QuickLotSpec; label: string; hint: string }[] = [
  { key: 'floors', label: 'Levels', hint: '1 for a surface lot' },
  { key: 'rows', label: 'Rows per level', hint: 'Lettered A, B, C…' },
  { key: 'spacesPerRow', label: 'Spaces per row', hint: 'Numbered 1, 2, 3…' },
  { key: 'accessible', label: 'Accessible spaces', hint: 'Start of row A' },
];

/**
 * New map, built for the busy manager: answer four numbers and get a full,
 * numbered layout to adjust, or start from an empty canvas.
 */
export function NewMapDialog({ site, onCreate, onClose }: { site?: string; onCreate: (doc: MapDocument, site?: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'quick' | 'blank'>('quick');
  const [raw, setRaw] = useState<Record<keyof QuickLotSpec, string>>({
    floors: String(QUICK_LOT_DEFAULTS.floors),
    rows: String(QUICK_LOT_DEFAULTS.rows),
    spacesPerRow: String(QUICK_LOT_DEFAULTS.spacesPerRow),
    accessible: String(QUICK_LOT_DEFAULTS.accessible),
  });
  const spec = clampQuickLot({
    floors: Number(raw.floors), rows: Number(raw.rows), spacesPerRow: Number(raw.spacesPerRow), accessible: Number(raw.accessible),
  });
  const preview = useMemo(() => createQuickLot('preview', spec), [spec.floors, spec.rows, spec.spacesPerRow, spec.accessible]);
  const total = quickLotTotal(spec);

  const fallback = site ? 'New map' : 'Untitled site';
  const create = () => onCreate(mode === 'quick' ? createQuickLot(name || fallback, spec) : createMap(name || fallback), site);

  return (
    <Dialog title={site ? `New map at ${site}` : 'New site map'} wide onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={create} data-testid="create-map">
            {mode === 'quick' ? `Create map with ${total} spaces` : 'Create blank map'}
          </button>
        </>
      }>
      <form className="new-map" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <label className="stack">
          {site ? 'Map name' : 'Site name'}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={site ? 'e.g. Overflow lot' : 'Site Name'} maxLength={80} data-testid="map-name-input" />
        </label>

        <div className="segmented" role="radiogroup" aria-label="How to start">
          <button type="button" role="radio" aria-checked={mode === 'quick'} className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')} data-testid="mode-quick">
            <strong>Build it for me</strong>
            <span>Answer four numbers, adjust after</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'blank'} className={mode === 'blank' ? 'on' : ''} onClick={() => setMode('blank')} data-testid="mode-blank">
            <strong>Start blank</strong>
            <span>Draw everything yourself</span>
          </button>
        </div>

        {mode === 'quick' && (
          <div className="quick-lot">
            <div className="quick-fields">
              {FIELDS.map((f) => (
                <label key={f.key} className="stack">
                  {f.label}
                  <input type="number" inputMode="numeric" min={QUICK_LOT_LIMITS[f.key].min} max={QUICK_LOT_LIMITS[f.key].max}
                    value={raw[f.key]} onChange={(e) => setRaw({ ...raw, [f.key]: e.target.value })} data-testid={`quick-${f.key}`} />
                  <span className="hint">{f.hint}</span>
                </label>
              ))}
            </div>
            <figure className="quick-preview">
              <LotSketch floor={preview.floors[0]} />
              <figcaption>
                {spec.floors > 1 ? `Level 1 of ${spec.floors}. ` : ''}Lanes, entrance{spec.floors > 1 ? ', ramps and stairs' : ' and exit'} are added for you. Move or renumber anything afterward.
              </figcaption>
            </figure>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
