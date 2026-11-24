import { ASSET_BY_KEY, isShapeable, shapeSourceFor } from '../assets/library';
import { alignObjects, distributeObjects, type Moves } from '../model/align';
import { copySelection, renumberSpaces } from '../model/clipboard';
import { interiorsOfObjects } from '../model/interiors';
import { boxesIntersect, objectBox } from '../model/geometry';
import { reorderObjects } from '../model/order';
import { cutForObject } from '../model/shape';
import { newId } from '../model/ids';
import { placeObjects as placeObjectsOn, resolveTargetLayer } from '../model/layers';
import { highestNumber } from '../model/numbering';
import { buildRowSpaces, normalizeRows, regenerateRow, SPACE_FILL } from '../model/rows';
import type { AssetObject, Floor, MapDocument, MapObject, RowSpec, SpaceObject } from '../model/types';
import { currentFloor, editableIds, growTextBox } from './storeHelpers';
import type { EditorActions, StoreKit } from './storeTypes';

/**
 * Editor actions on objects: clipboard, delete, move, edit, layer order, align, and adding symbols, text, images and rows.
 * Part of the editor store; see store.ts.
 */
export const objectActions = ({ set, get, commit, notify, remember, nextName, pasteClip }: StoreKit) =>
  ({
    copy() {
      const floor = currentFloor(get());
      const { selection } = get();
      if (!floor || !selection.length) return;
      const clip = copySelection(floor, selection);
      set({ clipboard: clip && { ...clip, floorId: floor.id }, pasteCount: 0 });
    },
    cut() {
      // Nothing selected: keep the clipboard and paste position as they were (a stray
      // Ctrl+X used to make the next paste land exactly on top of the original).
      if (!get().selection.length) return;
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
      // On another floor the first copy lands where the originals are (stacked floors
      // line up), not shifted, as in other design tools; repeat pastes then step on.
      const otherFloor = !!clipboard.floorId && clipboard.floorId !== get().floorId;
      if (otherFloor) {
        set({ clipboard: { ...clipboard, floorId: get().floorId }, pasteCount: 0 });
        pasteClip(clipboard, 0);
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
    duplicateInPlace() {
      const floor = currentFloor(get());
      const { selection } = get();
      if (!floor || !selection.length) return [];
      const clip = copySelection(floor, selection);
      if (!clip) return [];
      pasteClip(clip, 0);
      return get().selection;
    },
    deleteSelection() {
      get().deleteObjects(get().selection);
    },
    deleteObjects(list) {
      if (!list.length) return;
      const ids = new Set(list);
      commit((d, f) => {
        f.objects = f.objects.filter((o) => !ids.has(o.id));
        normalizeRows(f);
        // A deleted building takes its floor plan with it (undo brings both back).
        if (!f.interiorOf) {
          const gone = new Set(interiorsOfObjects(d as MapDocument, ids));
          if (gone.size) d.floors = d.floors.filter((x) => !gone.has(x.id));
        }
      });
      set({ selection: get().selection.filter((id) => !ids.has(id)) });
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
    placeObjects(ids, layerId, anchor) {
      const floor = currentFloor(get());
      const layer = floor?.layers.find((l) => l.id === layerId);
      if (!floor || !layer) return;
      if (layer.role === 'background') {
        notify({ tone: 'info', message: 'The background image layer only holds the site plan or photo.' });
        return;
      }
      if (layer.locked) {
        notify({ tone: 'info', message: `“${layer.name}” is locked. Unlock it to move objects onto it.` });
        return;
      }
      commit((_d, f) => {
        placeObjectsOn(f as Floor, ids, layerId, anchor);
      });
      const after = currentFloor(get());
      if (after) set({ selection: editableIds(after, get().selection) });
    },
    setObjectFlag(ids, key, value) {
      const set_ = new Set(ids);
      commit((_d, f) => {
        for (const o of f.objects) if (set_.has(o.id)) {
          if (value) o[key] = true;
          else delete o[key];
        }
      });
      const floor = currentFloor(get());
      if (floor) set({ selection: editableIds(floor, get().selection) });
    },
    renameObject(id, name) {
      commit((_d, f) => {
        const o = f.objects.find((x) => x.id === id);
        if (!o) return;
        const v = name.trim();
        if (o.kind === 'space') o.label = v;
        else if (o.kind === 'text') { if (v) o.text = v; }
        else if (v) o.name = v;
        else delete o.name;
      });
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
  }) satisfies Partial<EditorActions>;
