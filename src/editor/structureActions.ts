import { ASSET_BY_KEY, canHaveInterior } from '../assets/library';
import { createFloor, nextFloorName } from '../model/factory';
import { copyName, duplicateFloor, duplicateFloorWithIds, removeFloorReferences } from '../model/floors';
import { buildingOf, copyInteriors, createInteriorFloor, floorGroup, interiorFloors, interiorsOfObjects, siteFloors } from '../model/interiors';
import { fitViewport, floorBounds } from '../render/viewport';
import { newId } from '../model/ids';
import { deleteLayer, shiftLayer } from '../model/layers';
import type { Floor, Layer, MapDocument } from '../model/types';
import { currentFloor, editableIds } from './storeHelpers';
import type { EditorActions, StoreKit } from './storeTypes';

/**
 * Editor actions on the map's structure: layers, floors, building interiors, the background picture and map settings.
 * Part of the editor store; see store.ts.
 */
export const structureActions = ({ set, get, commit, sanitize, notify }: StoreKit) =>
  ({
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
      const { doc } = get();
      const target = doc?.floors.find((f) => f.id === id);
      if (!doc || !target || !name.trim()) return;
      // Floors are told apart by name (tabs, the viewer's floor list, "Connects to").
      const clash = floorGroup(doc, target).find((f) => f.id !== id && f.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (clash) {
        notify({ tone: 'warning', message: `There is already a floor called “${clash.name}”. Pick another name.` });
        return;
      }
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
  }) satisfies Partial<EditorActions>;
