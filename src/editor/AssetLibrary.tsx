import { useMemo, useState } from 'react';
import { ASSET_BY_KEY, ASSET_CATEGORIES, ASSETS, searchAssets, svgDataUrl, type AssetDef } from '../assets/library';
import { Icon } from '../ui/icons';
import { useEditor } from './store';

function Preview({ def }: { def: AssetDef }) {
  if (def.render === 'icon' && def.svg) return <img src={svgDataUrl(def.svg)} alt="" draggable={false} />;
  return (
    <span
      className="area-preview"
      style={{
        background: def.svg ? `url("${svgDataUrl(def.svg)}") ${def.fill}` : def.fill,
        borderColor: def.stroke,
        aspectRatio: `${Math.max(def.width / def.height, 1.6)}`,
      }}
    />
  );
}

function Tile({ def }: { def: AssetDef }) {
  const favorites = useEditor((s) => s.favoriteAssets);
  const fav = favorites.includes(def.key);
  const place = () => {
    const s = useEditor.getState();
    const v = s.viewport;
    s.addAsset(def.key, { x: (s.viewSize.width / 2 - v.x) / v.scale, y: (s.viewSize.height / 2 - v.y) / v.scale });
  };
  return (
    <div className="tile-wrap">
      <button
        className="tile"
        title={`${def.name} — click to add, or drag onto the map`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-bm-asset', def.key);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={place}
        data-testid={`asset-${def.key}`}
      >
        <Preview def={def} />
        <span>{def.name}</span>
      </button>
      <button
        className={`fav${fav ? ' on' : ''}`}
        title={fav ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={fav}
        onClick={() => useEditor.getState().toggleFavorite(def.key)}
      >
        <Icon name="star" size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function AssetLibrary() {
  const [q, setQ] = useState('');
  const recent = useEditor((s) => s.recentAssets);
  const favorites = useEditor((s) => s.favoriteAssets);
  const results = useMemo(() => searchAssets(q), [q]);
  const toDefs = (keys: string[]) => keys.map((k) => ASSET_BY_KEY[k]).filter(Boolean);

  return (
    <div className="asset-library">
      <div className="search">
        <Icon name="search" size={16} />
        <input
          placeholder="Search objects (ramp, stairs, tree…)"
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
          <div className="tiles">{results.map((d) => <Tile key={d.key} def={d} />)}</div>
        ) : (
          <p className="empty">No objects match “{q}”. Try a simpler word like “sign” or “booth”.</p>
        )
      ) : (
        <>
          {favorites.length > 0 && (
            <section>
              <h4>Favorites</h4>
              <div className="tiles">{toDefs(favorites).map((d) => <Tile key={d.key} def={d} />)}</div>
            </section>
          )}
          {recent.length > 0 && (
            <section>
              <h4>Recently used</h4>
              <div className="tiles">{toDefs(recent).slice(0, 6).map((d) => <Tile key={d.key} def={d} />)}</div>
            </section>
          )}
          {ASSET_CATEGORIES.map((c) => (
            <section key={c}>
              <h4>{c}</h4>
              <div className="tiles">{ASSETS.filter((a) => a.category === c).map((d) => <Tile key={d.key} def={d} />)}</div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
