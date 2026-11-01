import { useMemo, useRef, useState } from 'react';
import { spaceMarks, spaceOutline } from '../assets/catalog/spaces';
import { glyph } from '../assets/glyphs';
import { ASSET_BY_KEY, ASSET_CATEGORIES, ASSETS, assetPreviewUrl, assetsIn, searchAssets, type AssetCategory, type AssetDef } from '../assets/library';
import { esc, P, svgDataUrl, svgDoc, withAlpha } from '../assets/style';
import { MAP_PALETTE } from '../theme';
import { Icon } from '../ui/icons';
import { loadBackgroundFile } from './LayersPanel';
import { useEditor } from './store';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Previews for tiles that aren't drawn assets: spaces, text styles, uploads. */
const extraPreviews = new Map<string, string>();
function previewUrl(def: AssetDef): string | undefined {
  const creates = def.creates ?? 'asset';
  if (creates === 'asset') return assetPreviewUrl(def);
  let url = extraPreviews.get(def.key);
  if (url) return url;
  const { width: w, height: h } = def;
  let markup: string;
  if (creates === 'space') {
    const v = def.variant ?? 'standard';
    const stroke = def.stroke || MAP_PALETTE.spaceStroke;
    const pts = spaceOutline(v, w, h);
    const path = `M${pts[0]} ${pts[1]}L${pts[2]} ${pts[3]}L${pts[4]} ${pts[5]}L${pts[6]} ${pts[7]}Z`;
    const pad = 2;
    markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}" width="${(w + pad * 2) * 2}" height="${(h + pad * 2) * 2}"><path d="${path}" fill="#ffffff" stroke="${stroke}" stroke-width="2"/>${spaceMarks(v, w, h, 'center', stroke)}</svg>`;
  } else if (creates === 'text' && def.text) {
    const t = def.text;
    const first = t.text.split('\n')[0];
    const box = t.fill || t.strokeWidth ? `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="3" fill="${t.fill ? withAlpha(t.fill, t.fillOpacity ?? 1) : 'none'}" stroke="${t.stroke ?? 'none'}" stroke-width="${t.strokeWidth ?? 0}"/>` : '';
    markup = svgDoc(w, h, `${box}<text x="${w / 2}" y="${h / 2}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${Math.min(t.fontSize, (w / Math.max(first.length, 1)) * 1.6)}" fill="${t.color}" text-anchor="middle" dominant-baseline="central">${esc(first)}</text>`);
  } else {
    const g = { background: 'photo', image: 'photo', row: 'grid', soon: 'template' }[creates as string] ?? 'template';
    const named = /pdf/i.test(def.key) ? 'pdf' : /svg/i.test(def.key) ? 'svg' : /floor-plan|blueprint/.test(def.key) ? 'plan' : /satellite|aerial/.test(def.key) ? 'globe' : /group/.test(def.key) ? 'group' : /company/.test(def.key) ? 'building' : g;
    markup = svgDoc(40, 40, `<rect x="1" y="1" width="38" height="38" rx="6" fill="#eef2f6" stroke="${P.inkSoft}" stroke-width="1" ${creates === 'soon' ? 'stroke-dasharray="3 2"' : ''}/>${glyph(named, 20, 20, 24, P.inkSoft)}`);
  }
  url = svgDataUrl(markup);
  extraPreviews.set(def.key, url);
  return url;
}

function viewCenter() {
  const s = useEditor.getState();
  const v = s.viewport;
  return { x: (s.viewSize.width / 2 - v.x) / v.scale, y: (s.viewSize.height / 2 - v.y) / v.scale };
}

function Tile({ def, onPick }: { def: AssetDef; onPick: (def: AssetDef) => void }) {
  const favorites = useEditor((s) => s.favoriteAssets);
  const fav = favorites.includes(def.key);
  const creates = def.creates ?? 'asset';
  const placeable = creates === 'asset' || creates === 'space' || creates === 'text';
  const src = previewUrl(def);
  const title = creates === 'soon' ? `${def.name}: coming next. ${def.note ?? ''}` : def.note ? `${def.name}. ${def.note}` : `${def.name}: click to add, or drag onto the map`;
  return (
    <div className="tile-wrap">
      <button
        className={`tile${creates === 'soon' ? ' soon' : ''}`}
        title={title}
        draggable={placeable}
        onDragStart={(e) => {
          if (!placeable) return;
          e.dataTransfer.setData('application/x-bm-asset', def.key);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onPick(def)}
        data-testid={`asset-${def.key}`}
      >
        {src && <img src={src} alt="" draggable={false} />}
        <span>{def.name}</span>
        {creates === 'soon' && <em className="soon-tag">Next stage</em>}
      </button>
      {creates !== 'soon' && (
        <button
          className={`fav${fav ? ' on' : ''}`}
          title={fav ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={fav}
          onClick={() => useEditor.getState().toggleFavorite(def.key)}
        >
          <Icon name="star" size={12} fill={fav ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

const OPEN_KEY = 'bm.libraryOpen';
function readOpen(): AssetCategory[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null');
    if (Array.isArray(v)) return v;
  } catch {
    /* default below */
  }
  return ['Parking spaces', 'Valet operations'];
}

export function AssetLibrary() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AssetCategory[]>(readOpen);
  const recent = useEditor((s) => s.recentAssets);
  const favorites = useEditor((s) => s.favoriteAssets);
  const results = useMemo(() => searchAssets(q), [q]);
  const toDefs = (keys: string[]) => keys.map((k) => ASSET_BY_KEY[k]).filter(Boolean);
  const bgRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const toggle = (c: AssetCategory, isOpen: boolean) => {
    const next = isOpen ? [...new Set([...open, c])] : open.filter((x) => x !== c);
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* optional */
    }
  };

  const pick = (def: AssetDef) => {
    const s = useEditor.getState();
    const creates = def.creates ?? 'asset';
    if (creates === 'soon') {
      s.notify({ tone: 'info', message: `${def.name} is coming in the next stage. ${def.note ?? ''}`.trim() });
    } else if (creates === 'background') {
      bgRef.current?.click();
    } else if (creates === 'image') {
      if (imgRef.current) {
        imgRef.current.accept = def.key === 'import-svg' ? 'image/svg+xml' : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
        imgRef.current.click();
      }
    } else {
      s.addAsset(def.key, viewCenter());
    }
  };

  const onImage = (file: File | undefined) => {
    const s = useEditor.getState();
    if (!file) return;
    if (!file.type.startsWith('image/')) return s.notify({ tone: 'error', message: 'That file isn’t an image. Use PNG, JPG, WebP or SVG.' });
    if (file.size > MAX_IMAGE_BYTES) return s.notify({ tone: 'error', message: 'That image is larger than 15 MB. Please use a smaller copy.' });
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const nw = img.naturalWidth || 200;
        const nh = img.naturalHeight || 200;
        const k = Math.min(1, 240 / Math.max(nw, nh));
        useEditor.getState().addImage(src, viewCenter(), { width: Math.round(nw * k), height: Math.round(nh * k) }, file.name.replace(/\.[^.]+$/, ''));
      };
      img.onerror = () => useEditor.getState().notify({ tone: 'error', message: 'This image couldn’t be opened. Try a PNG or JPG.' });
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const onTile = (d: AssetDef) => <Tile key={d.key} def={d} onPick={pick} />;

  return (
    <div className="asset-library">
      <input ref={bgRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-testid="library-bg-file"
        onChange={(e) => { loadBackgroundFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={imgRef} type="file" hidden data-testid="library-image-file"
        onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="search">
        <Icon name="search" size={16} />
        <input
          placeholder={`Search ${ASSETS.length} objects (ramp, stairs, tree…)`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQ('');
            e.stopPropagation();
          }}
          data-testid="asset-search"
        />
      </div>
      {q ? (
        results.length ? (
          <div className="tiles">{results.map(onTile)}</div>
        ) : (
          <p className="empty">No objects match “{q}”. Try a simpler word like “sign” or “booth”.</p>
        )
      ) : (
        <>
          {favorites.length > 0 && (
            <section>
              <h4>Favorites</h4>
              <div className="tiles">{toDefs(favorites).map(onTile)}</div>
            </section>
          )}
          {recent.length > 0 && (
            <section>
              <h4>Recently used</h4>
              <div className="tiles">{toDefs(recent).slice(0, 6).map(onTile)}</div>
            </section>
          )}
          {ASSET_CATEGORIES.map((c) => {
            const items = assetsIn(c);
            return (
              <details key={c} className="lib-cat" open={open.includes(c)} onToggle={(e) => toggle(c, (e.target as HTMLDetailsElement).open)}>
                <summary>
                  {c} <span className="muted">{items.length}</span>
                </summary>
                {open.includes(c) && <div className="tiles">{items.map(onTile)}</div>}
              </details>
            );
          })}
        </>
      )}
    </div>
  );
}
