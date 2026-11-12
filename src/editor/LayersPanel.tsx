import { useEffect, useMemo, useRef, useState } from 'react';
import { layerObjectCount } from '../model/layers';
import type { Layer } from '../model/types';
import { ConfirmDialog } from '../ui/Dialog';
import { CommitInput } from '../ui/fields';
import { Icon } from '../ui/icons';
import { layerItems } from '../model/layerTree';
import { ObjectList, type DropSpot } from './LayerTree';
import { currentFloor, useEditor } from './store';

// Which layers and rows are open survives switching sidebar tabs.
const openLayersMemo = new Set<string>();
const openRowsMemo = new Set<string>();

function useOpenSet(memo: Set<string>) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(memo));
  const update = (fn: (s: Set<string>) => void) =>
    setOpen((prev) => {
      const next = new Set(prev);
      fn(next);
      memo.clear();
      for (const k of next) memo.add(k);
      return next;
    });
  return [open, update] as const;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function LayersPanel() {
  const floor = useEditor((s) => currentFloor(s))!;
  const active = useEditor((s) => s.activeLayer);
  const selection = useEditor((s) => s.selection);
  const st = useEditor.getState;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Layer | null>(null);
  const [moveTo, setMoveTo] = useState<string>('');
  const [openLayers, updateLayers] = useOpenSet(openLayersMemo);
  const [openRows, updateRows] = useOpenSet(openRowsMemo);
  const enteredRowId = useEditor((s) => s.enteredRowId);
  const anchor = useRef<{ layerId: string; key: string } | null>(null);
  const drag = useRef<string[] | null>(null);
  const [drop, setDrop] = useState<DropSpot | null>(null);
  const fromList = useRef<string[] | null>(null);
  const [revealKey, setRevealKey] = useState<string | null>(null);

  const selSet = useMemo(() => new Set(selection), [selection]);
  const selectedLayers = new Set(floor.objects.filter((o) => selSet.has(o.id)).map((o) => o.layerId));
  const topDown = [...floor.layers].reverse();

  // Selecting on the canvas opens the layer (and row) that holds it and scrolls its row into view.
  useEffect(() => {
    if (fromList.current === selection) return;
    if (!selection.length) return;
    const first = floor.objects.find((o) => o.id === selection[0]);
    if (!first) return;
    updateLayers((s) => { s.add(first.layerId); });
    const rowId = first.kind === 'space' ? first.rowId : undefined;
    if (rowId && enteredRowId === rowId) updateRows((s) => { s.add(rowId); });
    setRevealKey(rowId && enteredRowId !== rowId && floor.rows[rowId] ? `row:${rowId}` : first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const items = useMemo(() => {
    const m = new Map<string, ReturnType<typeof layerItems>>();
    for (const l of floor.layers) if (openLayers.has(l.id) && l.role !== 'background') m.set(l.id, layerItems(floor, l.id, openRows));
    return m;
  }, [floor, openLayers, openRows]);

  const toggleOpen = (id: string) => updateLayers((s) => { if (s.has(id)) s.delete(id); else s.add(id); });

  const askDelete = (l: Layer) => {
    if (layerObjectCount(floor, l.id) === 0) {
      st().deleteLayer(l.id, null);
      return;
    }
    setMoveTo(floor.layers.find((x) => x.id !== l.id && x.role !== 'background')?.id ?? '');
    setDeleting(l);
  };

  return (
    <div className="layers-panel">
      <div className="panel-row">
        <span className="muted">New objects go to</span>
        <select
          value={active}
          onChange={(e) => st().setActiveLayer(e.target.value)}
          data-testid="active-layer"
          title="Automatic puts spaces, landmarks and labels on their matching layers"
        >
          <option value="auto">Automatic (by type)</option>
          {topDown.filter((l) => l.role !== 'background').map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <ul className="layer-list" role="tree" aria-label="Layers" data-testid="layer-list">
        {topDown.map((l, i) => {
          const count = layerObjectCount(floor, l.id);
          const isActive = active === l.id;
          const hasObjects = l.role !== 'background';
          const isOpen = hasObjects && openLayers.has(l.id);
          return (
            <li key={l.id} className="layer-item" role="treeitem" aria-expanded={hasObjects ? isOpen : undefined}>
            <div
              className={`layer${isActive ? ' active' : ''}${!l.visible ? ' hidden' : ''}${drop?.key === `layer:${l.id}` ? ' drop-into' : ''}`}
              onClick={() => {
                if (l.role === 'background') return;
                st().setActiveLayer(l.id);
                updateLayers((s) => { s.add(l.id); });
              }}
              onDragOver={(e) => {
                if (!drag.current || l.role === 'background') return;
                e.preventDefault();
                if (drop?.key !== `layer:${l.id}`) setDrop({ key: `layer:${l.id}`, side: 'into' });
              }}
              onDragLeave={() => drop?.key === `layer:${l.id}` && setDrop(null)}
              onDrop={(e) => {
                e.preventDefault();
                const moving = drag.current;
                drag.current = null;
                setDrop(null);
                if (!moving) return;
                st().placeObjects(moving, l.id, null);
                updateLayers((s) => { s.add(l.id); });
              }}
              data-testid={`layer-${l.name}`}
            >
              {hasObjects ? (
                <button className="icon-btn tiny twisty" title={isOpen ? 'Hide this layer’s objects' : 'Show this layer’s objects'} aria-label={isOpen ? 'Collapse layer' : 'Expand layer'}
                  onClick={(e) => { e.stopPropagation(); toggleOpen(l.id); }} data-testid={`expand-${l.name}`}>
                  <Icon name={isOpen ? 'down' : 'chevronRight'} size={18} strokeWidth={2.2} />
                </button>
              ) : (
                <span className="twisty-gap" />
              )}
              <button className="icon-btn" title={l.visible ? 'Hide layer' : 'Show layer'} aria-pressed={!l.visible}
                onClick={(e) => { e.stopPropagation(); st().toggleLayer(l.id, 'visible'); }}>
                <Icon name={l.visible ? 'eye' : 'eyeOff'} size={16} />
              </button>
              <button className={`icon-btn${l.locked ? ' on' : ''}`} title={l.locked ? 'Unlock layer' : 'Lock layer'} aria-pressed={l.locked}
                onClick={(e) => { e.stopPropagation(); st().toggleLayer(l.id, 'locked'); }} data-testid={`lock-${l.name}`}>
                <Icon name={l.locked ? 'lock' : 'unlock'} size={16} />
              </button>
              {renaming === l.id ? (
                <CommitInput
                  className="layer-name-input"
                  value={l.name}
                  autoFocus
                  onCommit={(v) => st().renameLayer(l.id, v)}
                  onBlur={() => setRenaming(null)}
                />
              ) : (
                <span className="layer-name" onDoubleClick={() => setRenaming(l.id)} title={`${l.name}. Double-click to rename`}>
                  <span className="ellipsis">{l.name}</span>
                  {selectedLayers.has(l.id) && <span className="sel-dot" title="Contains the selected object" />}
                </span>
              )}
              <span className="count" title={`${count} object${count === 1 ? '' : 's'}`}>{count}</span>
              <span className="layer-actions">
                <button className="icon-btn" title="Move layer up" disabled={i === 0}
                  onClick={(e) => { e.stopPropagation(); st().shiftLayer(l.id, 1); }}>
                  <Icon name="up" size={14} />
                </button>
                <button className="icon-btn" title="Move layer down" disabled={i === topDown.length - 1}
                  onClick={(e) => { e.stopPropagation(); st().shiftLayer(l.id, -1); }}>
                  <Icon name="down" size={14} />
                </button>
                <button className="icon-btn" title="Rename layer" onClick={(e) => { e.stopPropagation(); setRenaming(l.id); }}>
                  <Icon name="text" size={14} />
                </button>
                <button className="icon-btn" title="Delete layer" disabled={floor.layers.length <= 1}
                  onClick={(e) => { e.stopPropagation(); askDelete(l); }}>
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
            {isOpen && (
              <ObjectList
                floor={floor}
                layerId={l.id}
                layerOff={!l.visible}
                items={items.get(l.id) ?? []}
                selection={selSet}
                revealKey={revealKey}
                openRows={openRows}
                toggleRow={(rowId) => updateRows((s) => { if (s.has(rowId)) s.delete(rowId); else s.add(rowId); })}
                anchor={anchor}
                drag={drag}
                drop={drop}
                setDrop={setDrop}
                markListSelect={() => { fromList.current = useEditor.getState().selection; }}
              />
            )}
            </li>
          );
        })}
      </ul>
      <button className="btn small" onClick={() => st().addLayer()} data-testid="add-layer">
        <Icon name="plus" size={14} /> New layer
      </button>
      <p className="hint">Click a layer to see what’s on it. Drag objects to change their order or move them to another layer. Shift or Ctrl-click to pick several. Locked things can’t be selected or moved on the map, and hidden things aren’t shown.</p>

      <BackgroundSection />

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          danger={!moveTo}
          confirmLabel={moveTo ? 'Delete layer and move objects' : 'Delete layer and its objects'}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            st().deleteLayer(deleting.id, moveTo || null);
            setDeleting(null);
          }}
          message={
            <>
              <p>This layer has {layerObjectCount(floor, deleting.id)} object(s). What should happen to them?</p>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} data-testid="delete-layer-target">
                {floor.layers.filter((l) => l.id !== deleting.id).map((l) => (
                  <option key={l.id} value={l.id}>Move them to “{l.name}”</option>
                ))}
                <option value="">Delete them too</option>
              </select>
              <p className="hint">You can undo this with Ctrl+Z.</p>
            </>
          }
        />
      )}
    </div>
  );
}

function BackgroundSection() {
  const floor = useEditor((s) => currentFloor(s))!;
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = floor.background;
  const bgLayer = floor.layers.find((l) => l.id === bg?.layerId);
  const st = useEditor.getState;

  const onFile = loadBackgroundFile;

  return (
    <section className="bg-section">
      <h4>Background image</h4>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-testid="bg-file"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {!bg ? (
        <>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14} /> Upload site plan or aerial photo
          </button>
          <p className="hint">Only use images you have the right to use. Maps work fine without one.</p>
        </>
      ) : (
        <div className="bg-controls">
          <p className="muted ellipsis" title={bg.fileName}>{bg.fileName ?? 'Image'}</p>
          <label>
            Opacity
            <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity}
              onChange={(e) => st().previewGesture((_d, f) => { if (f.background) f.background.opacity = Number(e.target.value); })}
              onPointerDown={() => st().beginGesture()}
              onPointerUp={() => st().endGesture()}
              onKeyUp={() => st().endGesture()}
              onKeyDown={() => st().beginGesture()} />
          </label>
          <div className="btn-row">
            <button className="btn small" onClick={() => bgLayer && st().toggleLayer(bgLayer.id, 'locked')} data-testid="bg-lock">
              <Icon name={bgLayer?.locked ? 'unlock' : 'lock'} size={14} /> {bgLayer?.locked ? 'Unlock to move or resize' : 'Lock'}
            </button>
            <button className="btn small" onClick={() => bgLayer && st().toggleLayer(bgLayer.id, 'visible')}>
              <Icon name={bgLayer?.visible ? 'eyeOff' : 'eye'} size={14} /> {bgLayer?.visible ? 'Hide' : 'Show'}
            </button>
            <button className="btn small" onClick={() => fileRef.current?.click()}>Replace</button>
            <button className="btn small" onClick={() => st().setBackground(null)}>Remove</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Reads an image file and sets it as the current floor's background. */
export function loadBackgroundFile(file: File | undefined) {
  const st = useEditor.getState;
  const bg = currentFloor(st())?.background;
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    st().notify({ tone: 'error', message: 'That file isn’t an image. Use a PNG, JPG or WebP site plan or aerial photo.' });
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    st().notify({ tone: 'error', message: 'That image is larger than 15 MB. Please use a smaller or compressed copy.' });
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => st().notify({ tone: 'error', message: 'The image couldn’t be read. Please try another file.' });
  reader.onload = () => {
    const src = String(reader.result);
    const img = new Image();
    img.onload = () => {
      const s = st();
      const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      const v = s.viewport;
      const cx = (s.viewSize.width / 2 - v.x) / v.scale;
      const cy = (s.viewSize.height / 2 - v.y) / v.scale;
      const keep = bg ? { x: bg.x, y: bg.y, width: bg.width, height: (bg.width * height) / width, opacity: bg.opacity } : null;
      s.setBackground({ src, fileName: file.name, ...(keep ?? { x: cx - width / 2, y: cy - height / 2, width, height, opacity: 0.6 }) });
      s.notify({ tone: 'success', message: bg ? 'Background image replaced.' : 'Background image added and locked so it won’t move by accident.' });
    };
    img.onerror = () => st().notify({ tone: 'error', message: 'This image format isn’t supported. Try PNG or JPG.' });
    img.src = src;
  };
  reader.readAsDataURL(file);
}
