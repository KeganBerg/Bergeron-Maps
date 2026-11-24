import Konva from 'konva';
import { boxContains, objectBox, normalizeRotation, unionBoxes } from '../model/geometry';
import { snapMove, snapToGrid, type Guide } from '../model/snapping';
import { simplifyStroke, toLocal } from '../model/shape';
import { DEFAULT_ROW } from '../model/rows';
import type { Box, MapObject } from '../model/types';
import '../render/konvaSetup';
import { PanZoomTracker } from '../render/panZoom';
import { currentFloor, selectionBox, useEditor } from './store';
import type { Viewport } from './store';

type Ref<T> = React.MutableRefObject<T>;
type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

const DRAG_THRESHOLD = 3;
/**
 * Above this many selected objects, a drag moves the drawn objects directly and
 * saves the move once on release, instead of rebuilding the map on every mouse
 * move (about 0.7s per move with 6,000 spaces selected).
 */
const LIVE_DRAG_LIMIT = 150;

/** What a mouse, pen or finger press on the map is doing until it is let go. */
export type Gesture =
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
      /** Pressed on top of a selected object: a click (no drag) picks this object instead. */
      clickId?: string;
      /** Alt/Option held: the drag moves a copy and leaves the originals where they were. */
      altCopy?: boolean;
      copied?: boolean;
      /** What an Alt-drag copied from, selected again if the drag is called off. */
      originals?: string[];
      /** Big selections move the drawn objects directly while dragging (see LIVE_DRAG_LIMIT). */
      nodes?: Map<string, Konva.Node>;
      last?: { dx: number; dy: number };
    }
  | { type: 'marquee'; start: { x: number; y: number }; additive: boolean }
  | { type: 'row'; start: { x: number; y: number } }
  | { type: 'cut'; mode: 'free' | 'grid'; start: { x: number; y: number }; points: number[] };

/** The row being drawn with the row tool, from where the drag started to where it is now. */
export type RowDraft = { a: { x: number; y: number }; b: { x: number; y: number } };

/** The CanvasStage state and refs the pointer handlers read and change. */
export interface PointerContext {
  stageRef: React.RefObject<Konva.Stage>;
  objLayerRef: Ref<Konva.Layer | null>;
  gesture: Ref<Gesture | null>;
  /** A text label just placed with the mouse, to start typing in once the button is let go. */
  pendingEdit: Ref<string | null>;
  /** The last two presses on the map (double-click detection). */
  presses: Ref<{ id: string | null; moved: boolean; picked?: boolean }[]>;
  touch: Ref<PanZoomTracker>;
  /** "Select an area" from the menu: the next finger drag draws a selection box. */
  boxArmed: Ref<boolean>;
  /** Set here to the latest handlers, for CanvasStage's window listeners. */
  moveRef: Ref<() => void>;
  endGesture: Ref<() => void>;
  cancelGesture: Ref<() => void>;
  viewport: Viewport;
  gridSize: number;
  spaceHeld: boolean;
  bgEditable: boolean;
  bgSelected: boolean;
  setBgSelected: SetState<boolean>;
  marquee: Box | null;
  setMarquee: SetState<Box | null>;
  rowDraft: RowDraft | null;
  setRowDraft: SetState<RowDraft | null>;
  setCutDraft: SetState<number[] | null>;
  setEditing: SetState<string | null>;
  setGuides: SetState<Guide[]>;
  setPanning: SetState<boolean>;
}

/**
 * Pressing, dragging and letting go on the editor's map: select, move (with
 * snapping and Alt-copy), resize and rotate handles, selection boxes, drawing
 * rows and cuts, placing symbols and text, and panning. Called on every
 * render of CanvasStage, like handlers written inside it.
 */
export function canvasPointerHandlers(ctx: PointerContext) {
  const { stageRef, objLayerRef, gesture, pendingEdit, presses, touch, boxArmed, moveRef, endGesture, cancelGesture, viewport, gridSize, spaceHeld, bgEditable, bgSelected, setBgSelected, marquee, setMarquee, rowDraft, setRowDraft, setCutDraft, setEditing, setGuides, setPanning } = ctx;

  const toWorld = (p: { x: number; y: number }) => ({ x: (p.x - viewport.x) / viewport.scale, y: (p.y - viewport.y) / viewport.scale });
  const pointer = () => stageRef.current!.getPointerPosition() ?? { x: 0, y: 0 };

  const objFromTarget = (t: Konva.Node): string | null => {
    const g = t.hasName('obj') ? t : t.findAncestor('.obj');
    return g ? g.id() : null;
  };

  /**
   * The object to pick instead of the resize handle that was pressed, or null to
   * let the handle resize. The rotate handle always wins.
   */
  const handleFallThrough = (handle: Konva.Node, tr: Konva.Transformer): Konva.Node | null => {
    if (handle.name().includes('rotater') || !handle.hasName('_anchor')) return null;
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!stage || !pos) return null;
    // Where the handle is drawn. Its position is the corner it belongs to, which the
    // Transformer's padding pushes the drawn square away from, so measure the square.
    const r = handle.getClientRect();
    const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const size = tr.anchorSize();
    // The middle of the handle always resizes.
    if (Math.hypot(pos.x - c.x, pos.y - c.y) <= size * 0.3) return null;
    const hit = objLayerRef.current?.getIntersection(pos);
    const g = hit && (hit.hasName('obj') ? hit : hit.findAncestor('.obj'));
    if (!g || useEditor.getState().selection.includes(g.id())) return null;
    // Only a neighbour takes the press, never something the selection sits inside
    // (a building's outer walls, a zone, the lot boundary): inside a building every
    // handle is over the outer walls, so resizing there picked the walls instead.
    const st = useEditor.getState();
    const f = currentFloor(st);
    const under = f?.objects.find((o) => o.id === g.id());
    const sel = f && selectionBox(f, st.selection);
    if (under && sel && boxContains(objectBox(under), sel)) return null;
    // Keep the Transformer from starting a resize on the mouse/touch event that follows.
    tr.listening(false);
    const back = () => {
      tr.listening(true);
      window.removeEventListener('pointerup', back);
      window.removeEventListener('pointercancel', back);
    };
    window.addEventListener('pointerup', back);
    window.addEventListener('pointercancel', back);
    return g;
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const st = useEditor.getState();
    const evt = e.evt;
    const isTouch = evt.pointerType === 'touch';
    // Second finger: the pinch has taken over (see the listeners above).
    if (isTouch && touch.current.pinching) return;
    // Pressing the map leaves any panel field, as in design tools: otherwise a snap
    // menu or number box kept focus in some browsers, and Space, Delete or the
    // arrow keys went to it (Space even opened the menu) instead of the map.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body && focused.closest('input, select, textarea, button')) focused.blur();
    // The handles that bend a curved road do their own dragging.
    if (e.target.hasName('curve-handle')) return;
    let target: Konva.Node = e.target;
    const pressedId = objFromTarget(e.target);
    // picked: it was already the one thing selected when this press began.
    presses.current = [...presses.current.slice(-1), { id: pressedId, moved: false, picked: !!pressedId && st.selection.length === 1 && st.selection[0] === pressedId }];
    const tr = e.target.findAncestor('Transformer') as Konva.Transformer | null;
    if (tr) {
      // A resize handle sits half over the neighbor (often right on its number).
      // Pressing the outer part of a handle that covers another object picks that
      // object; only the handle's middle, or a handle over empty map, resizes.
      const under = handleFallThrough(e.target, tr);
      if (!under) return; // resize/rotate handles
      target = under;
    }
    const p = pointer();
    const w = toWorld(p);
    const v = st.viewport;
    // Keep getting moves (and the release) when the mouse leaves the canvas mid-drag.
    if (!isTouch) stageRef.current?.content.setPointerCapture?.(evt.pointerId);

    // "Select an area" from the press-and-hold menu: this finger draws the selection box.
    if (isTouch && boxArmed.current) {
      boxArmed.current = false;
      if (st.tool.type === 'select' && evt.button === 0) {
        setBgSelected(false);
        if (st.enteredRowId) st.select([]);
        else st.clearSelection();
        gesture.current = { type: 'marquee', start: w, additive: false };
        return;
      }
    }
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
      // Type the words straight away, as in other drawing tools, instead of finding the
      // side panel field to change "Label".
      // Opened on release: opened on the press, the press itself took the focus back off it.
      pendingEdit.current = useEditor.getState().selection[0] ?? null;
      return;
    }

    const additive = evt.shiftKey || evt.ctrlKey || evt.metaKey;
    const id = objFromTarget(target);
    if (isTouch && !(id && st.selection.includes(id)) && !(target.hasName('background') && bgSelected)) {
      // On a phone a finger drag over the map pans it. Objects are moved by
      // tapping them first, then dragging. A tap selects as usual.
      touch.current.startPan(evt.pointerId, v);
      if (id) gesture.current = { type: 'touch-tap', id, additive };
      else if (target.hasName('background') && bgEditable) gesture.current = { type: 'touch-tap', id: '__background', additive };
      else gesture.current = { type: 'touch-tap', id: '', additive };
      return;
    }
    // Pressing inside an object that is already selected drags it, even where
    // something else is drawn over it (a sidewalk, a zone, a road's paint, the
    // map photo) or where its own hit area is covered. A click without a drag
    // still picks whatever is on top.
    if (!additive && st.selection.length && !(id && st.selection.includes(id))) {
      const f = currentFloor(st)!;
      const usable = new Set(f.layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
      const selSet = new Set(st.selection);
      const under = f.objects.some((o) => selSet.has(o.id) && !o.locked && !o.hidden && usable.has(o.layerId) && insideBox(o, w));
      if (under) {
        const moving = f.objects.filter((o) => selSet.has(o.id) && !o.locked);
        gesture.current = {
          type: 'move',
          startWorld: w,
          startPos: new Map(moving.map((o) => [o.id, { x: o.x, y: o.y }])),
          box: unionBoxes(moving.map(objectBox))!,
          others: f.objects.filter((o) => !selSet.has(o.id) && !o.hidden && usable.has(o.layerId)).map(objectBox),
          started: false,
          clickId: id ?? undefined,
          altCopy: evt.altKey,
        };
        return;
      }
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
        others: f.objects.filter((o) => !selSet.has(o.id) && !o.hidden && !hidden.has(o.layerId)).map(objectBox),
        started: false,
        additiveClickId: additive && wasSelected ? id : undefined,
        altCopy: evt.altKey,
      };
      return;
    }
    if (target.hasName('background') && bgEditable) {
      st.clearSelection();
      setBgSelected(true);
      return;
    }
    setBgSelected(false);
    // Inside a row a selection box picks some of its spaces, so stay in the row
    // (a plain click on empty map still leaves it, on release).
    if (!additive) {
      if (st.enteredRowId) st.select([]);
      else st.clearSelection();
    }
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
        g.clickId = undefined;
        if (g.altCopy) {
          // Copy in place first, then drag the copies (one undo step for both, as in Figma).
          const originals = [...g.startPos.keys()];
          const copies = st.duplicateInPlace();
          if (copies.length) {
            const f = currentFloor(useEditor.getState())!;
            const ids = new Set(copies);
            g.startPos = new Map(f.objects.filter((o) => ids.has(o.id)).map((o) => [o.id, { x: o.x, y: o.y }]));
            const left = new Set(originals);
            g.others = [...g.others, ...f.objects.filter((o) => left.has(o.id)).map(objectBox)];
            g.copied = true;
            g.originals = originals;
          }
        }
        st.beginGesture();
        if (g.startPos.size > LIVE_DRAG_LIMIT && stageRef.current) {
          g.nodes = new Map();
          for (const n of stageRef.current.find('.obj')) if (g.startPos.has(n.id()) && !g.nodes.has(n.id())) g.nodes.set(n.id(), n);
        }
      }
      const snap = snapMove(st.snapMode, g.box, rawDx, rawDy, g.others, {
        threshold: 6 / viewport.scale,
        gridSize,
      });
      setGuides(snap.guides);
      if (g.nodes) {
        g.last = { dx: snap.dx, dy: snap.dy };
        for (const [id, n] of g.nodes) {
          const s = g.startPos.get(id)!;
          n.position({ x: s.x + snap.dx, y: s.y + snap.dy });
        }
        stageRef.current?.batchDraw();
        return;
      }
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
    const edit = pendingEdit.current;
    pendingEdit.current = null;
    if (edit) setEditing(edit);
    const g = gesture.current;
    gesture.current = null;
    const st = useEditor.getState();
    if (!g) return;
    if ((g.type === 'move' && g.started) || g.type === 'pan' || (g.type === 'touch-tap' && touch.current.moved)) {
      const last = presses.current[presses.current.length - 1];
      if (last) last.moved = true;
    }
    if (g.type === 'pan') setPanning(false);
    else if (g.type === 'touch-place') {
      if (touch.current.moved) return;
      if (st.tool.type === 'asset') st.addAsset(st.tool.key, g.at);
      else if (st.tool.type === 'text') {
        st.addText(g.at);
        // No box to type in on the map with a finger: go to the label field in the side panel.
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('bm:edit-label')));
      }
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
      else if (!g.additive) st.clearSelection();
      setMarquee(null);
    } else if (g.type === 'move') {
      if (g.started && g.nodes) {
        const d = g.last ?? { dx: 0, dy: 0 };
        st.previewGesture((_d, f) => {
          for (const o of f.objects) {
            const s = g.startPos.get(o.id);
            if (s) {
              o.x = s.x + d.dx;
              o.y = s.y + d.dy;
            }
          }
        });
        st.endGesture({ mergeWithPrevious: g.copied });
      } else if (g.started) st.endGesture({ mergeWithPrevious: g.copied });
      else if (g.additiveClickId) st.clickObject(g.additiveClickId, { additive: true });
      else if (g.clickId) st.clickObject(g.clickId, { additive: false });
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

  moveRef.current = onPointerMove;
  endGesture.current = onPointerUp;
  /** A second finger landed: undo whatever the first finger started. */
  cancelGesture.current = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.type === 'move' && g.started) {
      const st = useEditor.getState();
      st.cancelGesture();
      // An Alt-drag made its copies before moving them: take those away too, and
      // leave the originals selected (the copies used to stay, stacked on top).
      if (g.copied) {
        st.undo();
        useEditor.setState((s) => ({ future: s.future.slice(1) }));
        if (g.originals) st.select(g.originals);
      }
      // Directly moved objects go back where they were.
      if (g.nodes) {
        for (const [id, n] of g.nodes) n.position(g.startPos.get(id)!);
        stageRef.current?.batchDraw();
      }
    }
    setGuides([]);
    setMarquee(null);
    setCutDraft(null);
    setRowDraft(null);
    setPanning(false);
  };

  return { toWorld, pointer, objFromTarget, onPointerDown, onPointerMove, onPointerUp };
}

/** Is the world point inside the object's (rotated) box? */
function insideBox(o: MapObject, w: { x: number; y: number }): boolean {
  const [lx, ly] = toLocal(o, w.x, w.y);
  return lx >= 0 && ly >= 0 && lx <= o.width && ly <= o.height;
}
