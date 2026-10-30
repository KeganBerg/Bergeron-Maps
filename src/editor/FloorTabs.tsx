import { useEffect, useState } from 'react';
import type { Floor } from '../model/types';
import { ConfirmDialog } from '../ui/Dialog';
import { CommitInput } from '../ui/fields';
import { Icon } from '../ui/icons';
import { useEditor } from './store';

export function FloorTabs() {
  const doc = useEditor((s) => s.doc)!;
  const floorId = useEditor((s) => s.floorId);
  const st = useEditor.getState;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState<Floor | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const openMenu = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ id, x: r.left, y: r.top });
  };
  const idx = (id: string) => doc.floors.findIndex((f) => f.id === id);

  return (
    <nav className="floor-tabs" aria-label="Floors">
      <div className="tabs-scroll" role="tablist">
        {doc.floors.map((f) => {
          const active = f.id === floorId;
          return (
            <div
              key={f.id}
              role="tab"
              aria-selected={active}
              className={`floor-tab${active ? ' active' : ''}`}
              onClick={() => st().setFloor(f.id)}
              onDoubleClick={() => setRenaming(f.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(f.id, e.currentTarget);
              }}
              data-testid={`floor-tab-${f.name}`}
              title="Double-click to rename. Right-click for more."
            >
              {renaming === f.id ? (
                <CommitInput value={f.name} autoFocus maxLength={40} className="tab-input"
                  onCommit={(v) => st().renameFloor(f.id, v)} onBlur={() => setRenaming(null)} data-testid="floor-rename" />
              ) : (
                <span>{f.name}</span>
              )}
              {active && renaming !== f.id && (
                <button className="icon-btn tiny" title="Floor options" aria-label="Floor options"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); openMenu(f.id, e.currentTarget.parentElement!); }}
                  data-testid="floor-menu">
                  <Icon name="more" size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn add-floor" onClick={() => st().addFloor()} data-testid="add-floor">
        <Icon name="plus" size={16} /> Add floor
      </button>

      {menu && (
        <div className="menu" style={{ left: menu.x, bottom: window.innerHeight - menu.y + 4 }} onPointerDown={(e) => e.stopPropagation()} role="menu">
          <button role="menuitem" onClick={() => { setRenaming(menu.id); setMenu(null); }}>Rename</button>
          <button role="menuitem" onClick={() => { st().duplicateFloor(menu.id); setMenu(null); }} data-testid="floor-duplicate">Duplicate floor</button>
          <button role="menuitem" disabled={idx(menu.id) === 0} onClick={() => { st().moveFloor(menu.id, -1); setMenu(null); }}>Move left</button>
          <button role="menuitem" disabled={idx(menu.id) === doc.floors.length - 1} onClick={() => { st().moveFloor(menu.id, 1); setMenu(null); }}>Move right</button>
          <hr />
          <button role="menuitem" className="danger-text" disabled={doc.floors.length <= 1}
            onClick={() => { setDeleting(doc.floors[idx(menu.id)]); setMenu(null); }} data-testid="floor-delete">Delete floor…</button>
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          danger
          confirmLabel="Delete floor"
          onCancel={() => setDeleting(null)}
          onConfirm={() => { st().deleteFloor(deleting.id); setDeleting(null); }}
          message={
            <p>
              This removes the floor and its {deleting.objects.length} object(s) from the map. You can undo with Ctrl+Z, or restore it later from
              version history.
            </p>
          }
        />
      )}
    </nav>
  );
}
