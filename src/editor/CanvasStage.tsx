import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Group, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import { ASSET_BY_KEY } from '../assets/library';
import { duplicateSpaceIds } from '../model/duplicates';
import { objectBox, normalizeRotation, unionBoxes } from '../model/geometry';
import { snapToGrid, type Guide } from '../model/snapping';
import type { Box, Floor, MapObject } from '../model/types';
import { PanZoomTracker, wheelView } from '../render/panZoom';
import { fitViewport, floorBounds } from '../render/viewport';
import { hasInterior } from '../model/interiors';
import { InteriorMarkers } from '../render/InteriorMarkers';
import { MAP_PALETTE } from '../theme';
import { bandOf, canBend, CurveHandles } from './CurveHandles';
import { curvePx, reshapedFields } from '../model/curve';
import { currentFloor, useEditor } from './store';
import { CanvasMenu } from './CanvasMenu';
import { InlineLabelEditor } from './InlineLabelEditor';
import { FindBar } from './FindBar';
import { registerMapLayer } from './view';
import { canvasPointerHandlers, type Gesture } from './canvasPointer';
import { FloorObjects, GridLines } from './CanvasLayers';
import { chipForMany, rowPreview, syncRowSpecs } from './canvasHelpers';
import Konva from 'konva';
import '../render/konvaSetup';

const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'];
const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
/** A finger held this long without moving opens the map menu (phones and tablets have no right-click). */
export const LONG_PRESS_MS = 500;


export function objectDisplayName(o: MapObject): string {
  if (o.kind === 'space') return `Space ${o.label || '(no number)'}`;
  if (o.kind === 'text') return o.text || 'Text';
  return o.name || ASSET_BY_KEY[o.assetKey]?.name || 'Object';
}

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const objLayerRef = useRef<Konva.Layer | null>(null);
  const gesture = useRef<Gesture | null>(null);
  /** A text label just placed with the mouse, to start typing in once the button is let go. */
  const pendingEdit = useRef<string | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [cutDraft, setCutDraft] = useState<number[] | null>(null);
  const [rowDraft, setRowDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [bgSelected, setBgSelected] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string | null; touch?: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  /** The last two presses on the map, so a drag followed by a quick click doesn't count as a double-click. */
  const presses = useRef<{ id: string | null; moved: boolean; picked?: boolean }[]>([]);
  useEffect(() => {
    const open = () => setFinding(true);
    window.addEventListener('bm:find', open);
    return () => window.removeEventListener('bm:find', open);
  }, []);
  const touch = useRef(new PanZoomTracker());
  /** A finger that may become a long press, and whether the last one did. */
  const longPress = useRef<{ timer: number; id: number; x: number; y: number } | null>(null);
  /** "Select an area" from the menu: the next finger drag draws a selection box instead of panning. */
  const boxArmed = useRef(false);
  const openMenuAt = useRef<(clientX: number, clientY: number) => void>(() => {});
  // Latest versions of the gesture handlers, for the window listeners above.
  const endGesture = useRef<() => void>(() => {});
  const cancelGesture = useRef<() => void>(() => {});

  const doc = useEditor((s) => s.doc);
  const floorId = useEditor((s) => s.floorId);
  const selection = useEditor((s) => s.selection);
  const viewport = useEditor((s) => s.viewport);
  const viewSize = useEditor((s) => s.viewSize);
  const tool = useEditor((s) => s.tool);
  const snapMode = useEditor((s) => s.snapMode);
  const floor = currentFloor({ doc, floorId });

  const duplicates = useMemo(() => (floor ? duplicateSpaceIds(floor) : new Set<string>()), [floor]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const gridSize = doc?.settings.gridSize ?? 10;
  const interiorIds = useMemo(() => new Set((doc?.floors ?? []).map((f) => f.interiorOf).filter((x): x is string => !!x)), [doc]);

  // Track container size. Measured before the first paint (layout effect), and the map
  // stays undrawn until then, so a big floor isn't drawn at the default size first.
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => useEditor.getState().setViewSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    const s = useEditor.getState();
    const size = { width: el.clientWidth, height: el.clientHeight };
    s.setViewSize(size);
    // Fit the floor to the real canvas size on open (on phones the canvas is much
    // smaller than the default size, so fitting earlier cut the map off).
    const f = currentFloor(s);
    if (f) s.setViewport(fitViewport(floorBounds(f), size));
    setMeasured(true);
    return () => ro.disconnect();
  }, []);

  // Escape in the middle of a drag, selection box, row or cut puts things back as
  // they were. It runs before the editor's own Escape (which would also drop the
  // selection), and only while a gesture is going.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !gesture.current || gesture.current.type === 'pan') return;
      cancelGesture.current();
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Space bar held = temporary hand tool (common in drawing apps).
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Fingers: pinch zooms (and pans with the midpoint) from anywhere, a drag on
  // empty map pans. Listens in the capture phase on the box so it sees every
  // finger before Konva does, and can stop a half-started drag when a second
  // finger lands. Wheel and trackpad are handled here too.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const t = touch.current;
    const at = (e: PointerEvent | WheelEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const view = () => useEditor.getState().viewport;
    const stopLongPress = () => {
      if (longPress.current) window.clearTimeout(longPress.current.timer);
      longPress.current = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      stopLongPress();
      if (t.down(e.pointerId, at(e), view())) {
        cancelGesture.current();
        return;
      }
      // Only a finger on the map itself, not on the menu, find bar or label box drawn over it.
      if (t.count !== 1 || (e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      const lp = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: 0 };
      lp.timer = window.setTimeout(() => {
        if (longPress.current !== lp) return;
        longPress.current = null;
        if (t.count !== 1 || t.moved) return;
        // The finger stays down, but it no longer pans the map or lifts as a tap.
        t.reset();
        openMenuAt.current(lp.x, lp.y);
      }, LONG_PRESS_MS);
      longPress.current = lp;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const v = t.move(e.pointerId, at(e));
      if (t.moved) stopLongPress();
      if (v) useEditor.getState().setViewport(v);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        stopLongPress();
        t.up(e.pointerId, view());
      }
      // A finger or button let go outside the canvas still ends the gesture.
      endGesture.current();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      st.setViewport(wheelView(st.viewport, e, at(e), el.clientHeight));
    };
    el.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    const arm = () => {
      boxArmed.current = true;
      useEditor.getState().notify({ tone: 'info', message: 'Drag a box over the map to select everything inside it.' });
    };
    window.addEventListener('bm:box-select', arm);
    return () => {
      stopLongPress();
      window.removeEventListener('bm:box-select', arm);
      t.reset();
      el.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Background deselects when it becomes locked/hidden or floor changes.
  const bgLayer = floor?.layers.find((l) => l.id === floor.background?.layerId);
  const bgEditable = !!(floor?.background && bgLayer && bgLayer.visible && !bgLayer.locked);
  useEffect(() => {
    if (!bgEditable) setBgSelected(false);
  }, [bgEditable, floorId]);
  useEffect(() => {
    if (selection.length) setBgSelected(false);
    // Typing on the map ends when the selection moves on.
    setEditing((id) => (id && selection.length === 1 && selection[0] === id ? id : null));
  }, [selection]);

  // A drag that leaves the map (over the sidebar or floor tabs) keeps tracking
  // the pointer, so a selection box or move follows it; letting go out there
  // is ended by the window pointerup listener above.
  const moveRef = useRef<() => void>(() => {});
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.type === 'pan' || containerRef.current?.contains(e.target as Node)) return;
      stageRef.current?.setPointersPositions(e);
      moveRef.current();
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  // Konva re-measures the whole selection every time any one selected object
  // changes, so moving 2,000 selected spaces did 2,000 x 2,000 measurements
  // (over a minute on a big lot). Outside a resize or rotate, gather those
  // into one re-measure after the change has been applied.
  useEffect(() => {
    const tr = trRef.current as (Konva.Transformer & { _transforming?: boolean }) | null;
    if (!tr) return;
    const update = tr.update.bind(tr);
    let queued = false;
    tr.update = () => {
      if (tr._transforming) return update();
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!tr.getStage()) return;
        update();
        tr.getLayer()?.batchDraw();
      });
    };
    return () => {
      tr.update = update;
    };
  }, [doc !== null]);

  // Attach the transformer to the selected nodes.
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    // One pass over the drawn objects: looking each selected id up separately
    // took seconds on big lots (select all on 2,000 spaces).
    const byId = new Map<string, Konva.Node>();
    if (!bgSelected && selection.length) for (const n of stage.find('.obj')) if (!byId.has(n.id())) byId.set(n.id(), n);
    const nodes = bgSelected
      ? [stage.findOne('#__background')].filter(Boolean)
      : (selection.map((id) => byId.get(id)).filter(Boolean) as Konva.Node[]);
    tr.nodes(nodes as Konva.Node[]);
    tr.getLayer()?.batchDraw();
  }, [selection, doc, floorId, bgSelected]);

  if (!doc || !floor) return <div ref={containerRef} className="canvas" />;

  const { toWorld, objFromTarget, onPointerDown, onPointerMove, onPointerUp } = canvasPointerHandlers({
    stageRef, objLayerRef, gesture, pendingEdit, presses, touch, boxArmed, moveRef, endGesture, cancelGesture, viewport, gridSize, spaceHeld, bgEditable, bgSelected, setBgSelected, marquee, setMarquee, rowDraft, setRowDraft, setCutDraft, setEditing, setGuides, setPanning,
  });

  const onDblClick = (e: Konva.KonvaEventObject<Event>) => {
    const id = objFromTarget(e.target);
    if (!id) return;
    const st = useEditor.getState();
    const o = floor.objects.find((x) => x.id === id);
    if (o?.kind === 'space' && o.rowId && st.enteredRowId !== o.rowId) {
      st.enterRow(o.rowId);
      st.select([id]);
      return;
    }
    // Double-clicking a building that has a floor plan goes inside it.
    if (o?.kind === 'asset' && !floor.interiorOf && doc && hasInterior(doc, o.id)) {
      st.enterBuilding(o.id);
      return;
    }
    // Type straight onto the map: a space's number, a label's words, an object's name.
    // With a finger the box would cover the neighbouring spaces, so a double tap uses the side panel instead.
    const [first, second] = presses.current;
    const realDouble = !!first && !!second && first.id === o?.id && second.id === o?.id && !first.moved && !second.moved;
    if (o && realDouble && e.type !== 'dbltap' && st.selection.length === 1 && st.selection[0] === o.id) setEditing(o.id);
    // A finger goes to the panel field only when the double tap began on what was already picked
    // alone: on a phone that opens the side panel, and quick taps that pick a row and then a
    // space in it (tap, double tap) also count as a second double tap.
    else if (e.type !== 'dbltap' || (realDouble && first.picked)) window.dispatchEvent(new CustomEvent('bm:edit-label'));
  };

  /** Picks what is under the pointer (unless it is already selected) and opens the map menu there. */
  const showMenu = (id: string | null, clientX: number, clientY: number, byTouch: boolean) => {
    const st = useEditor.getState();
    if (st.tool.type !== 'select') st.setTool({ type: 'select' });
    if (id && !st.selection.includes(id)) st.clickObject(id, { additive: false });
    else if (!id) st.clearSelection();
    boxArmed.current = false;
    setMenu({ x: clientX, y: clientY, id: id && useEditor.getState().selection.includes(id) ? id : null, touch: byTouch });
  };

  /** Right-click (and, on Android, a long press). */
  const onContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
    const byTouch = (e.evt as PointerEvent).pointerType === 'touch' || touch.current.count > 0;
    // A finger held still with the row or cut tool is the start of a slow drag (see openMenuAt).
    const tool = useEditor.getState().tool.type;
    if (byTouch && (tool === 'row' || tool === 'cut')) return;
    gesture.current = null;
    showMenu(objFromTarget(e.target), e.evt.clientX, e.evt.clientY, byTouch);
  };

  /** Press and hold with a finger: the same menu a right-click opens (iPhone and iPad send no right-click). */
  openMenuAt.current = (clientX, clientY) => {
    const st = useEditor.getState();
    // Holding still with the row or cut tool is the start of a slow drag, not a menu.
    if (st.tool.type === 'row' || st.tool.type === 'cut') return;
    cancelGesture.current();
    const stage = stageRef.current;
    const r = containerRef.current?.getBoundingClientRect();
    if (!stage || !r) return;
    const hit = objLayerRef.current?.getIntersection({ x: clientX - r.left, y: clientY - r.top });
    showMenu(hit ? objFromTarget(hit) : null, clientX, clientY, true);
  };

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const st = useEditor.getState();
    if (bgSelected) {
      const n = tr.nodes()[0];
      if (!n) return;
      st.updateBackground({ x: n.x(), y: n.y(), width: n.width() * n.scaleX(), height: n.height() * n.scaleY() });
      n.scale({ x: 1, y: 1 });
      return;
    }
    const updates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; skew?: number }>();
    for (const n of tr.nodes()) {
      const o = floor.objects.find((x) => x.id === n.id());
      if (!o) continue;
      const sx = Math.abs(n.scaleX());
      updates.set(o.id, {
        x: n.x(),
        y: n.y(),
        width: Math.max(2, o.width * sx),
        height: Math.max(2, o.height * Math.abs(n.scaleY())),
        rotation: normalizeRotation(n.rotation()),
        // An angled stall's lean stretches with its width.
        ...(o.kind === 'space' && o.skew !== undefined ? { skew: Math.round(o.skew * sx * 100) / 100 } : {}),
      });
      n.scale({ x: 1, y: 1 });
      // A bent curve stretches with its box, then the box is fitted round its band again.
      const u = updates.get(o.id)!;
      if (o.kind === 'asset' && o.curve && canBend(o)) {
        const next = { ...o, ...u };
        updates.set(o.id, { ...u, ...reshapedFields(next, curvePx(next, bandOf(next)), bandOf(next)) });
      }
    }
    st.commit((_d, f) => {
      for (const o of f.objects) {
        const u = updates.get(o.id);
        if (u) Object.assign(o, u);
      }
      syncRowSpecs(f as Floor, updates);
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-bm-asset')) e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    const key = e.dataTransfer.getData('application/x-bm-asset');
    if (!key) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    useEditor.getState().addAsset(key, toWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }));
  };

  const cursor = panning
    ? 'grabbing'
    : spaceHeld || tool.type === 'hand'
      ? 'grab'
      : tool.type === 'select'
        ? 'default'
        : 'crosshair';

  const selected = floor.objects.filter((o) => selectedSet.has(o.id));
  const editingObj = editing && selection.length === 1 && selection[0] === editing ? selected[0] : undefined;
  const selBox = unionBoxes(selected.map(objectBox));
  const chip = selected.length === 1 ? objectDisplayName(selected[0]) : selected.length > 1 ? chipForMany(floor, selected) : null;
  const invScale = 1 / viewport.scale;
  const draftInfo = rowDraft && rowPreview(rowDraft);

  return (
    <div
      ref={containerRef}
      className="canvas"
      role="region"
      aria-label="Map canvas"
      style={{ cursor }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // A press on the map never moves the keyboard focus (fields are left on pointerdown above).
      // A phone's copy-cat mousedown after a double tap took the focus straight back off the
      // panel field the double tap had just opened.
      onMouseDown={(e) => (e.target as HTMLElement).tagName === 'CANVAS' && e.preventDefault()}
      data-testid="canvas"
    >
      <Stage
        ref={stageRef}
        visible={measured}
        width={viewSize.width}
        height={viewSize.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDblClick={onDblClick}
        // A double tap does on a phone or tablet what a double click does with a mouse.
        onDblTap={onDblClick}
        onContextMenu={onContextMenu}
      >
        <Layer ref={(l) => { objLayerRef.current = l; registerMapLayer(l); }}>
          {(snapMode === 'grid' || (tool.type === 'cut' && tool.mode === 'grid')) && <GridLines viewport={viewport} size={viewSize} grid={gridSize} />}
          <FloorObjects floor={floor} duplicates={duplicates} bgEditable={bgEditable} bgSelected={bgSelected} />
          {!floor.interiorOf && <InteriorMarkers objects={floor.objects} ids={interiorIds} scale={viewport.scale} />}
        </Layer>
        <Layer>
          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio={false}
            ignoreStroke
            rotationSnaps={snapMode === 'free' ? [] : [0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={5}
            // Big, rounded handles on all 8 points plus rotation, padded away
            // from the object so thin things like walls still get separate handles.
            enabledAnchors={ALL_ANCHORS}
            anchorSize={COARSE ? 18 : 12}
            anchorCornerRadius={3}
            anchorStrokeWidth={1.5}
            padding={6}
            rotateAnchorOffset={COARSE ? 36 : 28}
            borderStroke={MAP_PALETTE.selection}
            borderStrokeWidth={2.5}
            anchorStroke={MAP_PALETTE.selection}
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox)}
            anchorDragBoundFunc={
              snapMode === 'grid'
                ? (_old, next) => {
                    const v = useEditor.getState().viewport;
                    const wx = snapToGrid((next.x - v.x) / v.scale, gridSize);
                    const wy = snapToGrid((next.y - v.y) / v.scale, gridSize);
                    return { x: wx * v.scale + v.x, y: wy * v.scale + v.y };
                  }
                : undefined
            }
            onTransformEnd={onTransformEnd}
          />
          {selected.length === 1 && canBend(selected[0]) && (
            <CurveHandles o={selected[0]} scale={viewport.scale} coarse={!!COARSE} />
          )}
          {guides.map((g, i) => (
            <Line
              key={i}
              points={g.orientation === 'vertical' ? [g.at, g.from, g.at, g.to] : [g.from, g.at, g.to, g.at]}
              stroke={g.kind === 'spacing' ? '#db2777' : '#f43f5e'}
              strokeWidth={invScale}
              dash={g.kind === 'center' ? [4 * invScale, 3 * invScale] : undefined}
              listening={false}
            />
          ))}
          {cutDraft && cutDraft.length >= 4 && (
            <Line points={cutDraft} closed fill="rgba(220,38,38,0.12)" stroke="#dc2626" strokeWidth={1.5 * invScale}
              dash={[5 * invScale, 4 * invScale]} listening={false} />
          )}
          {marquee && (
            <Rect {...marquee} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth={invScale} dash={[4 * invScale, 3 * invScale]} listening={false} />
          )}
          {draftInfo && (
            <Group listening={false}>
              <Line points={[rowDraft!.a.x, rowDraft!.a.y, rowDraft!.b.x, rowDraft!.b.y]} stroke="#2563eb" strokeWidth={2 * invScale} />
              <Label x={rowDraft!.b.x} y={rowDraft!.b.y} offsetY={-12 * invScale} scaleX={invScale} scaleY={invScale}>
                <Tag fill="#1e3a8a" cornerRadius={4} />
                <Text text={`${draftInfo.count} spaces`} padding={6} fill="#fff" fontSize={13} />
              </Label>
            </Group>
          )}
          {chip && selBox && !gesture.current && (
            // Name chip sits below the selection so it never covers the top handle or rotation knob.
            <Label x={selBox.x + selBox.width / 2} y={selBox.y + selBox.height} offsetY={-16} scaleX={invScale} scaleY={invScale} listening={false}>
              <Tag fill="#111827" cornerRadius={4} pointerDirection="up" pointerWidth={10} pointerHeight={6} opacity={0.9} />
              <Text text={chip} padding={6} fill="#fff" fontSize={12} />
            </Label>
          )}
        </Layer>
      </Stage>
      {finding && <FindBar onClose={() => setFinding(false)} />}
      {menu && <CanvasMenu {...menu} onClose={() => setMenu(null)} />}
      {editingObj && <InlineLabelEditor key={editingObj.id} o={editingObj} onClose={() => setEditing(null)} />}
    </div>
  );
}
