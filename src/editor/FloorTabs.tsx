import { useEffect, useState } from 'react';
import type { Floor } from '../model/types';
import { ConfirmDialog } from '../ui/Dialog';
import { CommitInput } from '../ui/fields';
import { Icon } from '../ui/icons';
import { buildingName, buildingOf, floorGroup } from '../model/interiors';
import { currentFloor, useEditor } from './store';
import { floorColor } from '../theme';

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
  const cur = currentFloor({ doc, floorId })!;
  const inside = buildingOf(doc, cur);
  const group = floorGroup(doc, cur);
  const idx = (id: string) => group.findIndex((f) => f.id === id);
  const lastSite = !inside && group.length <= 1;

  return (
    <nav className={`floor-tabs${inside ? ' inside' : ''}`} aria-label="Floors">
      {inside && (
        <div className="building-crumb">
          <button className="btn" onClick={() => st().exitBuilding()} data-testid="exit-building" title={`Back to ${inside.floor.name}`}>
            <Icon name="back" size={16} /> {inside.floor.name}
          </button>
          <span className="crumb-name" data-testid="building-crumb">{buildingName(inside.building)}</span>
        </div>
      )}
      <div className="tabs-scroll" role="tablist">
        {group.map((f, i) => {
          const active = f.id === floorId;
          return (
            <div
              key={f.id}
              role="tab"
              aria-selected={active}
              className={`floor-tab${active ? ' active' : ''}`}
              style={{ ['--floor-color' as string]: floorColor(i) }}
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
                <>
                  <span className="floor-dot" aria-hidden="true" />
                  <span>{f.name}</span>
                </>
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
          <button role="menuitem" disabled={idx(menu.id) === group.length - 1} onClick={() => { st().moveFloor(menu.id, 1); setMenu(null); }}>Move right</button>
          <hr />
          <button role="menuitem" className="danger-text" disabled={lastSite}
            onClick={() => { setDeleting(group[idx(menu.id)]); setMenu(null); }} data-testid="floor-delete">
            {inside && group.length <= 1 ? 'Delete floor plan…' : 'Delete floor…'}
          </button>
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
              This removes the floor and its {deleting.objects.length} object(s) from the map
              {!deleting.interiorOf && doc.floors.some((f) => f.interiorOf && deleting.objects.some((o) => o.id === f.interiorOf))
                ? ', along with the floor plans of the buildings on it'
                : ''}
              . You can undo with Ctrl+Z, or restore it later from version history.
            </p>
          }
        />
      )}
    </nav>
  );
}
