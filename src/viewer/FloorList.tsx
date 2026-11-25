import { useMemo } from 'react';
import { floorListing } from '../model/listing';
import { floorTitle } from '../model/interiors';
import type { Floor, MapDocument, MapObject } from '../model/types';
import { Icon } from '../ui/icons';
import { useT } from '../i18n/useLanguage';

/** The floor on screen as a list: places first, then every row of spaces. Picking one shows it on the map. */
export function FloorList({ doc, floor, onPick, onClose }: { doc: MapDocument; floor: Floor; onPick: (o: MapObject, title: string) => void; onClose: () => void }) {
  const t = useT();
  const groups = useMemo(() => floorListing(doc, floor, t.words), [doc, floor, t]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="dir-sheet floor-list" role="region" aria-label={t.listOf(floorTitle(doc, floor, t.words))} tabIndex={-1} data-testid="floor-list"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="dir-head">
        <div>
          <strong>{floorTitle(doc, floor, t.words)}</strong>
          <span className="muted">{count ? t.listCount(count) : t.listEmpty}</span>
        </div>
        <button className="icon-btn" aria-label={t.closeList} onClick={onClose} data-testid="list-close"><Icon name="close" /></button>
      </div>
      <div className="dir-list">
        {groups.map((g) => (
          <section key={g.title} className="list-group">
            <h2 className="list-group-title">{g.title}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i.object.id}>
                  <button className="dir-option" onClick={() => onPick(i.object, i.title)} data-testid="list-item">
                    <span>{i.title}</span>
                    {i.detail && <span className="muted">{i.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
