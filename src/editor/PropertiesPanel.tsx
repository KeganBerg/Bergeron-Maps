import { useEffect, useRef } from 'react';
import { ASSET_BY_KEY } from '../assets/library';
import { duplicateSpaceIds } from '../model/duplicates';
import { rowSpaces } from '../model/rows';
import type { AssetObject, Floor, LabelPlacement, MapObject, SpaceObject, TextObject } from '../model/types';
import { CommitInput, toNumber } from '../ui/fields';
import { Icon, type IconName } from '../ui/icons';
import { objectDisplayName } from './CanvasStage';
import { currentFloor, useEditor } from './store';

export function PropertiesPanel() {
  const floor = useEditor((s) => currentFloor(s))!;
  const selection = useEditor((s) => s.selection);
  const enteredRowId = useEditor((s) => s.enteredRowId);
  const st = useEditor.getState;

  const sel = new Set(selection);
  const objs = floor.objects.filter((o) => sel.has(o.id));
  if (objs.length === 0) return null;

  const layerIds = new Set(objs.map((o) => o.layerId));
  const sharedLayer = layerIds.size === 1 ? [...layerIds][0] : '';
  const dupes = duplicateSpaceIds(floor);
  const dupeSelected = objs.filter((o) => dupes.has(o.id));
  const spaces = objs.filter((o): o is SpaceObject => o.kind === 'space');
  const rowIds = new Set(spaces.map((s) => s.rowId));
  const wholeRow =
    objs.length === spaces.length && rowIds.size === 1 && !rowIds.has(undefined) && floor.rows[[...rowIds][0]!]?.count === spaces.length
      ? floor.rows[[...rowIds][0]!]
      : null;
  const single = objs.length === 1 ? objs[0] : null;

  return (
    <div className="properties" data-testid="properties">
      <div className="props-header">
        <strong data-testid="selected-name">
          {single ? objectDisplayName(single) : wholeRow ? rowTitle(floor, wholeRow.id) : `${objs.length} objects selected`}
        </strong>
        <label className="layer-chip">
          Layer
          <select value={sharedLayer} onChange={(e) => st().moveToLayer(selection, e.target.value)} data-testid="object-layer">
            {!sharedLayer && <option value="">Several layers</option>}
            {floor.layers.filter((l) => l.role !== 'background').map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.locked ? ' (locked)' : ''}</option>
            ))}
          </select>
        </label>
      </div>

      {dupeSelected.length > 0 && (
        <div className="callout warning">
          <Icon name="alert" size={16} />
          <span>{dupeSelected.length === 1 ? 'This number is' : `${dupeSelected.length} of these numbers are`} used more than once on this floor.</span>
          <button className="btn small" onClick={() => st().renumber(dupeSelected.map((o) => o.id))}>Renumber</button>
        </div>
      )}

      {single?.kind === 'space' && <SpaceFields s={single} inRow={!!single.rowId} entered={enteredRowId === single.rowId} />}
      {single?.kind === 'asset' && <AssetFields a={single} />}
      {single?.kind === 'text' && <TextFields t={single} />}
      {wholeRow && <RowFields rowId={wholeRow.id} />}
      {!wholeRow && spaces.length > 1 && (
        <div className="btn-row">
          <button className="btn small" onClick={() => st().renumber(spaces.map((s) => s.id))}>Renumber selected spaces</button>
        </div>
      )}

      {single && single.kind !== 'space' && <GeometryFields o={single} />}

      {objs.length >= 2 && <ArrangeButtons count={objs.length} />}

      <div className="btn-row">
        <button className="btn small" onClick={() => st().duplicate()} title="Duplicate (Ctrl+D)"><Icon name="duplicate" size={14} /> Duplicate</button>
        <button className="btn small" onClick={() => st().bringToFront()}>Bring to front</button>
        <button className="btn small" onClick={() => st().sendToBack()}>Send to back</button>
        <button className="btn small danger-text" onClick={() => st().deleteSelection()} title="Delete (Del)"><Icon name="trash" size={14} /> Delete</button>
      </div>
    </div>
  );
}

function rowTitle(floor: Floor, rowId: string) {
  const sp = rowSpaces(floor, rowId);
  return `Row ${sp[0]?.label ?? ''}–${sp[sp.length - 1]?.label ?? ''}`;
}

function useFocusOnEdit() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = () => {
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener('bm:edit-label', h);
    return () => window.removeEventListener('bm:edit-label', h);
  }, []);
  return ref;
}

function SpaceFields({ s, inRow, entered }: { s: SpaceObject; inRow: boolean; entered: boolean }) {
  const ref = useFocusOnEdit();
  const st = useEditor.getState;
  return (
    <div className="fields">
      <label>
        Space number
        <CommitInput ref={ref} value={s.label} maxLength={24} data-testid="space-label"
          onCommit={(v) => st().updateObjects([s.id], { label: v.trim() })} />
      </label>
      <label>
        Number position
        <select value={s.labelPlacement} onChange={(e) => st().updateObjects([s.id], { labelPlacement: e.target.value as LabelPlacement })}>
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <label>
        Fill
        <input type="color" value={s.fill} onChange={(e) => st().updateObjects([s.id], { fill: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={!!s.accessible} onChange={(e) => st().updateObjects([s.id], { accessible: e.target.checked })} />
        Accessible space
      </label>
      {inRow && entered && (
        <p className="hint">
          Editing one space in a row. <button className="link" onClick={() => { st().enterRow(null); st().clearSelection(); st().clickObject(s.id, { additive: false }); }}>Select whole row</button>
        </p>
      )}
    </div>
  );
}

function RowFields({ rowId }: { rowId: string }) {
  const floor = useEditor((s) => currentFloor(s))!;
  const spec = floor.rows[rowId];
  const st = useEditor.getState;
  if (!spec) return null;
  const up = (patch: Parameters<ReturnType<typeof st>['updateRow']>[1]) => st().updateRow(rowId, patch);
  return (
    <div className="fields" data-testid="row-fields">
      <label>
        Spaces
        <CommitInput type="number" value={spec.count} min={1} max={500} data-testid="row-edit-count"
          onCommit={(v) => up({ count: toNumber(v, spec.count, 1, 500) })} />
      </label>
      <label>
        Prefix
        <CommitInput value={spec.prefix} maxLength={12} data-testid="row-edit-prefix" onCommit={(v) => up({ prefix: v })} />
      </label>
      <label>
        Start at
        <CommitInput type="number" value={spec.start} data-testid="row-edit-start" onCommit={(v) => up({ start: Math.round(toNumber(v, spec.start)) })} />
      </label>
      <label>
        Digits
        <select value={spec.digits} onChange={(e) => up({ digits: Number(e.target.value) })}>
          <option value={1}>1, 2, 3</option>
          <option value={2}>01, 02, 03</option>
          <option value={3}>001, 002, 003</option>
        </select>
      </label>
      <label>
        Gap
        <CommitInput type="number" value={spec.gap} min={0} onCommit={(v) => up({ gap: toNumber(v, spec.gap, 0, 500) })} />
      </label>
      <label>
        Width × depth
        <span className="pair">
          <CommitInput type="number" value={spec.spaceWidth} onCommit={(v) => up({ spaceWidth: toNumber(v, spec.spaceWidth, 5, 1000) })} />
          <CommitInput type="number" value={spec.spaceDepth} onCommit={(v) => up({ spaceDepth: toNumber(v, spec.spaceDepth, 5, 1000) })} />
        </span>
      </label>
      <label>
        Number position
        <select value={spec.labelPlacement} onChange={(e) => up({ labelPlacement: e.target.value as LabelPlacement })}>
          <option value="center">Center</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={spec.reverse} onChange={(e) => up({ reverse: e.target.checked })} data-testid="row-reverse" />
        Number from the other end
      </label>
      <p className="hint">Changing these rebuilds the row’s numbers. Double-click a space to edit just that one.</p>
    </div>
  );
}

function AssetFields({ a }: { a: AssetObject }) {
  const doc = useEditor((s) => s.doc)!;
  const floorId = useEditor((s) => s.floorId);
  const ref = useFocusOnEdit();
  const st = useEditor.getState;
  const def = ASSET_BY_KEY[a.assetKey];
  const others = doc.floors.filter((f) => f.id !== floorId);
  return (
    <div className="fields">
      <label>
        Name
        <CommitInput ref={ref} value={a.name ?? ''} maxLength={60} placeholder={def?.name} data-testid="asset-name"
          onCommit={(v) => st().updateObjects([a.id], { name: v.trim() || undefined })} />
      </label>
      <label>
        Label on map
        <CommitInput value={a.label ?? ''} maxLength={40} placeholder="(none)" onCommit={(v) => st().updateObjects([a.id], { label: v.trim() || undefined })} />
      </label>
      {def?.connector && (
        <fieldset className="connects">
          <legend>Connects to</legend>
          {others.length === 0 && <p className="hint">Add another floor to link this {def.name.toLowerCase()} to it.</p>}
          {others.map((f) => (
            <label key={f.id} className="check">
              <input
                type="checkbox"
                checked={a.connectsTo?.includes(f.id) ?? false}
                onChange={(e) => {
                  const cur = a.connectsTo ?? [];
                  st().updateObjects([a.id], { connectsTo: e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id) } as Partial<MapObject>);
                }}
              />
              {f.name}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function TextFields({ t }: { t: TextObject }) {
  const ref = useFocusOnEdit();
  const st = useEditor.getState;
  return (
    <div className="fields">
      <label>
        Text
        <CommitInput ref={ref} value={t.text} maxLength={80} data-testid="text-value" onCommit={(v) => st().updateObjects([t.id], { text: v })} />
      </label>
      <label>
        Size
        <CommitInput type="number" value={t.fontSize} onCommit={(v) => st().updateObjects([t.id], { fontSize: toNumber(v, t.fontSize, 6, 200) })} />
      </label>
      <label>
        Color
        <input type="color" value={t.color} onChange={(e) => st().updateObjects([t.id], { color: e.target.value })} />
      </label>
    </div>
  );
}

function GeometryFields({ o }: { o: MapObject }) {
  const st = useEditor.getState;
  const r = (n: number) => Math.round(n * 10) / 10;
  const up = (patch: Partial<MapObject>) => st().updateObjects([o.id], patch);
  return (
    <details className="geometry">
      <summary>Position and size</summary>
      <div className="fields two">
        <label>X<CommitInput type="number" value={r(o.x)} onCommit={(v) => up({ x: toNumber(v, o.x) })} /></label>
        <label>Y<CommitInput type="number" value={r(o.y)} onCommit={(v) => up({ y: toNumber(v, o.y) })} /></label>
        <label>Width<CommitInput type="number" value={r(o.width)} onCommit={(v) => up({ width: toNumber(v, o.width, 2) })} /></label>
        <label>Height<CommitInput type="number" value={r(o.height)} onCommit={(v) => up({ height: toNumber(v, o.height, 2) })} /></label>
        <label>Rotation°<CommitInput type="number" value={r(o.rotation)} onCommit={(v) => up({ rotation: ((toNumber(v, o.rotation) % 360) + 360) % 360 })} /></label>
      </div>
    </details>
  );
}

const ALIGN: [Parameters<ReturnType<typeof useEditor.getState>['align']>[0], IconName, string][] = [
  ['left', 'alignLeft', 'Align left'],
  ['hcenter', 'alignHCenter', 'Align centers horizontally'],
  ['right', 'alignRight', 'Align right'],
  ['top', 'alignTop', 'Align top'],
  ['vcenter', 'alignVCenter', 'Align middles'],
  ['bottom', 'alignBottom', 'Align bottom'],
];

function ArrangeButtons({ count }: { count: number }) {
  const st = useEditor.getState;
  return (
    <div className="arrange">
      <span className="muted">Align</span>
      <div className="icon-row">
        {ALIGN.map(([op, icon, title]) => (
          <button key={op} className="icon-btn" title={title} aria-label={title} onClick={() => st().align(op)} data-testid={`align-${op}`}>
            <Icon name={icon} size={16} />
          </button>
        ))}
        <button className="icon-btn" title="Distribute horizontally (3 or more)" disabled={count < 3} onClick={() => st().distribute('horizontal')}>
          <Icon name="distH" size={16} />
        </button>
        <button className="icon-btn" title="Distribute vertically (3 or more)" disabled={count < 3} onClick={() => st().distribute('vertical')}>
          <Icon name="distV" size={16} />
        </button>
      </div>
    </div>
  );
}
