import { useEffect, useMemo, useRef, useState } from 'react';
import { objectBox } from '../model/geometry';
import { searchMap, type SearchHit } from '../model/search';
import { fitViewport } from '../render/viewport';
import { Icon } from '../ui/icons';
import { useEditor } from './store';

/** Takes the editor to one object: its floor, selected on its own, zoomed in on. */
export function goToObject(h: Pick<SearchHit, 'floorId' | 'object'>) {
  const st = useEditor.getState();
  if (st.floorId !== h.floorId) st.setFloor(h.floorId);
  const o = h.object;
  if (o.kind === 'space' && o.rowId) st.enterRow(o.rowId);
  st.select([o.id]);
  const s = useEditor.getState();
  s.setViewport(fitViewport(objectBox(o), s.viewSize, Math.min(s.viewSize.width, s.viewSize.height) / 3, 3));
}

/**
 * Find on map (Ctrl/⌘+F): the same search employees use in the viewer, over every
 * floor and building, so "B16" or "Stairway 2" jumps straight to it in the editor.
 */
export function FindBar({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)!;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchMap(doc, q).slice(0, 12), [doc, q]);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => setActive(0), [q]);
  const pick = (h: SearchHit | undefined) => {
    if (!h) return;
    goToObject(h);
    onClose();
  };
  return (
    <div className="find-bar" data-testid="find-bar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="find-input">
        <Icon name="search" size={16} />
        <input ref={ref} value={q} placeholder="Find a space, object or label on this map" aria-label="Find on map" data-testid="find-input"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { setActive((a) => Math.min(hits.length - 1, a + 1)); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setActive((a) => Math.max(0, a - 1)); e.preventDefault(); }
            else if (e.key === 'Enter') { pick(hits[active]); e.preventDefault(); }
          }} />
        <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      {q.trim() && (
        <ul className="find-results" role="listbox" data-testid="find-results">
          {hits.length === 0 && <li className="none">Nothing on this map is called “{q.trim()}”.</li>}
          {hits.map((h, i) => (
            <li key={`${h.floorId}:${h.object.id}`} role="option" aria-selected={i === active}>
              <button className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => pick(h)}>
                <span>{h.title}</span>
                <span className="muted">{h.floorName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
