import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent } from 'react';
import { ASSET_BY_KEY, ASSETS, type AssetDef } from '../assets/library';
import { boxesIntersect, objectBox, unionBoxes } from '../model/geometry';
import { itemIds, type DropSpot, type TreeItem } from '../model/layerTree';
import type { Floor, MapObject, SpaceObject } from '../model/types';

export type { DropSpot };
import { spaceVariant } from '../render/MapObjects';
import { CommitInput } from '../ui/fields';
import { Icon } from '../ui/icons';
import { previewUrl } from './AssetLibrary';
import { objectDisplayName } from './CanvasStage';
import { editableIds, useEditor } from './store';

/** Height of one object row. Fixed so long lists can be windowed. */
export const ROW_H = 28;
/** Rows shown before the list scrolls on its own. */
const VISIBLE_ROWS = 14;
/** Extra rows drawn above and below the visible window so fast scrolling doesn't flash. */
const OVERSCAN = 6;

const spaceDefs = new Map<string, AssetDef | undefined>();
function spaceDef(o: SpaceObject) {
  const v = spaceVariant(o);
  if (!spaceDefs.has(v)) spaceDefs.set(v, ASSETS.find((a) => a.creates === 'space' && (a.variant ?? 'standard') === v));
  return spaceDefs.get(v);
}

function ObjectIcon({ o }: { o: MapObject }) {
  let src: string | undefined;
  if (o.kind === 'space') {
    const d = spaceDef(o);
    src = d && previewUrl(d);
  } else if (o.kind === 'asset' && o.imageSrc) {
    return <Icon name="image" size={14} />;
  } else if (o.kind === 'asset') {
    const d = ASSET_BY_KEY[o.assetKey];
    src = d && previewUrl(d);
  } else {
    return <Icon name="text" size={14} />;
  }
  return src ? <img src={src} alt="" draggable={false} /> : <Icon name="shapes" size={14} />;
}

/** The words a rename box starts with: the number for a space, otherwise its name. */
function renameValue(o: MapObject) {
  if (o.kind === 'space') return o.label;
  if (o.kind === 'text') return o.text;
  return o.name || ASSET_BY_KEY[o.assetKey]?.name || '';
}

/** Pans (without zooming) so the selection is on screen when it was picked off-screen from the list. */
function revealOnCanvas(floor: Floor, ids: string[]) {
  const s = useEditor.getState();
  const set = new Set(ids);
  const box = unionBoxes(floor.objects.filter((o) => set.has(o.id)).map(objectBox));
  if (!box) return;
  const v = s.viewport;
  const view = { x: -v.x / v.scale, y: -v.y / v.scale, width: s.viewSize.width / v.scale, height: s.viewSize.height / v.scale };
  if (boxesIntersect(box, view)) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  s.setViewport({ ...v, x: s.viewSize.width / 2 - cx * v.scale, y: s.viewSize.height / 2 - cy * v.scale });
}

/** Why a list row can't be selected on the canvas, or null when it can. */
function blockedReason(floor: Floor, it: TreeItem): string | null {
  const ids = itemIds(it);
  if (editableIds(floor, ids).length) return null;
  const objs = floor.objects.filter((o) => ids.includes(o.id));
  const layer = floor.layers.find((l) => l.id === objs[0]?.layerId);
  if (layer?.locked) return `“${layer.name}” is locked. Unlock the layer to select what’s on it.`;
  if (layer && !layer.visible) return `“${layer.name}” is hidden. Show the layer to select what’s on it.`;
  if (objs.some((o) => o.locked)) return 'This is locked. Click its lock to unlock it, then select it.';
  return 'This is hidden. Click its eye to show it, then select it.';
}

interface ListProps {
  floor: Floor;
  layerId: string;
  layerOff: boolean;
  items: TreeItem[];
  selection: ReadonlySet<string>;
  /** Key of the row to scroll into view (the canvas selection). */
  revealKey: string | null;
  openRows: ReadonlySet<string>;
  toggleRow(rowId: string): void;
  anchor: { current: { layerId: string; key: string } | null };
  drag: { current: string[] | null };
  drop: DropSpot | null;
  setDrop(d: DropSpot | null): void;
  /** Call right after selecting from the list, so the panel doesn't jump to it. */
  markListSelect(): void;
}

/** One layer's objects: a windowed list, so 2,000 spaces cost the same as 20. */
export function ObjectList(props: ListProps) {
  const { items, revealKey } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const height = Math.max(1, Math.min(items.length, VISIBLE_ROWS)) * ROW_H;

  useEffect(() => {
    const el = ref.current;
    if (!el || !revealKey) return;
    const i = items.findIndex((it) => it.key === revealKey);
    if (i < 0) return;
    const y = i * ROW_H;
    if (y < el.scrollTop || y + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, y - el.clientHeight / 2 + ROW_H / 2);
      setTop(el.scrollTop);
    }
    // Only when the reveal target changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  const testId = `objects-${props.floor.layers.find((l) => l.id === props.layerId)?.name}`;
  if (!items.length) return <div className="obj-empty" data-testid={testId}>Nothing on this layer yet.</div>;

  const start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((top + height) / ROW_H) + OVERSCAN);
  return (
    <div
      className="obj-list"
      ref={ref}
      role="group"
      style={{ height }}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      data-testid={testId}
    >
      <div style={{ height: items.length * ROW_H, position: 'relative' }}>
        {items.slice(start, end).map((it, i) => (
          <ObjectRow
            key={it.key}
            {...props}
            index={start + i}
            item={it}
            renaming={renaming === it.key}
            setRenaming={setRenaming}
            style={{ position: 'absolute', top: (start + i) * ROW_H, left: 0, right: 0, height: ROW_H }}
          />
        ))}
      </div>
    </div>
  );
}

function ObjectRow(props: ListProps & { item: TreeItem; index: number; style: CSSProperties; renaming: boolean; setRenaming(k: string | null): void }) {
  const { floor, layerId, item: it, index, items, selection, drop, renaming } = props;
  const st = useEditor.getState;
  const ids = itemIds(it);
  const objs = it.kind === 'obj' ? [it.o] : floor.objects.filter((o) => ids.includes(o.id));
  const picked = ids.filter((id) => selection.has(id)).length;
  const isSel = picked > 0 && picked === ids.length;
  const allHidden = objs.every((o) => o.hidden);
  const allLocked = objs.every((o) => o.locked);
  const name = it.kind === 'row' ? it.title : objectDisplayName(it.o);
  const dropHere = drop && drop.key === it.key ? ` drop-${drop.side}` : '';

  const onClick = (e: MouseEvent) => {
    if (renaming) return;
    const reason = blockedReason(floor, it);
    if (reason) {
      st().notify({ tone: 'info', message: reason });
      return;
    }
    const anchor = props.anchor.current;
    if (e.shiftKey && anchor && anchor.layerId === layerId) {
      const a = items.findIndex((x) => x.key === anchor.key);
      if (a >= 0) {
        const [lo, hi] = a < index ? [a, index] : [index, a];
        const range = items.slice(lo, hi + 1).flatMap(itemIds);
        st().select(range, { additive: e.ctrlKey || e.metaKey });
        props.markListSelect();
        revealOnCanvas(floor, range);
        return;
      }
    }
    props.anchor.current = { layerId, key: it.key };
    const inRow = it.kind === 'obj' && it.rowId ? it.rowId : null;
    if (e.ctrlKey || e.metaKey) {
      if (inRow) st().enterRow(inRow);
      const sel = st().selection;
      if (isSel) st().select(sel.filter((id) => !ids.includes(id)));
      else st().select(ids, { additive: true });
      props.markListSelect();
      return;
    }
    st().enterRow(inRow);
    st().select(ids);
    props.markListSelect();
    revealOnCanvas(floor, ids);
  };

  const onDragStart = (e: DragEvent) => {
    const sel = st().selection;
    const moving = isSel ? sel : ids;
    props.drag.current = moving;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${moving.length} object${moving.length === 1 ? '' : 's'}`);
  };
  const onDragOver = (e: DragEvent) => {
    if (!props.drag.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const side = e.clientY - r.top < r.height / 2 ? 'above' : 'below';
    if (drop?.key !== it.key || drop.side !== side) props.setDrop({ key: it.key, side });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const moving = props.drag.current;
    const side = drop?.key === it.key && drop.side !== 'into' ? drop.side : 'above';
    props.drag.current = null;
    props.setDrop(null);
    if (!moving) return;
    // Above a row means above its topmost space; below it, under its lowest one.
    const anchorId = it.kind === 'row' ? (side === 'above' ? it.top : it.bottom) : it.o.id;
    st().placeObjects(moving, layerId, { id: anchorId, side });
  };

  const toggle = (key: 'hidden' | 'locked', on: boolean) => (e: MouseEvent) => {
    e.stopPropagation();
    st().setObjectFlag(ids, key, !on);
  };

  const remove = (e: MouseEvent) => {
    e.stopPropagation();
    const many = isSel && st().selection.length > ids.length ? st().selection : ids;
    st().deleteObjects(many);
    st().notify({
      tone: 'info',
      message: many.length === 1 ? `Deleted ${name}.` : `Deleted ${many.length} objects.`,
      action: { label: 'Undo', run: () => st().undo() },
    });
  };

  const cls = [
    'obj-row',
    isSel ? 'selected' : picked ? 'partial' : '',
    allHidden || props.layerOff ? 'is-hidden' : '',
    it.depth ? 'child' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls + dropHere}
      style={props.style}
      role="treeitem"
      aria-selected={isSel}
      aria-expanded={it.kind === 'row' ? props.openRows.has(it.rowId) : undefined}
      draggable={!renaming}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => drop?.key === it.key && props.setDrop(null)}
      onDrop={onDrop}
      onDragEnd={() => { props.drag.current = null; props.setDrop(null); }}
      data-testid={`obj-${name}`}
    >
      {it.kind === 'row' ? (
        <button
          className="icon-btn tiny twisty"
          title={props.openRows.has(it.rowId) ? 'Hide the spaces in this row' : 'Show the spaces in this row'}
          onClick={(e) => { e.stopPropagation(); props.toggleRow(it.rowId); }}
        >
          <Icon name={props.openRows.has(it.rowId) ? 'down' : 'chevronRight'} size={16} strokeWidth={2.2} />
        </button>
      ) : (
        <span className="twisty-gap" />
      )}
      <span className="obj-icon">{it.kind === 'row' ? <Icon name="rows" size={14} /> : <ObjectIcon o={it.o} />}</span>
      {renaming && it.kind === 'obj' ? (
        <CommitInput
          className="obj-name-input"
          value={renameValue(it.o)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onCommit={(v) => st().renameObject(it.o.id, v)}
          onBlur={() => props.setRenaming(null)}
          aria-label={it.o.kind === 'space' ? 'Space number' : 'Name'}
        />
      ) : (
        <span
          className="obj-name"
          title={it.kind === 'obj' ? `${name}. Double-click to rename` : name}
          onDoubleClick={(e) => { if (it.kind === 'obj') { e.stopPropagation(); props.setRenaming(it.key); } }}
        >
          {name}
        </span>
      )}
      {it.kind === 'row' && <span className="count">{ids.length}</span>}
      <span className="obj-actions">
        {it.kind === 'obj' && (
          <button className="icon-btn tiny" title="Rename" onClick={(e) => { e.stopPropagation(); props.setRenaming(it.key); }}>
            <Icon name="text" size={12} />
          </button>
        )}
        <button className={`icon-btn tiny${allHidden ? ' on' : ''}`} title={allHidden ? 'Show' : 'Hide'} aria-pressed={allHidden} onClick={toggle('hidden', allHidden)}>
          <Icon name={allHidden ? 'eyeOff' : 'eye'} size={13} />
        </button>
        <button className={`icon-btn tiny${allLocked ? ' on' : ''}`} title={allLocked ? 'Unlock' : 'Lock'} aria-pressed={allLocked} onClick={toggle('locked', allLocked)}>
          <Icon name={allLocked ? 'lock' : 'unlock'} size={13} />
        </button>
        <button className="icon-btn tiny" title="Delete" onClick={remove}>
          <Icon name="trash" size={12} />
        </button>
      </span>
    </div>
  );
}
