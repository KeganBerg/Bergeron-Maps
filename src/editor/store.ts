import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { ASSET_BY_KEY, canHaveInterior, isShapeable, shapeSourceFor } from '../assets/library';
import { alignObjects, distributeObjects, type AlignOp, type DistributeOp, type Moves } from '../model/align';
import { copySelection, preparePaste, renumberSpaces, type ClipboardData } from '../model/clipboard';
import { createFloor, nextFloorName } from '../model/factory';
import { copyName, duplicateFloor, duplicateFloorWithIds, removeFloorReferences } from '../model/floors';
import { buildingOf, copyInteriors, createInteriorFloor, floorGroup, interiorFloors, interiorsOfObjects, siteFloors } from '../model/interiors';
import { fitViewport, floorBounds } from '../render/viewport';
import { boxesIntersect, objectBox, unionBoxes } from '../model/geometry';
import { reorderObjects, type OrderOp } from '../model/order';
import { cutForObject } from '../model/shape';
import { newId } from '../model/ids';
import { deleteLayer, resolveTargetLayer, roleForObject, shiftLayer } from '../model/layers';
import { highestNumber } from '../model/numbering';
import { buildRowSpaces, normalizeRows, regenerateRow, SPACE_FILL, type RowAnchor } from '../model/rows';
import type { SnapMode } from '../model/snapping';
import type { AssetObject, BackgroundImage, Box, Floor, Layer, MapDocument, MapObject, RowSpec, SpaceObject } from '../model/types';

export type Tool = { type: 'select' } | { type: 'hand' } | { type: 'row' } | { type: 'text' } | { type: 'asset'; key: string } | { type: 'cut'; mode: 'free' | 'grid' };

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Notice {
  id: number;
  message: string;
  tone: 'info' | 'warning' | 'error' | 'success';
  action?: { label: string; run: () => void };
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed' | 'conflict';

const HISTORY_LIMIT = 200;
const PASTE_STEP = 20;

interface EditorState {
  doc: MapDocument | null;
  floorId: string;
  selection: string[];
  /** When set, clicks select individual spaces inside this row instead of the whole row. */
  enteredRowId: string | null;
  activeLayer: string | 'auto';
  tool: Tool;
  snapMode: SnapMode;
  viewport: Viewport;
  viewSize: { width: number; height: number };
  past: MapDocument[];
  future: MapDocument[];
  /** Increments on every change; autosave compares it to savedSeq. */
  editSeq: number;
  savedSeq: number;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Stored revision this editor's changes are based on (kept outside the doc so undo can't rewind it). */
  revision: number;
  /** The newer stored copy when a conflicting save was detected. */
  conflict: MapDocument | null;
  notices: Notice[];
  clipboard: ClipboardData | null;
  pasteCount: number;
  gestureBase: MapDocument | null;
  recentAssets: string[];
  favoriteAssets: string[];
  /** Spaces/rows dialog state. */
  rowDialog: { anchor: RowAnchor; count?: number } | null;
  /** The site view to return to when leaving a building's floor plan. */
  outsideView: Viewport | null;
}

interface EditorActions {
  load(doc: MapDocument): void;
  replaceDoc(doc: MapDocument, opts?: { keepHistory?: boolean; markSaved?: boolean }): void;
  commit(recipe: (doc: Draft<MapDocument>, floor: Draft<Floor>) => void): void;
  beginGesture(): void;
  previewGesture(recipe: (doc: Draft<MapDocument>, floor: Draft<Floor>) => void): void;
  endGesture(): void;
  /** Drops a gesture's preview and puts the map back as it was (e.g. a drag turned into a pinch). */
  cancelGesture(): void;
  undo(): void;
  redo(): void;

  setFloor(id: string): void;
  /** Zooms so the whole current floor fits the canvas. */
  fitToFloor(): void;
  setTool(tool: Tool): void;
  setSnapMode(mode: SnapMode): void;
  setViewport(v: Viewport): void;
  setViewSize(s: { width: number; height: number }): void;
  setActiveLayer(id: string | 'auto'): void;

  select(ids: string[], opts?: { additive?: boolean }): void;
  clickObject(id: string, opts: { additive: boolean }): void;
  enterRow(rowId: string | null): void;
  selectAll(): void;
  clearSelection(): void;
  selectInBox(box: Box, additive: boolean): void;

  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  deleteSelection(): void;
  nudge(dx: number, dy: number): void;
  moveSelection(moves: Moves): void;
  updateObjects(ids: string[], patch: Partial<MapObject>): void;
  moveToLayer(ids: string[], layerId: string): void;
  align(op: AlignOp): void;
  distribute(op: DistributeOp): void;
  renumber(ids: string[]): void;
  /** Changes drawing order: to the very front/back, or one step past the next overlapping object. */
  reorder(op: OrderOp): void;
  /** Cuts a world-space shape out of the selected (or else every touched) shapeable object. */
  cutWith(ring: number[]): void;

  addAsset(key: string, at: { x: number; y: number }): void;
  addText(at: { x: number; y: number }, text?: string): void;
  addImage(src: string, at: { x: number; y: number }, size: { width: number; height: number }, name?: string): void;
  openRowDialog(anchor: RowAnchor, count?: number): void;
  closeRowDialog(): void;
  addRow(spec: Omit<RowSpec, 'id'>, anchor: RowAnchor): void;
  updateRow(rowId: string, patch: Partial<Omit<RowSpec, 'id'>>): void;

  addLayer(): void;
  renameLayer(id: string, name: string): void;
  toggleLayer(id: string, key: 'visible' | 'locked'): void;
  shiftLayer(id: string, dir: 1 | -1): void;
  deleteLayer(id: string, moveTo: string | null): void;

  addFloor(): void;
  renameFloor(id: string, name: string): void;
  moveFloor(id: string, dir: 1 | -1): void;
  duplicateFloor(id: string): void;
  deleteFloor(id: string): void;
  /** Opens a building's floor plan, making its first floor if it has none yet. */
  enterBuilding(id: string): void;
  /** Back from a building's floor plan to the site floor it is on, with the building selected. */
  exitBuilding(): void;

  setBackground(bg: Omit<BackgroundImage, 'layerId'> | null): void;
  updateBackground(patch: Partial<BackgroundImage>): void;
  renameMap(name: string): void;
  setGridSize(n: number): void;

  setSaveState(s: { status: SaveStatus; savedSeq?: number; error?: string | null; revision?: number; conflict?: MapDocument | null }): void;
  notify(n: Omit<Notice, 'id'>): void;
  dismiss(id: number): void;
  toggleFavorite(key: string): void;
}

export type EditorStore = EditorState & EditorActions;

let noticeSeq = 0;

const readPref = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writePref = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* preferences are optional */
  }
};

export const currentFloor = (s: Pick<EditorState, 'doc' | 'floorId'>): Floor | undefined =>
  s.doc?.floors.find((f) => f.id === s.floorId) ?? s.doc?.floors[0];

/** Layers that are locked or hidden cannot be selected or edited. */
/**
 * Makes a text box big enough for its words (it never shrinks one a person sized).
 * The box used to stay 120 wide, so "Administration office" was drawn as "Administratio".
 */
export function growTextBox(o: { text: string; fontSize: number; width: number; height: number; strokeWidth?: number; fill?: string }) {
  const charW = o.fontSize * 0.62;
  const pad = o.fill || (o.strokeWidth ?? 0) > 0 ? 8 : 0;
  const lines = o.text.split('\n');
  const longestWord = Math.max(0, ...o.text.split(/\s+/).map((w) => w.length)) * charW + pad;
  const longestLine = Math.max(0, ...lines.map((l) => l.length)) * charW + pad;
  const width = Math.min(Math.max(o.width, longestWord, Math.min(longestLine, 480)), 1000);
  const perLine = Math.max(1, (width - pad) / charW);
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  o.width = Math.round(width);
  o.height = Math.round(Math.max(o.height, rows * o.fontSize * 1.15 + 6));
}

export function editableIds(floor: Floor, ids: Iterable<string>): string[] {
  const blocked = new Set(floor.layers.filter((l) => l.locked || !l.visible).map((l) => l.id));
  const set = new Set(ids);
  return floor.objects.filter((o) => set.has(o.id) && !blocked.has(o.layerId)).map((o) => o.id);
}

const initialState: EditorState = {
  doc: null,
  floorId: '',
  selection: [],
  enteredRowId: null,
  activeLayer: 'auto',
  tool: { type: 'select' },
  snapMode: readPref<SnapMode>('bm.snapMode', 'smart'),
  viewport: { x: 0, y: 0, scale: 1 },
  viewSize: { width: 800, height: 600 },
  past: [],
  future: [],
  editSeq: 0,
  savedSeq: 0,
  saveStatus: 'saved',
  saveError: null,
  revision: 0,
  conflict: null,
  notices: [],
  clipboard: null,
  pasteCount: 0,
  gestureBase: null,
  recentAssets: readPref<string[]>('bm.recentAssets', []),
  favoriteAssets: readPref<string[]>('bm.favoriteAssets', []),
  rowDialog: null,
  outsideView: null,
};

export const useEditor = create<EditorStore>()((set, get) => {
  /** Applies a change to the current floor and records it for undo. */
  const commit: EditorActions['commit'] = (recipe) => {
    const { doc, floorId } = get();
    if (!doc) return;
    const next = produce(doc, (d) => {
      const f = d.floors.find((x) => x.id === floorId) ?? d.floors[0];
      recipe(d, f);
    });
    if (next === doc) return;
    set((s) => ({
      doc: next,
      past: [...s.past.slice(-HISTORY_LIMIT + 1), doc],
      future: [],
      editSeq: s.editSeq + 1,
      saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'unsaved',
    }));
  };

  /**
   * State that must stay valid after the document is swapped. With `from` (undo/redo),
   * the objects the step brought back or changed become the selection, as in other
   * design tools, so an undone delete can be moved or deleted again straight away.
   */
  const sanitize = (doc: MapDocument, from?: MapDocument) => {
    const s = get();
    const floor = doc.floors.find((f) => f.id === s.floorId) ?? doc.floors[0];
    const live = new Set(floor.objects.map((o) => o.id));
    const before = from?.floors.find((f) => f.id === floor.id);
    const was = new Map(before?.objects.map((o) => [o.id, o]));
    // Compared by value: a step can rebuild objects it didn't really change.
    const same = (a: MapObject | undefined, b: MapObject) => a === b || (!!a && JSON.stringify(a) === JSON.stringify(b));
    const touched = before && before !== floor ? floor.objects.filter((o) => !same(was.get(o.id), o)).map((o) => o.id) : [];
    const touchedEditable = touched.length ? editableIds(floor, touched) : [];
    return {
      floorId: floor.id,
      selection: touchedEditable.length ? touchedEditable : s.selection.filter((id) => live.has(id)),
      enteredRowId: s.enteredRowId && floor.rows[s.enteredRowId] ? s.enteredRowId : null,
      activeLayer: s.activeLayer !== 'auto' && !floor.layers.some((l) => l.id === s.activeLayer) ? 'auto' : s.activeLayer,
    };
  };

  /** Expands a set of ids so whole rows are included unless we are inside a row. */
  const expandRows = (floor: Floor, ids: string[]): string[] => {
    const { enteredRowId } = get();
    const rowIds = new Set<string>();
    for (const o of floor.objects) if (ids.includes(o.id) && o.kind === 'space' && o.rowId && o.rowId !== enteredRowId) rowIds.add(o.rowId);
    if (rowIds.size === 0) return ids;
    const out = new Set(ids);
    for (const o of floor.objects) if (o.kind === 'space' && o.rowId && rowIds.has(o.rowId)) out.add(o.id);
    return floor.objects.filter((o) => out.has(o.id)).map((o) => o.id);
  };

  const viewCenter = () => {
    const { viewport: v, viewSize } = get();
    return { x: (viewSize.width / 2 - v.x) / v.scale, y: (viewSize.height / 2 - v.y) / v.scale };
  };

  const viewBox = (): Box => {
    const { viewport: v, viewSize } = get();
    return { x: -v.x / v.scale, y: -v.y / v.scale, width: viewSize.width / v.scale, height: viewSize.height / v.scale };
  };

  const notify = (n: Omit<Notice, 'id'>) => {
    const id = ++noticeSeq;
    set((s) => ({ notices: [...s.notices.slice(-3), { ...n, id }] }));
    if (!n.action) setTimeout(() => get().dismiss(id), n.tone === 'error' ? 8000 : 4000);
    else setTimeout(() => get().dismiss(id), 12000);
  };

  const remember = (key: string) => {
    const recent = [key, ...get().recentAssets.filter((k) => k !== key)].slice(0, 8);
    writePref('bm.recentAssets', recent);
    set({ recentAssets: recent });
  };

  const nextName = (doc: MapDocument, prefix: string): string => {
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`);
    let max = 0;
    for (const f of doc.floors) for (const o of f.objects) {
      const m = o.name ? re.exec(o.name) : null;
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix} ${max + 1}`;
  };

  const pasteClip = (clip: ClipboardData, step: number) => {
    const { doc, activeLayer } = get();
    const floor = currentFloor(get());
    if (!doc || !floor) return;
    const view = viewBox();
    let dx = PASTE_STEP * step;
    let dy = PASTE_STEP * step;
    // Paste somewhere visible: if the originals are off-screen, center the copy in view.
    const shifted = { ...clip.box, x: clip.box.x + dx, y: clip.box.y + dy };
    if (!boxesIntersect(shifted, view)) {
      const c = viewCenter();
      dx = c.x - (clip.box.x + clip.box.width / 2) + PASTE_STEP * (step - 1);
      dy = c.y - (clip.box.y + clip.box.height / 2) + PASTE_STEP * (step - 1);
    }
    const result = preparePaste(floor, clip, dx, dy, (o) =>
      resolveTargetLayer(floor, activeLayer, roleForObject(o, o.kind === 'asset' ? ASSET_BY_KEY[o.assetKey]?.layer : undefined)),
    );
    // Copies of named things ("Stairway 3") get the next free number, so names stay unique for search and tap-to-identify.
    const taken = new Set<string>();
    for (const fl of doc.floors) for (const o of fl.objects) if (o.name) taken.add(o.name);
    for (const o of result.objects) {
      const m = o.kind !== 'space' && o.name ? /^(.*\S) (\d+)$/.exec(o.name) : null;
      if (!m || !taken.has(o.name!)) { if (o.name) taken.add(o.name); continue; }
      let n = parseInt(nextName(doc, m[1]).slice(m[1].length + 1), 10);
      while (taken.has(`${m[1]} ${n}`)) n++;
      o.name = `${m[1]} ${n}`;
      taken.add(o.name);
    }
    commit((_d, f) => {
      f.objects.push(...(result.objects as Draft<MapObject>[]));
      Object.assign(f.rows, result.rows);
      normalizeRows(f);
    });
    set({ selection: result.objects.map((o) => o.id), enteredRowId: null });
    if (result.duplicateIds.length) {
      const ids = result.objects.filter((o) => o.kind === 'space').map((o) => o.id);
      notify({
        tone: 'warning',
        message: `${result.duplicateIds.length} pasted space${result.duplicateIds.length > 1 ? 's use numbers' : ' uses a number'} already on this floor.`,
        action: { label: 'Renumber', run: () => get().renumber(ids) },
      });
    }
  };

  return {
    ...initialState,

    load(doc) {
      set({
        ...initialState,
        snapMode: get().snapMode,
        recentAssets: get().recentAssets,
        favoriteAssets: get().favoriteAssets,
        clipboard: get().clipboard,
        doc,
        floorId: doc.floors[0].id,
        revision: doc.revision,
      });
    },

    replaceDoc(doc, opts) {
      const s = get();
      set({
        doc,
        ...sanitize(doc),
        past: opts?.keepHistory && s.doc ? [...s.past, s.doc] : opts?.keepHistory ? s.past : [],
        future: opts?.keepHistory ? [] : [],
        editSeq: s.editSeq + 1,
        ...(opts?.markSaved ? { savedSeq: s.editSeq + 1, saveStatus: 'saved' as const } : { saveStatus: 'unsaved' as const }),
      });
    },

    commit,

    beginGesture() {
      set({ gestureBase: get().doc });
    },
    previewGesture(recipe) {
      const { doc, floorId } = get();
      if (!doc) return;
      set({
        doc: produce(doc, (d) => {
          recipe(d, d.floors.find((x) => x.id === floorId) ?? d.floors[0]);
        }),
      });
    },
    cancelGesture() {
      const { gestureBase } = get();
      set(gestureBase ? { gestureBase: null, doc: gestureBase } : { gestureBase: null });
    },
    endGesture() {
      const { gestureBase, doc } = get();
      set({ gestureBase: null });
      if (!gestureBase || !doc || gestureBase === doc) return;
      set((s) => ({
        past: [...s.past.slice(-HISTORY_LIMIT + 1), gestureBase],
        future: [],
        editSeq: s.editSeq + 1,
        saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'unsaved',
      }));
    },

    undo() {
      const { past, doc, future } = get();
      if (!past.length || !doc) return;
      const prev = past[past.length - 1];
      set((s) => ({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], editSeq: s.editSeq + 1, saveStatus: 'unsaved' }));
      set(sanitize(prev, doc));
    },
    redo() {
      const { past, doc, future } = get();
      if (!future.length || !doc) return;
      const next = future[0];
      set((s) => ({ doc: next, past: [...past, doc], future: future.slice(1), editSeq: s.editSeq + 1, saveStatus: 'unsaved' }));
      set(sanitize(next, doc));
    },

    setFloor(id) {
      set({ floorId: id, selection: [], enteredRowId: null, activeLayer: 'auto' });
    },
    setTool(tool) {
      set({ tool });
    },
    setSnapMode(mode) {
      writePref('bm.snapMode', mode);
      set({ snapMode: mode });
    },
    setViewport(v) {
      set({ viewport: v });
    },
    setViewSize(s) {
      set({ viewSize: s });
    },
    setActiveLayer(id) {
      set({ activeLayer: id });
    },

    select(ids, opts) {
      const floor = currentFloor(get());
      if (!floor) return;
      const base = opts?.additive ? get().selection : [];
      set({ selection: editableIds(floor, [...base, ...ids]) });
    },
    clickObject(id, { additive }) {
      const floor = currentFloor(get());
      if (!floor) return;
      const o = floor.objects.find((x) => x.id === id);
      const { enteredRowId } = get();
      if (enteredRowId && !(o?.kind === 'space' && o.rowId === enteredRowId)) set({ enteredRowId: null });
      const group = expandRows(floor, [id]);
      const sel = get().selection;
      if (additive) {
        const allIn = group.every((g) => sel.includes(g));
        set({ selection: allIn ? sel.filter((s) => !group.includes(s)) : editableIds(floor, [...sel, ...group]) });
      } else if (!sel.includes(id)) {
        // Clicking inside an existing selection keeps it, so a multi-selection can be dragged.
        set({ selection: editableIds(floor, group) });
      }
    },
    enterRow(rowId) {
      set({ enteredRowId: rowId });
    },
    selectAll() {
      const floor = currentFloor(get());
      if (!floor) return;
      set({ selection: editableIds(floor, floor.objects.map((o) => o.id)), enteredRowId: null });
    },
    clearSelection() {
      set({ selection: [], enteredRowId: null });
    },
    selectInBox(box, additive) {
      const floor = currentFloor(get());
      if (!floor) return;
      const hits = floor.objects.filter((o) => boxesIntersect(objectBox(o), box)).map((o) => o.id);
      const ids = editableIds(floor, hits);
      set({ selection: additive ? [...new Set([...get().selection, ...ids])] : ids });
    },

    copy() {
      const floor = currentFloor(get());
      const { selection } = get();
      if (!floor || !selection.length) return;
      set({ clipboard: copySelection(floor, selection), pasteCount: 0 });
    },
    cut() {
      get().copy();
      get().deleteSelection();
      set({ pasteCount: -1 });
    },
    paste() {
      const { clipboard, pasteCount } = get();
      if (!clipboard) {
        notify({ tone: 'info', message: 'Nothing to paste yet. Select something and press Ctrl+C (⌘C on Mac) first.' });
        return;
      }
      const step = pasteCount + 1;
      set({ pasteCount: step });
      pasteClip(clipboard, step);
    },
    duplicate() {
      const floor = currentFloor(get());
      const { selection } = get();
      if (!floor || !selection.length) return;
      const clip = copySelection(floor, selection);
      if (clip) pasteClip(clip, 1);
    },
    deleteSelection() {
      const { selection } = get();
      if (!selection.length) return;
      const ids = new Set(selection);
      commit((d, f) => {
        f.objects = f.objects.filter((o) => !ids.has(o.id));
        normalizeRows(f);
        // A deleted building takes its floor plan with it (undo brings both back).
        if (!f.interiorOf) {
          const gone = new Set(interiorsOfObjects(d as MapDocument, ids));
          if (gone.size) d.floors = d.floors.filter((x) => !gone.has(x.id));
        }
      });
      set({ selection: [] });
    },
    nudge(dx, dy) {
      const { selection } = get();
      if (!selection.length) return;
      const m: Moves = new Map(selection.map((id) => [id, { dx, dy }]));
      get().moveSelection(m);
    },
    moveSelection(moves) {
      if (!moves.size) return;
      commit((_d, f) => {
        for (const o of f.objects) {
          const m = moves.get(o.id);
          if (m) {
            o.x += m.dx;
            o.y += m.dy;
          }
        }
      });
    },
    updateObjects(ids, patch) {
      const set_ = new Set(ids);
      commit((_d, f) => {
        for (const o of f.objects) {
          if (!set_.has(o.id)) continue;
          Object.assign(o, patch);
          if (o.kind === 'text' && ('text' in patch || 'fontSize' in patch)) growTextBox(o);
        }
      });
    },
    moveToLayer(ids, layerId) {
      get().updateObjects(ids, { layerId });
      const layer = currentFloor(get())?.layers.find((l) => l.id === layerId);
      if (layer && (layer.locked || !layer.visible)) {
        set({ selection: get().selection.filter((id) => !ids.includes(id)) });
        notify({ tone: 'info', message: `Moved to “${layer.name}”, which is ${layer.locked ? 'locked' : 'hidden'}.` });
      }
    },
    align(op) {
      const floor = currentFloor(get());
      if (!floor) return;
      const sel = new Set(get().selection);
      get().moveSelection(alignObjects(floor.objects.filter((o) => sel.has(o.id)), op));
    },
    distribute(op) {
      const floor = currentFloor(get());
      if (!floor) return;
      const sel = new Set(get().selection);
      get().moveSelection(distributeObjects(floor.objects.filter((o) => sel.has(o.id)), op));
    },
    renumber(ids) {
      commit((_d, f) => renumberSpaces(f as Floor, ids));
      notify({ tone: 'success', message: 'Spaces renumbered.' });
    },
    reorder(op) {
      const floor = currentFloor(get());
      const ids = get().selection;
      if (!floor || !ids.length) return;
      // Dry run on a copy first so a no-op doesn't add an undo step.
      const probe = reorderObjects({ ...floor, objects: [...floor.objects] }, ids, op);
      if (probe.noop) {
        const where = op === 'front' || op === 'forward' ? 'in front' : 'at the back';
        notify({
          tone: 'info',
          message: probe.blockedBy
            ? `Can’t go past objects on “${probe.blockedBy.name}” while that layer is locked.`
            : `Already ${where}${op === 'forward' || op === 'backward' ? ' of everything it overlaps' : ''}.`,
        });
        return;
      }
      let res = probe;
      commit((_d, f) => {
        res = reorderObjects(f as Floor, ids, op);
      });
      if (res.movedTo) notify({ tone: 'info', message: `Moved to the “${res.movedTo.name}” layer so it shows ${op === 'front' || op === 'forward' ? 'on top' : 'underneath'}.` });
      else if (res.blockedBy) notify({ tone: 'info', message: `Objects on the locked “${res.blockedBy.name}” layer weren’t passed. Unlock it to go past them.` });
    },

    cutWith(ring) {
      const floor = currentFloor(get());
      if (!floor || ring.length < 6) return;
      const blocked = new Set(floor.layers.filter((l) => l.locked || !l.visible).map((l) => l.id));
      const sel = new Set(get().selection);
      const xs = ring.filter((_, i) => i % 2 === 0);
      const ys = ring.filter((_, i) => i % 2 === 1);
      const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      const candidates = floor.objects.filter((o): o is AssetObject => {
        if (o.kind !== 'asset' || o.imageSrc || blocked.has(o.layerId)) return false;
        const def = ASSET_BY_KEY[o.assetKey];
        return !!def && isShapeable(def) && boxesIntersect(objectBox(o), box);
      });
      const pool = sel.size && candidates.some((o) => sel.has(o.id)) ? candidates.filter((o) => sel.has(o.id)) : candidates;
      const cuts = new Map<string, number[]>();
      for (const o of pool) {
        const c = cutForObject({ ...o, ...shapeSourceFor(ASSET_BY_KEY[o.assetKey], o) }, ring);
        if (c) cuts.set(o.id, c);
      }
      if (!cuts.size) {
        notify({ tone: 'info', message: 'Nothing to cut there. Draw over a zone, ground area, road or building.' });
        return;
      }
      commit((_d, f) => {
        for (const o of f.objects) {
          const c = cuts.get(o.id);
          if (c && o.kind === 'asset') o.cuts = [...(o.cuts ?? []), c];
        }
      });
      notify({ tone: 'success', message: cuts.size === 1 ? 'Cut out. Undo with Ctrl+Z.' : `Cut ${cuts.size} objects. Undo with Ctrl+Z.` });
    },

    addAsset(key, at) {
      const def = ASSET_BY_KEY[key];
      const { doc, activeLayer } = get();
      const floor = currentFloor(get());
      if (!def || !doc || !floor) return;
      const creates = def.creates ?? 'asset';
      if (creates === 'row') {
        get().openRowDialog({ x: at.x, y: at.y, rotation: 0 });
        remember(key);
        return;
      }
      if (creates !== 'asset' && creates !== 'space' && creates !== 'text') return;
      // Cascade repeated placements at the same spot so they don't hide each other.
      const pos = { ...at };
      while (floor.objects.some((o) => Math.abs(o.x - pos.x) < 1 && Math.abs(o.y - pos.y) < 1)) {
        pos.x += 24;
        pos.y += 24;
      }
      const base = { x: pos.x, y: pos.y, width: def.width, height: def.height, rotation: 0 };
      let obj: MapObject;
      if (creates === 'space') {
        const labels = floor.objects.filter((o): o is SpaceObject => o.kind === 'space').map((o) => o.label);
        obj = {
          ...base, id: newId('sp'), kind: 'space', label: String((highestNumber(labels, '') ?? 0) + 1),
          layerId: resolveTargetLayer(floor, activeLayer, 'spaces'), labelPlacement: 'center',
          fill: SPACE_FILL, variant: def.variant, accessible: def.variant === 'accessible' || undefined,
          ...(def.stroke ? { stroke: def.stroke } : {}),
        };
      } else if (creates === 'text') {
        const t = def.text!;
        obj = {
          ...base, id: newId('tx'), kind: 'text', text: t.text, fontSize: t.fontSize, color: t.color,
          layerId: resolveTargetLayer(floor, activeLayer, 'labels'),
          ...(t.fill ? { fill: t.fill, fillOpacity: t.fillOpacity } : {}),
          ...(t.strokeWidth ? { stroke: t.stroke, strokeWidth: t.strokeWidth } : {}),
        };
      } else {
        obj = {
          ...base, id: newId('as'), kind: 'asset', assetKey: key,
          layerId: resolveTargetLayer(floor, activeLayer, def.layer),
          name: nextName(doc, def.namePrefix),
          ...(def.label ? { label: def.label } : {}),
        };
      }
      commit((_d, f) => {
        f.objects.push(obj);
      });
      remember(key);
      set({ selection: [obj.id], tool: { type: 'select' } });
    },
    addImage(src, at, size, name) {
      const { doc, activeLayer } = get();
      const floor = currentFloor(get());
      if (!doc || !floor) return;
      const id = newId('as');
      commit((_d, f) => {
        f.objects.push({
          id, kind: 'asset', assetKey: 'import-image', imageSrc: src,
          layerId: resolveTargetLayer(floor, activeLayer, 'landmarks'),
          x: at.x, y: at.y, width: size.width, height: size.height, rotation: 0,
          name: name || nextName(doc, 'Image'),
        });
      });
      set({ selection: [id], tool: { type: 'select' } });
    },
    addText(at, text = 'Label') {
      const floor = currentFloor(get());
      if (!floor) return;
      const id = newId('tx');
      commit((_d, f) => {
        f.objects.push({
          id, kind: 'text', text, fontSize: 18, color: '#111827',
          layerId: resolveTargetLayer(floor, get().activeLayer, 'labels'),
          x: at.x, y: at.y, width: 120, height: 28, rotation: 0,
        });
        const added = f.objects[f.objects.length - 1];
        if (added.kind === 'text') growTextBox(added);
      });
      set({ selection: [id], tool: { type: 'select' } });
    },
    openRowDialog(anchor, count) {
      set({ rowDialog: { anchor, count }, tool: { type: 'select' } });
    },
    closeRowDialog() {
      set({ rowDialog: null });
    },
    addRow(spec, anchor) {
      const floor = currentFloor(get());
      if (!floor) return;
      const row: RowSpec = { ...spec, id: newId('row') };
      const spaces = buildRowSpaces(row, anchor, resolveTargetLayer(floor, get().activeLayer, 'spaces'));
      commit((_d, f) => {
        f.rows[row.id] = row;
        f.objects.push(...spaces);
      });
      set({ selection: spaces.map((s) => s.id), enteredRowId: null, rowDialog: null });
    },
    updateRow(rowId, patch) {
      let ids: string[] = [];
      commit((_d, f) => {
        ids = regenerateRow(f as Floor, rowId, patch);
      });
      set({ selection: ids });
    },

    addLayer() {
      const id = newId('ly');
      commit((_d, f) => {
        let n = f.layers.length;
        while (f.layers.some((l) => l.name === `Layer ${n}`)) n++;
        f.layers.push({ id, name: `Layer ${n}`, visible: true, locked: false });
      });
      set({ activeLayer: id });
    },
    renameLayer(id, name) {
      if (!name.trim()) return;
      commit((_d, f) => {
        const l = f.layers.find((x) => x.id === id);
        if (l) l.name = name.trim();
      });
    },
    toggleLayer(id, key) {
      commit((_d, f) => {
        const l = f.layers.find((x) => x.id === id) as Layer | undefined;
        if (l) l[key] = !l[key];
      });
      const floor = currentFloor(get());
      if (floor) set({ selection: editableIds(floor, get().selection) });
    },
    shiftLayer(id, dir) {
      commit((_d, f) => shiftLayer(f as Floor, id, dir));
    },
    deleteLayer(id, moveTo) {
      commit((_d, f) => deleteLayer(f as Floor, id, moveTo));
      const s = get();
      const floor = currentFloor(s);
      if (floor) set({ ...sanitize(s.doc!), selection: editableIds(floor, s.selection) });
    },

    addFloor() {
      const { doc } = get();
      const cur = currentFloor(get());
      if (!doc || !cur) return;
      const inside = buildingOf(doc, cur);
      const floor = inside ? createInteriorFloor(doc, inside.building) : createFloor(nextFloorName(doc));
      const group = floorGroup(doc, cur);
      const after = doc.floors.indexOf(group[group.length - 1]);
      commit((d) => {
        d.floors.splice(after + 1, 0, floor);
      });
      get().setFloor(floor.id);
    },
    renameFloor(id, name) {
      if (!name.trim()) return;
      commit((d) => {
        const f = d.floors.find((x) => x.id === id);
        if (f) f.name = name.trim();
      });
    },
    moveFloor(id, dir) {
      commit((d) => {
        const f = d.floors.find((x) => x.id === id);
        if (!f) return;
        // Swap with the next floor in the same group (site floors, or one building's floors).
        const group = floorGroup(d as MapDocument, f as Floor);
        const g = group.findIndex((x) => x.id === id) + dir;
        if (g < 0 || g >= group.length) return;
        const i = d.floors.findIndex((x) => x.id === id);
        const j = d.floors.findIndex((x) => x.id === group[g].id);
        [d.floors[i], d.floors[j]] = [d.floors[j], d.floors[i]];
      });
    },
    duplicateFloor(id) {
      const { doc } = get();
      const src = doc?.floors.find((f) => f.id === id);
      if (!doc || !src) return;
      const { floor: copy, idMap } = duplicateFloorWithIds(src, copyName(doc, src.name, floorGroup(doc, src)));
      // A copied site floor brings its buildings' floor plans with it.
      const interiors = src.interiorOf ? [] : copyInteriors(doc, idMap, duplicateFloor);
      commit((d) => {
        d.floors.splice(d.floors.findIndex((f) => f.id === id) + 1, 0, copy);
        d.floors.push(...interiors);
      });
      get().setFloor(copy.id);
    },
    deleteFloor(id) {
      const { doc } = get();
      const target = doc?.floors.find((f) => f.id === id);
      if (!doc || !target) return;
      const inside = buildingOf(doc, target);
      if (!target.interiorOf && siteFloors(doc).length <= 1) {
        notify({ tone: 'info', message: 'A map needs at least one floor.' });
        return;
      }
      const group = floorGroup(doc, target);
      const gi = group.indexOf(target);
      // Deleting a site floor also deletes the floor plans of the buildings on it.
      const gone = new Set([id, ...(target.interiorOf ? [] : interiorsOfObjects(doc, target.objects.map((o) => o.id)))]);
      commit((d) => {
        d.floors = d.floors.filter((f) => !gone.has(f.id));
        for (const g of gone) removeFloorReferences(d as MapDocument, g);
      });
      if (!gone.has(get().floorId)) return;
      const left = group.filter((f) => f.id !== id);
      const next = left[Math.max(0, gi - 1)];
      if (next) get().setFloor(next.id);
      else if (inside) {
        get().setFloor(inside.floor.id);
        get().select([inside.building.id]);
        get().fitToFloor();
      }
    },
    enterBuilding(id) {
      const { doc } = get();
      const cur = currentFloor(get());
      if (!doc || !cur || cur.interiorOf) return;
      const building = cur.objects.find((o) => o.id === id);
      if (building?.kind !== 'asset' || !canHaveInterior(ASSET_BY_KEY[building.assetKey])) return;
      set({ outsideView: get().viewport });
      const existing = interiorFloors(doc, id)[0];
      if (existing) {
        get().setFloor(existing.id);
      } else {
        const floor = createInteriorFloor(doc, building, 'Floor 1');
        commit((d) => {
          d.floors.push(floor);
        });
        get().setFloor(floor.id);
      }
      get().fitToFloor();
    },
    exitBuilding() {
      const { doc, outsideView } = get();
      const cur = currentFloor(get());
      const inside = doc && cur ? buildingOf(doc, cur) : null;
      if (!inside) return;
      get().setFloor(inside.floor.id);
      get().select([inside.building.id]);
      if (outsideView) set({ viewport: outsideView, outsideView: null });
      else get().fitToFloor();
    },
    fitToFloor() {
      const f = currentFloor(get());
      if (f) set({ viewport: fitViewport(floorBounds(f), get().viewSize) });
    },

    setBackground(bg) {
      commit((_d, f) => {
        if (!bg) {
          delete f.background;
          return;
        }
        let layer = f.layers.find((l) => l.role === 'background');
        if (!layer) {
          layer = { id: newId('ly'), name: 'Background image', visible: true, locked: true, role: 'background' };
          f.layers.unshift(layer);
        }
        layer.visible = true;
        f.background = { ...bg, layerId: layer.id };
      });
    },
    updateBackground(patch) {
      commit((_d, f) => {
        if (f.background) Object.assign(f.background, patch);
      });
    },
    renameMap(name) {
      if (!name.trim()) return;
      commit((d) => {
        d.name = name.trim();
      });
    },
    setGridSize(n) {
      commit((d) => {
        d.settings.gridSize = Math.max(1, Math.min(200, Math.round(n)));
      });
    },

    setSaveState({ status, savedSeq, error, revision, conflict }) {
      set((s) => ({
        saveStatus: status,
        savedSeq: savedSeq ?? s.savedSeq,
        saveError: error === undefined ? s.saveError : error,
        revision: revision ?? s.revision,
        conflict: conflict === undefined ? s.conflict : conflict,
      }));
    },
    notify,
    dismiss(id) {
      set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
    },
    toggleFavorite(key) {
      const favs = get().favoriteAssets;
      const next = favs.includes(key) ? favs.filter((k) => k !== key) : [...favs, key];
      writePref('bm.favoriteAssets', next);
      set({ favoriteAssets: next });
    },
  };
});

/** Bounding box of the current selection (world units). */
export function selectionBox(floor: Floor, ids: string[]): Box | null {
  const set = new Set(ids);
  return unionBoxes(floor.objects.filter((o) => set.has(o.id)).map(objectBox));
}
