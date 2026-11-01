import { useMemo, useState } from 'react';
import { highestNumber, rowLabels } from '../model/numbering';
import { DEFAULT_ROW } from '../model/rows';
import type { LabelPlacement, RowSpec } from '../model/types';
import { Dialog } from '../ui/Dialog';
import { currentFloor, useEditor } from './store';

type Form = Omit<RowSpec, 'id'> & { rotation: number };

export function RowDialog() {
  const dlg = useEditor((s) => s.rowDialog)!;
  const floor = useEditor((s) => currentFloor(s))!;
  const close = useEditor((s) => s.closeRowDialog);
  const addRow = useEditor((s) => s.addRow);

  const existing = useMemo(() => floor.objects.flatMap((o) => (o.kind === 'space' ? [o.label] : [])), [floor]);
  const nextStart = (prefix: string, suffix: string) => (highestNumber(existing, prefix, suffix) ?? 0) + 1;

  const [form, setForm] = useState<Form>(() => ({
    ...DEFAULT_ROW,
    count: dlg.count ?? DEFAULT_ROW.count,
    start: nextStart('', ''),
    rotation: dlg.anchor.rotation,
  }));
  const [startTouched, setStartTouched] = useState(false);
  const [more, setMore] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if ((k === 'prefix' || k === 'suffix') && !startTouched) next.start = nextStart(next.prefix, next.suffix);
      return next;
    });
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  const labels = rowLabels(form);
  const clashes = labels.filter((l) => existing.some((e) => e.trim().toUpperCase() === l.toUpperCase()));
  const preview = labels.length <= 4 ? labels.join(', ') : `${labels.slice(0, 3).join(', ')}, … ${labels[labels.length - 1]}`;

  const submit = () => {
    const { rotation, ...spec } = form;
    addRow(spec, { ...dlg.anchor, rotation });
  };

  return (
    <Dialog
      title="Add a row of parking spaces"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={submit} data-testid="create-row">
            Create {form.count} space{form.count === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          Number of spaces
          <input type="number" min={1} max={500} value={form.count} autoFocus data-testid="row-count"
            onChange={(e) => set('count', num(e.target.value, 1, 500, 1))} />
        </label>
        <label>
          Prefix
          <input value={form.prefix} maxLength={12} placeholder="e.g. A or B-" data-testid="row-prefix" onChange={(e) => set('prefix', e.target.value)} />
        </label>
        <label>
          Start at
          <input type="number" value={form.start} data-testid="row-start"
            onChange={(e) => {
              setStartTouched(true);
              set('start', Math.round(num(e.target.value, -9999, 99999, 1)));
            }} />
        </label>
        <label>
          Digits
          <select value={form.digits} onChange={(e) => set('digits', Number(e.target.value))}>
            <option value={1}>1, 2, 3</option>
            <option value={2}>01, 02, 03</option>
            <option value={3}>001, 002, 003</option>
          </select>
        </label>
        {more && (
          <>
            <label>
              Suffix
              <input value={form.suffix} maxLength={12} onChange={(e) => set('suffix', e.target.value)} />
            </label>
            <label>
              Row direction
              <select value={String(form.rotation)} onChange={(e) => set('rotation', Number(e.target.value))}>
                {![0, 90, 180, 270].includes(form.rotation) && <option value={form.rotation}>As drawn ({Math.round(form.rotation)}°)</option>}
                <option value="0">Left to right</option>
                <option value="180">Right to left</option>
                <option value="90">Top to bottom</option>
                <option value="270">Bottom to top</option>
              </select>
            </label>
            <label>
              Space width
              <input type="number" min={5} value={form.spaceWidth} onChange={(e) => set('spaceWidth', num(e.target.value, 5, 1000, 45))} />
            </label>
            <label>
              Space depth
              <input type="number" min={5} value={form.spaceDepth} onChange={(e) => set('spaceDepth', num(e.target.value, 5, 1000, 90))} />
            </label>
            <label>
              Gap between spaces
              <input type="number" min={0} value={form.gap} onChange={(e) => set('gap', num(e.target.value, 0, 500, 0))} />
            </label>
            <label>
              Number position
              <select value={form.labelPlacement} onChange={(e) => set('labelPlacement', e.target.value as LabelPlacement)}>
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={form.reverse} onChange={(e) => set('reverse', e.target.checked)} />
              Number from the other end
            </label>
          </>
        )}
        <button type="submit" hidden />
      </form>
      <button className="link" onClick={() => setMore((m) => !m)}>{more ? 'Fewer options' : 'More options (size, spacing, direction)'}</button>
      <p className="preview" data-testid="row-preview">Spaces will be numbered <strong>{preview}</strong></p>
      {clashes.length > 0 && (
        <p className="warning-text">
          {clashes.length} of these numbers already exist on this floor ({clashes.slice(0, 3).join(', ')}
          {clashes.length > 3 ? '…' : ''}). Change the prefix or starting number to avoid duplicates.
        </p>
      )}
    </Dialog>
  );
}
