import { useEffect, useRef, useState } from 'react';
import { mapThumbnail, type Thumbnail } from '../model/thumbnail';
import type { MapRepository } from '../storage/repository';

/** Pictures already made this visit, by map id and revision, so going back to Maps doesn't load maps again. */
const made = new Map<string, Thumbnail | null>();

/**
 * The small picture on a map's card (model/thumbnail.ts). The map is only
 * loaded once its card scrolls into view, so a company with many sites
 * doesn't load every map to open the Maps page.
 */
export function MapThumb({ repo, id, revision }: { repo: MapRepository; id: string; revision: number }) {
  const key = `${id}:${revision}`;
  const [thumb, setThumb] = useState<Thumbnail | null | undefined>(made.get(key));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (made.has(key)) return setThumb(made.get(key));
    const el = box.current;
    if (!el) return;
    let alive = true;
    const load = () => {
      repo.getMap(id)
        .then((doc) => { const t = doc ? mapThumbnail(doc) : null; made.set(key, t); if (alive) setThumb(t); })
        .catch(() => { if (alive) setThumb(null); });
    };
    if (!('IntersectionObserver' in window)) { load(); return () => { alive = false; }; }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { seen.disconnect(); load(); }
    }, { rootMargin: '200px' });
    seen.observe(el);
    return () => { alive = false; seen.disconnect(); };
  }, [key]);

  return (
    <div className="map-thumb" ref={box} aria-hidden="true">
      {thumb && (
        <svg viewBox={thumb.viewBox.join(' ')} preserveAspectRatio="xMidYMid meet">
          {thumb.shapes.map((s, i) => (
            <rect key={i} x={s.x - s.width / 2} y={s.y - s.height / 2} width={s.width} height={s.height} fill={s.fill} fillOpacity={s.opacity}
              stroke={s.outline ? '#64748b' : undefined} strokeWidth={s.outline ? 0.75 : undefined} vectorEffect="non-scaling-stroke"
              transform={s.rotation ? `rotate(${s.rotation} ${s.x} ${s.y})` : undefined} />
          ))}
        </svg>
      )}
    </div>
  );
}
