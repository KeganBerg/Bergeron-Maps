import Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Label, Layer, Line, Rect, Shape, Stage, Tag, Text, Transformer } from 'react-konva';
import { ASSET_BY_KEY } from '../assets/library';
import { duplicateSpaceIds } from '../model/duplicates';
import { objectBox, normalizeRotation, unionBoxes } from '../model/geometry';
import { snapMove, snapToGrid, type Guide } from '../model/snapping';
import { simplifyStroke } from '../model/shape';
import { DEFAULT_ROW } from '../model/rows';
import type { Box, Floor, MapObject } from '../model/types';
import { BackgroundShape, LayerObjects } from '../render/MapObjects';
import { PanZoomTracker, wheelView } from '../render/panZoom';
import { fitViewport, floorBounds } from '../render/viewport';
import { MAP_PALETTE } from '../theme';
import { currentFloor, useEditor } from './store';

const DRAG_THRESHOLD = 3;
const ALL_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'];
const COARSE = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

type Gesture =
  | { type: 'pan'; startX: number; startY: number; vx: number; vy: number }
  // A finger on an object it hasn't selected yet: a tap selects it, a drag pans.
  | { type: 'touch-tap'; id: string; additive: boolean }
  // A finger with the asset or text tool: places on lift, so a pinch doesn't drop things.
  | { type: 'touch-place'; at: { x: number; y: number } }
  | {
      type: 'move';
      startWorld: { x: number; y: number };
      startPos: Map<string, { x: number; y: number }>;
      box: Box;
      others: Box[];
      started: boolean;
      additiveClickId?: string;
    }
  | { type: 'marquee'; start: { x: number; y: number }; additive: boolean }
  | { type: 'row'; start: { x: number; y: number } }
  | { type: 'cut'; mode: 'free' | 'grid'; start: { x: number; y: number }; points: number[] };

export function objectDisplayName(o: MapObject): string {
  if (o.kind === 'space') return `Space ${o.label || '(no number)'}`;
  if (o.kind === 'text') return o.text || 'Text';
  return o.name || ASSET_BY_KEY[o.assetKey]?.name || 'Object';
}

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const gesture = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [cutDraft, setCutDraft] = useState<number[] | null>(null);
  const [rowDraft, setRowDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [bgSelected, setBgSelected] = useState(false);
  const touch = useRef(new PanZoomTracker());
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

  // Track container size.
  useEffect(() => {
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
    return () => ro.disconnect();
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
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (t.down(e.pointerId, at(e), view())) cancelGesture.current();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const v = t.move(e.pointerId, at(e));
      if (v) useEditor.getState().setViewport(v);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') t.up(e.pointerId, view());
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
    return () => {
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
  }, [selection]);

  // Attach the transformer to the selected nodes.
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const nodes = bgSelected
      ? [stage.findOne('#__background')].filter(Boolean)
      : (selection.map((id) => stage.findOne(`#${id}`)).filter(Boolean) as Konva.Node[]);
    tr.nodes(nodes as Konva.Node[]);
    tr.getLayer()?.batchDraw();
  }, [selection, doc, floorId, bgSelected]);

  if (!doc || !floor) return <div ref={containerRef} className="canvas" />;

  const toWorld = (p: { x: number; y: number }) => ({ x: (p.x - viewport.x) / viewport.scale, y: (p.y - viewport.y) / viewport.scale });
  const pointer = () => stageRef.current!.getPointerPosition() ?? { x: 0, y: 0 };

  const objFromTarget = (t: Konva.Node): string | null => {
    const g = t.hasName('obj') ? t : t.findAncestor('.obj');
    return g ? g.id() : null;
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const st = useEditor.getState();
    const evt = e.evt;
    const isTouch = evt.pointerType === 'touch';
    // Second finger: the pinch has taken over (see the listeners above).
    if (isTouch && touch.current.pinching) return;
    if (e.target.findAncestor('Transformer')) return; // resize/rotate handles
    const p = pointer();
    const w = toWorld(p);
    const v = st.viewport;
    // Keep getting moves (and the release) when the mouse leaves the canvas mid-drag.
    if (!isTouch) stageRef.current?.content.setPointerCapture?.(evt.pointerId);

    if (evt.button === 1 || spaceHeld || st.tool.type === 'hand') {
      if (evt.button === 1) evt.preventDefault(); // no browser autoscroll
      if (isTouch) {
        touch.current.startPan(evt.pointerId, v);
        return;
      }
      gesture.current = { type: 'pan', startX: p.x, startY: p.y, vx: v.x, vy: v.y };
      setPanning(true);
      return;
    }
    if (evt.button !== 0) return;

    if (st.tool.type === 'row') {
      gesture.current = { type: 'row', start: w };
      setRowDraft({ a: w, b: w });
      return;
    }
    if (isTouch && (st.tool.type === 'asset' || st.tool.type === 'text')) {
      touch.current.startPan(evt.pointerId, v);
      gesture.current = { type: 'touch-place', at: w };
      return;
    }
    if (st.tool.type === 'asset') {
      st.addAsset(st.tool.key, w);
      return;
    }
    if (st.tool.type === 'cut') {
      const start = st.tool.mode === 'grid' ? { x: snapToGrid(w.x, gridSize), y: snapToGrid(w.y, gridSize) } : w;
      gesture.current = { type: 'cut', mode: st.tool.mode, start, points: [start.x, start.y] };
      setCutDraft([start.x, start.y]);
      return;
    }
    if (st.tool.type === 'text') {
      st.addText(w);
      return;
    }

    const additive = evt.shiftKey || evt.ctrlKey || evt.metaKey;
    const id = objFromTarget(e.target);
    if (isTouch && !(id && st.selection.includes(id)) && !(e.target.hasName('background') && bgSelected)) {
      // On a phone a finger drag over the map pans it. Objects are moved by
      // tapping them first, then dragging. A tap selects as usual.
      touch.current.startPan(evt.pointerId, v);
      if (id) gesture.current = { type: 'touch-tap', id, additive };
      else if (e.target.hasName('background') && bgEditable) gesture.current = { type: 'touch-tap', id: '__background', additive };
      else gesture.current = { type: 'touch-tap', id: '', additive };
      return;
    }
    if (id) {
      const wasSelected = st.selection.includes(id);
      if (!(additive && wasSelected)) st.clickObject(id, { additive });
      const sel = useEditor.getState().selection;
      if (!sel.includes(id) && !additive) return;
      const f = currentFloor(useEditor.getState())!;
      const selSet = new Set(sel);
      const moving = f.objects.filter((o) => selSet.has(o.id));
      const hidden = new Set(f.layers.filter((l) => !l.visible).map((l) => l.id));
      gesture.current = {
        type: 'move',
        startWorld: w,
        startPos: new Map(moving.map((o) => [o.id, { x: o.x, y: o.y }])),
        box: unionBoxes(moving.map(objectBox))!,
        others: f.objects.filter((o) => !selSet.has(o.id) && !hidden.has(o.layerId)).map(objectBox),
        started: false,
        additiveClickId: additive && wasSelected ? id : undefined,
      };
      return;
    }
    if (e.target.hasName('background') && bgEditable) {
      st.clearSelection();
      setBgSelected(true);
      return;
    }
    setBgSelected(false);
    if (!additive) st.clearSelection();
    gesture.current = { type: 'marquee', start: w, additive };
  };

  const onPointerMove = () => {
    const g = gesture.current;
    if (!g || g.type === 'touch-tap' || g.type === 'touch-place') return;
    const p = pointer();
    const w = toWorld(p);
    const st = useEditor.getState();
    if (g.type === 'pan') {
      st.setViewport({ ...st.viewport, x: g.vx + p.x - g.startX, y: g.vy + p.y - g.startY });
    } else if (g.type === 'row') {
      setRowDraft({ a: g.start, b: w });
    } else if (g.type === 'cut') {
      if (g.mode === 'grid') {
        const b = { x: snapToGrid(w.x, gridSize), y: snapToGrid(w.y, gridSize) };
        g.points = [g.start.x, g.start.y, b.x, g.start.y, b.x, b.y, g.start.x, b.y];
      } else {
        const n = g.points.length;
        if (Math.hypot(w.x - g.points[n - 2], w.y - g.points[n - 1]) * viewport.scale >= 3) g.points.push(w.x, w.y);
      }
      setCutDraft([...g.points]);
    } else if (g.type === 'marquee') {
      setMarquee({
        x: Math.min(g.start.x, w.x),
        y: Math.min(g.start.y, w.y),
        width: Math.abs(w.x - g.start.x),
        height: Math.abs(w.y - g.start.y),
      });
    } else if (g.type === 'move') {
      const rawDx = w.x - g.startWorld.x;
      const rawDy = w.y - g.startWorld.y;
      if (!g.started) {
        if (Math.hypot(rawDx, rawDy) * viewport.scale < DRAG_THRESHOLD) return;
        g.started = true;
        g.additiveClickId = undefined;
        st.beginGesture();
      }
      const snap = snapMove(st.snapMode, g.box, rawDx, rawDy, g.others, {
        threshold: 6 / viewport.scale,
        gridSize,
      });
      setGuides(snap.guides);
      st.previewGesture((_d, f) => {
        for (const o of f.objects) {
          const s = g.startPos.get(o.id);
          if (s) {
            o.x = s.x + snap.dx;
            o.y = s.y + snap.dy;
          }
        }
      });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const st = useEditor.getState();
    if (!g) return;
    if (g.type === 'pan') setPanning(false);
    else if (g.type === 'touch-place') {
      if (touch.current.moved) return;
      if (st.tool.type === 'asset') st.addAsset(st.tool.key, g.at);
      else if (st.tool.type === 'text') st.addText(g.at);
    } else if (g.type === 'touch-tap') {
      if (touch.current.moved) return; // it was a pan or a pinch
      if (g.id === '__background') {
        st.clearSelection();
        setBgSelected(true);
      } else if (g.id) st.clickObject(g.id, { additive: g.additive });
      else {
        setBgSelected(false);
        st.clearSelection();
      }
    } else if (g.type === 'cut') {
      setCutDraft(null);
      const ring = g.mode === 'free' ? simplifyStroke(g.points, 2 / viewport.scale) : g.points;
      const xs = ring.filter((_, i) => i % 2 === 0);
      const ys = ring.filter((_, i) => i % 2 === 1);
      const big = (Math.max(...xs) - Math.min(...xs)) * viewport.scale > 4 && (Math.max(...ys) - Math.min(...ys)) * viewport.scale > 4;
      if (ring.length >= 6 && big) st.cutWith(ring);
    } else if (g.type === 'marquee') {
      if (marquee && marquee.width * viewport.scale > 2) st.selectInBox(marquee, g.additive);
      setMarquee(null);
    } else if (g.type === 'move') {
      if (g.started) st.endGesture();
      else if (g.additiveClickId) st.clickObject(g.additiveClickId, { additive: true });
      setGuides([]);
    } else if (g.type === 'row') {
      const draft = rowDraft;
      setRowDraft(null);
      if (!draft) return;
      const dx = draft.b.x - draft.a.x;
      const dy = draft.b.y - draft.a.y;
      const len = Math.hypot(dx, dy);
      const pitch = DEFAULT_ROW.spaceWidth + DEFAULT_ROW.gap;
      if (len * viewport.scale < 10) {
        st.openRowDialog({ x: draft.a.x + DEFAULT_ROW.spaceWidth / 2, y: draft.a.y + DEFAULT_ROW.spaceDepth / 2, rotation: 0 });
        return;
      }
      let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (st.snapMode !== 'free') rot = Math.round(rot / 15) * 15;
      const r = (rot * Math.PI) / 180;
      const count = Math.max(1, Math.round(len / pitch));
      st.openRowDialog(
        {
          x: draft.a.x + Math.cos(r) * (DEFAULT_ROW.spaceWidth / 2) - Math.sin(r) * (DEFAULT_ROW.spaceDepth / 2),
          y: draft.a.y + Math.sin(r) * (DEFAULT_ROW.spaceWidth / 2) + Math.cos(r) * (DEFAULT_ROW.spaceDepth / 2),
          rotation: normalizeRotation(rot),
        },
        count,
      );
    }
  };

  endGesture.current = onPointerUp;
  /** A second finger landed: undo whatever the first finger started. */
  cancelGesture.current = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.type === 'move' && g.started) useEditor.getState().cancelGesture();
    setGuides([]);
    setMarquee(null);
    setCutDraft(null);
    setRowDraft(null);
    setPanning(false);
  };

  const onDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const id = objFromTarget(e.target);
    if (!id) return;
    const st = useEditor.getState();
    const o = floor.objects.find((x) => x.id === id);
    if (o?.kind === 'space' && o.rowId && st.enteredRowId !== o.rowId) {
      st.enterRow(o.rowId);
      st.select([id]);
      return;
    }
    window.dispatchEvent(new CustomEvent('bm:edit-label'));
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
    const updates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number }>();
    for (const n of tr.nodes()) {
      const o = floor.objects.find((x) => x.id === n.id());
      if (!o) continue;
      updates.set(o.id, {
        x: n.x(),
        y: n.y(),
        width: Math.max(2, o.width * Math.abs(n.scaleX())),
        height: Math.max(2, o.height * Math.abs(n.scaleY())),
        rotation: normalizeRotation(n.rotation()),
      });
      n.scale({ x: 1, y: 1 });
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
  const selBox = unionBoxes(selected.map(objectBox));
  const chip = selected.length === 1 ? objectDisplayName(selected[0]) : selected.length > 1 ? chipForMany(floor, selected) : null;
  const invScale = 1 / viewport.scale;
  const draftInfo = rowDraft && rowPreview(rowDraft);

  return (
    <div
      ref={containerRef}
      className="canvas"
      style={{ cursor }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid="canvas"
    >
      <Stage
        ref={stageRef}
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
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          {(snapMode === 'grid' || (tool.type === 'cut' && tool.mode === 'grid')) && <GridLines viewport={viewport} size={viewSize} grid={gridSize} />}
          {floor.layers.map((layer) => {
            if (!layer.visible) return null;
            const listening = !layer.locked;
            return (
              <Group key={layer.id} listening={listening}>
                {floor.background?.layerId === layer.id && (
                  <BackgroundShape
                    bg={floor.background}
                    listening={bgEditable}
                    draggable={bgSelected}
                    onMoved={(x, y) => useEditor.getState().updateBackground({ x, y })}
                  />
                )}
                <LayerObjects objects={floor.objects.filter((o) => o.layerId === layer.id)} curbs={floor.objects} objProps={(o) => ({ duplicate: duplicates.has(o.id) })} />
              </Group>
            );
          })}
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
    </div>
  );
}

function rowPreview(d: { a: { x: number; y: number }; b: { x: number; y: number } }) {
  const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
  return { count: Math.max(1, Math.round(len / (DEFAULT_ROW.spaceWidth + DEFAULT_ROW.gap))) };
}

function chipForMany(floor: Floor, objs: MapObject[]): string {
  const rowIds = new Set(objs.map((o) => (o.kind === 'space' ? o.rowId : undefined)));
  if (rowIds.size === 1 && !rowIds.has(undefined)) {
    const spaces = objs as Extract<MapObject, { kind: 'space' }>[];
    const sorted = [...spaces].sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    const spec = floor.rows[sorted[0].rowId!];
    if (spec && spaces.length === spec.count) return `Row ${sorted[0].label}–${sorted[sorted.length - 1].label} (${spaces.length} spaces)`;
  }
  return `${objs.length} selected`;
}

/** After resizing/rotating a whole row, keep its saved settings in step with what is drawn. */
function syncRowSpecs(f: Floor, updates: Map<string, { width: number; height: number; x: number; y: number }>) {
  for (const spec of Object.values(f.rows)) {
    const spaces = f.objects
      .filter((o): o is Extract<MapObject, { kind: 'space' }> => o.kind === 'space' && o.rowId === spec.id)
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
    if (!spaces.length || !spaces.every((s) => updates.has(s.id))) continue;
    spec.spaceWidth = Math.round(spaces[0].width * 10) / 10;
    spec.spaceDepth = Math.round(spaces[0].height * 10) / 10;
    if (spaces.length > 1) {
      const d = Math.hypot(spaces[1].x - spaces[0].x, spaces[1].y - spaces[0].y);
      spec.gap = Math.max(0, Math.round((d - spaces[0].width) * 10) / 10);
    }
  }
}

function GridLines({ viewport, size, grid }: { viewport: { x: number; y: number; scale: number }; size: { width: number; height: number }; grid: number }) {
  let step = grid;
  while (step * viewport.scale < 8) step *= 5;
  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        const x0 = Math.floor(-viewport.x / viewport.scale / step) * step;
        const y0 = Math.floor(-viewport.y / viewport.scale / step) * step;
        const x1 = (size.width - viewport.x) / viewport.scale;
        const y1 = (size.height - viewport.y) / viewport.scale;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += step) {
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
        }
        for (let y = y0; y <= y1; y += step) {
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1 / viewport.scale;
        ctx.stroke();
      }}
    />
  );
}
