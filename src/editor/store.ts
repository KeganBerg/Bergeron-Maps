/**
 * The map editor's state (zustand + immer): the document, selection, view,
 * undo/redo history and save status, and every action that changes them.
 *
 * Undo works on whole-document snapshots: commit() runs a change with immer
 * and pushes the previous document onto `past`. Drags are one step each
 * (beginGesture / previewGesture / endGesture).
 *
 * The actions are split by job: this file has loading, history, view and
 * selection; objectActions.ts edits objects; structureActions.ts edits
 * layers, floors and the background. Types are in storeTypes.ts.
 */
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import { ASSET_BY_KEY } from '../assets/library';
import { preparePaste, type ClipboardData } from '../model/clipboard';
import { boxesIntersect, objectBox } from '../model/geometry';
import { typeKey } from '../model/objectTypes';
import { resolveTargetLayer, roleForObject } from '../model/layers';
import { normalizeRows } from '../model/rows';
import type { SnapMode } from '../model/snapping';
import type { Box, Floor, MapDocument, MapObject } from '../model/types';
import { objectActions } from './objectActions';
import { structureActions } from './structureActions';
import { currentFloor, editableIds, readPref, writePref } from './storeHelpers';
import type { EditorActions, EditorState, EditorStore, Notice, SaveStatus, StoreKit } from './storeTypes';

export { currentFloor, editableIds, growTextBox, readPref, selectionBox, writePref } from './storeHelpers';
export type { EditorActions, EditorState, EditorStore, Notice, SaveStatus, Tool, Viewport } from './storeTypes';

const HISTORY_LIMIT = 200;
const PASTE_STEP = 20;

let noticeSeq = 0;

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
  /** A change made while a conflict is open must not hide it: autosave stays paused until it's resolved. */
  const keepConflict = (status: SaveStatus): SaveStatus => (status === 'conflict' ? 'conflict' : 'unsaved');

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

  /**
   * Undo or redo of a change made on another floor: go to that floor, so the change
   * can be seen (it used to happen out of sight, and looked like nothing happened).
   */
  const showChangedFloor = (from: MapDocument, to: MapDocument, verb: string) => {
    const { floorId } = get();
    const here = to.floors.find((f) => f.id === floorId);
    if (here && here === from.floors.find((f) => f.id === floorId)) {
      const changed = to.floors.find((f) => f !== from.floors.find((x) => x.id === f.id) && from.floors.some((x) => x.id === f.id));
      if (changed) {
        set({ floorId: changed.id, selection: [], enteredRowId: null, activeLayer: 'auto' });
        notify({ tone: 'info', message: `${verb} a change on “${changed.name}”.` });
      }
    }
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

  const kit: StoreKit = { set, get, commit, sanitize, keepConflict, expandRows, viewCenter, viewBox, notify, remember, nextName, pasteClip };

  return {
    ...initialState,
    ...objectActions(kit),
    ...structureActions(kit),

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
        ...(opts?.markSaved ? { savedSeq: s.editSeq + 1, saveStatus: 'saved' as const } : { saveStatus: keepConflict(s.saveStatus) }),
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
    endGesture(opts) {
      const { gestureBase, doc } = get();
      set({ gestureBase: null });
      if (!gestureBase || !doc || gestureBase === doc) return;
      set((s) => ({
        past: opts?.mergeWithPrevious && s.past.length ? s.past : [...s.past.slice(-HISTORY_LIMIT + 1), gestureBase],
        future: [],
        editSeq: s.editSeq + 1,
        saveStatus: s.saveStatus === 'conflict' ? 'conflict' : 'unsaved',
      }));
    },

    undo() {
      const { past, doc, future, gestureBase } = get();
      // Mid-drag the map is a live preview: undoing under it mixed the two up.
      if (!past.length || !doc || gestureBase) return;
      const prev = past[past.length - 1];
      showChangedFloor(doc, prev, 'Undid');
      set((s) => ({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], editSeq: s.editSeq + 1, saveStatus: keepConflict(s.saveStatus) }));
      set(sanitize(prev, doc));
    },
    redo() {
      const { past, doc, future, gestureBase } = get();
      if (!future.length || !doc || gestureBase) return;
      const next = future[0];
      showChangedFloor(doc, next, 'Redid');
      set((s) => ({ doc: next, past: [...past, doc], future: future.slice(1), editSeq: s.editSeq + 1, saveStatus: keepConflict(s.saveStatus) }));
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
    selectSameType(id) {
      const floor = currentFloor(get());
      const o = floor?.objects.find((x) => x.id === id);
      if (!floor || !o) return;
      const key = typeKey(o);
      set({ selection: editableIds(floor, floor.objects.filter((x) => typeKey(x) === key).map((x) => x.id)), enteredRowId: null });
    },
    clearSelection() {
      set({ selection: [], enteredRowId: null });
    },
    selectInBox(box, additive) {
      const floor = currentFloor(get());
      if (!floor) return;
      const hits = floor.objects.filter((o) => boxesIntersect(objectBox(o), box)).map((o) => o.id);
      // Whole rows, as a click picks them: moving half a row by itself split it in two
      // (and the next change to the row's settings snapped it back into one line).
      // Inside a row (double-clicked) the box picks single spaces of that row.
      const ids = editableIds(floor, expandRows(floor, hits));
      set({ selection: additive ? [...new Set([...get().selection, ...ids])] : ids });
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
