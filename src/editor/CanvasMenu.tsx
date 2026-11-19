import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { canHaveInterior, ASSET_BY_KEY } from '../assets/library';
import { typeKey, typePlural } from '../model/objectTypes';
import { currentFloor, editableIds, useEditor } from './store';
import { modLabel } from './useKeyboard';
import { downloadFloorImage, fitFloor, printFloor, zoomTo100, zoomToSelection } from './view';

type Item = { label: string; keys?: string; run: () => void; disabled?: boolean; danger?: boolean; testId?: string } | 'sep';

/**
 * The map's right-click menu, as in Figma and PowerPoint: what can be done with
 * the selection, or with the map when nothing is under the pointer.
 */
export function CanvasMenu({ x, y, id, onClose }: { x: number; y: number; id: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [focus, setFocus] = useState(-1);
  const st = useEditor.getState;
  const s = st();
  /**
   * Locked and hidden objects can't be clicked any more, so say where they went and
   * offer the way back (it used to be only the Layers tab, with no hint).
   */
  const setFlag = (ids: string[], key: 'locked' | 'hidden') => {
    st().setObjectFlag(ids, key, true);
    const what = ids.length > 1 ? `${ids.length} objects` : 'It';
    st().notify({
      tone: 'info',
      message: key === 'locked'
        ? `${what} locked, so ${ids.length > 1 ? 'they' : 'it'} can't be picked on the map. Unlock from the Layers tab or a right-click on empty map.`
        : `${what} hidden. Show ${ids.length > 1 ? 'them' : 'it'} again from the Layers tab or a right-click on empty map.`,
      action: { label: key === 'locked' ? 'Unlock' : 'Show', run: () => st().setObjectFlag(ids, key, false) },
    });
  };
  const floor = currentFloor(s)!;
  const sel = s.selection;
  const target = id ? floor.objects.find((o) => o.id === id) : undefined;
  const lockedHere = floor.objects.filter((o) => o.locked).map((o) => o.id);
  const hiddenHere = floor.objects.filter((o) => o.hidden).map((o) => o.id);

  const items: Item[] = [];
  if (sel.length && target) {
    const sameType = editableIds(floor, floor.objects.filter((o) => typeKey(o) === typeKey(target)).map((o) => o.id)).length;
    const def = target.kind === 'asset' ? ASSET_BY_KEY[target.assetKey] : undefined;
    items.push(
      { label: 'Cut', keys: `${modLabel}X`, run: () => st().cut() },
      { label: 'Copy', keys: `${modLabel}C`, run: () => st().copy(), testId: 'menu-copy' },
      { label: 'Paste', keys: `${modLabel}V`, run: () => st().paste(), disabled: !s.clipboard },
      { label: 'Duplicate', keys: `${modLabel}D`, run: () => st().duplicate(), testId: 'menu-duplicate' },
      { label: 'Delete', keys: 'Del', run: () => st().deleteSelection(), danger: true, testId: 'menu-delete' },
      'sep',
      { label: 'Bring to front', keys: `${modLabel}Shift+]`, run: () => st().reorder('front'), testId: 'menu-front' },
      { label: 'Bring forward', keys: `${modLabel}]`, run: () => st().reorder('forward') },
      { label: 'Send backward', keys: `${modLabel}[`, run: () => st().reorder('backward') },
      { label: 'Send to back', keys: `${modLabel}Shift+[`, run: () => st().reorder('back'), testId: 'menu-back' },
      'sep',
      { label: `Select all ${typePlural(target).toLowerCase().replace(/^ev /, 'EV ').replace(/^vip /, 'VIP ')} (${sameType})`, run: () => st().selectSameType(target.id), testId: 'menu-select-type' },
      { label: 'Zoom to selection', keys: 'Shift+2', run: zoomToSelection },
      'sep',
      { label: sel.length > 1 ? 'Lock these' : 'Lock', run: () => setFlag(sel, 'locked'), testId: 'menu-lock' },
      { label: sel.length > 1 ? 'Hide these' : 'Hide', run: () => setFlag(sel, 'hidden'), testId: 'menu-hide' },
    );
    if (def && canHaveInterior(def) && !floor.interiorOf && sel.length === 1) {
      items.push('sep', { label: 'Go inside', run: () => st().enterBuilding(target.id), testId: 'menu-enter' });
    }
  } else {
    items.push(
      { label: 'Paste', keys: `${modLabel}V`, run: () => st().paste(), disabled: !s.clipboard, testId: 'menu-paste' },
      { label: 'Select all', keys: `${modLabel}A`, run: () => st().selectAll(), disabled: !floor.objects.length, testId: 'menu-select-all' },
      { label: 'Find on map', keys: `${modLabel}F`, run: () => window.dispatchEvent(new CustomEvent('bm:find')), testId: 'menu-find' },
      ...(lockedHere.length || hiddenHere.length ? ['sep' as const] : []),
      ...(lockedHere.length ? [{ label: `Unlock all on this floor (${lockedHere.length})`, run: () => st().setObjectFlag(lockedHere, 'locked', false), testId: 'menu-unlock-all' }] : []),
      ...(hiddenHere.length ? [{ label: `Show hidden objects (${hiddenHere.length})`, run: () => st().setObjectFlag(hiddenHere, 'hidden', false), testId: 'menu-show-all' }] : []),
      'sep',
      { label: 'Fit floor to screen', keys: 'Shift+1', run: fitFloor },
      { label: 'Zoom to 100%', keys: `${modLabel}0`, run: zoomTo100 },
      'sep',
      { label: 'Save floor as image', run: () => void downloadFloorImage(), disabled: !floor.objects.length, testId: 'menu-image' },
      { label: 'Print or save as PDF', run: () => void printFloor(), disabled: !floor.objects.length, testId: 'menu-print' },
      'sep',
      { label: 'Keyboard shortcuts', keys: '?', run: () => window.dispatchEvent(new CustomEvent('bm:shortcuts')), testId: 'menu-shortcuts' },
    );
  }
  const actionable = items.map((it, i) => (it !== 'sep' && !it.disabled ? i : -1)).filter((i) => i >= 0);

  // Keep the menu on screen: flip it left or up when it would run past the edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x,
      top: y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y,
    });
  }, [x, y]);

  // Closes on a press anywhere else, on scroll or resize, and on Escape. Arrow keys and Enter work in it.
  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'Escape') onClose();
      else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const at = actionable.indexOf(focus);
        const next = k === 'ArrowDown' ? actionable[(at + 1) % actionable.length] : actionable[(at - 1 + actionable.length) % actionable.length];
        setFocus(next);
      } else if (k === 'Enter' && focus >= 0) {
        const it = items[focus];
        if (it !== 'sep') {
          onClose();
          it.run();
        }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('keydown', key, true);
    };
  });

  return (
    <div className="menu canvas-menu" ref={ref} style={pos} role="menu" aria-label="Map actions" data-testid="canvas-menu"
      onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i): ReactNode =>
        it === 'sep' ? (
          <hr key={i} />
        ) : (
          <button key={i} role="menuitem" disabled={it.disabled} className={`${it.danger ? 'danger-text' : ''}${focus === i ? ' focused' : ''}`}
            data-testid={it.testId} onMouseEnter={() => setFocus(i)}
            onClick={() => {
              onClose();
              it.run();
            }}>
            <span>{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
