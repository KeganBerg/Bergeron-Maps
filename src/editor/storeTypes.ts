/** Types of the map editor's store (src/editor/store.ts). */
import { type Draft } from 'immer';
import { type AlignOp, type DistributeOp, type Moves } from '../model/align';
import { type ClipboardData } from '../model/clipboard';
import { type OrderOp } from '../model/order';
import { type RowAnchor } from '../model/rows';
import type { SnapMode } from '../model/snapping';
import type { BackgroundImage, Box, Floor, MapDocument, MapObject, RowSpec } from '../model/types';

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


export interface EditorState {
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

export interface EditorActions {
  load(doc: MapDocument): void;
  replaceDoc(doc: MapDocument, opts?: { keepHistory?: boolean; markSaved?: boolean }): void;
  commit(recipe: (doc: Draft<MapDocument>, floor: Draft<Floor>) => void): void;
  beginGesture(): void;
  previewGesture(recipe: (doc: Draft<MapDocument>, floor: Draft<Floor>) => void): void;
  /** Saves the gesture as one undo step; `mergeWithPrevious` folds it into the step before (Alt-drag: the copy and its move). */
  endGesture(opts?: { mergeWithPrevious?: boolean }): void;
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
  /** Selects every editable object on the floor of the same type as `id` (every EV space, every column). */
  selectSameType(id: string): void;
  clearSelection(): void;
  selectInBox(box: Box, additive: boolean): void;

  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  /** Copies the selection in place (no offset) and selects the copies; returns their ids. */
  duplicateInPlace(): string[];
  deleteSelection(): void;
  nudge(dx: number, dy: number): void;
  moveSelection(moves: Moves): void;
  updateObjects(ids: string[], patch: Partial<MapObject>): void;
  moveToLayer(ids: string[], layerId: string): void;
  /** Layers panel drag and drop: move to a layer, above or below another object (or on top). */
  placeObjects(ids: string[], layerId: string, anchor: { id: string; side: 'above' | 'below' } | null): void;
  /** Per-object eye and lock toggles in the Layers panel. */
  setObjectFlag(ids: string[], key: 'hidden' | 'locked', value: boolean): void;
  /** Renames from the Layers panel: a space's number, a text's words, or an object's name. */
  renameObject(id: string, name: string): void;
  /** Deletes objects even when they're locked or hidden (from the Layers panel). */
  deleteObjects(ids: string[]): void;
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

/**
 * What the action groups in objectActions.ts and structureActions.ts get from
 * the store in store.ts: zustand's set/get plus the shared helpers.
 */
export interface StoreKit {
  set: (partial: Partial<EditorStore> | ((s: EditorStore) => Partial<EditorStore>)) => void;
  get: () => EditorStore;
  /** Applies a change to the current floor and records it for undo. */
  commit: EditorActions['commit'];
  /** Selection, floor, row and layer state made valid again after the document is swapped. */
  sanitize: (doc: MapDocument, from?: MapDocument) => Pick<EditorState, 'floorId' | 'selection' | 'enteredRowId' | 'activeLayer'>;
  /** A change made while a conflict is open must not hide it. */
  keepConflict: (status: SaveStatus) => SaveStatus;
  /** Expands ids so whole rows are included unless we are inside a row. */
  expandRows: (floor: Floor, ids: string[]) => string[];
  viewCenter: () => { x: number; y: number };
  viewBox: () => Box;
  notify: (n: Omit<Notice, 'id'>) => void;
  /** Adds a symbol to the recently used list. */
  remember: (key: string) => void;
  /** The next free "Prefix N" name in the map. */
  nextName: (doc: MapDocument, prefix: string) => string;
  pasteClip: (clip: ClipboardData, step: number) => void;
}
