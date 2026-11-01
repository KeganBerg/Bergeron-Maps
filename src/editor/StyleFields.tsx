import { ASSET_BY_KEY, resolvePaint } from '../assets/library';
import type { MapObject, ObjectStyle } from '../model/types';
import { spacePaint } from '../render/MapObjects';
import { CommitInput, toNumber } from '../ui/fields';
import { useEditor } from './store';

/** The paint an object shows right now, defaults included. */
export function currentPaint(o: MapObject) {
  if (o.kind === 'space') return { ...spacePaint(o), fillable: true };
  if (o.kind === 'text') {
    return { fill: o.fill ?? '#ffffff', fo: o.fill ? o.fillOpacity ?? 1 : 0, stroke: o.stroke ?? '#27313d', sw: o.strokeWidth ?? 0, fillable: true };
  }
  const def = ASSET_BY_KEY[o.assetKey];
  if (o.imageSrc || !def) return { fill: '#ffffff', fo: o.fillOpacity ?? 1, stroke: o.stroke ?? '#27313d', sw: o.strokeWidth ?? 0, fillable: true };
  return { ...resolvePaint(def, o), fillable: def.fillable !== false };
}

const hex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff');

/**
 * Live edits (sliders, color pickers) become one undo step per drag. The step
 * closes on release, on blur, or after a short pause, whichever comes first.
 */
let idle: ReturnType<typeof setTimeout> | undefined;
const done = () => {
  clearTimeout(idle);
  useEditor.getState().endGesture();
};
function live(ids: string[], patch: (o: MapObject) => Partial<ObjectStyle>) {
  const st = useEditor.getState();
  if (!st.gestureBase) st.beginGesture();
  const set = new Set(ids);
  st.previewGesture((_d, f) => {
    for (const o of f.objects) if (set.has(o.id)) Object.assign(o, patch(o as MapObject));
  });
  clearTimeout(idle);
  idle = setTimeout(done, 600);
}

/**
 * Fill color + fill opacity, and border color + thickness, for everything
 * selected. A border of 0 px hides it, so a space can be just its number.
 */
export function StyleFields({ objs }: { objs: MapObject[] }) {
  const ids = objs.map((o) => o.id);
  const p = currentPaint(objs[0]);
  const fillable = objs.some((o) => currentPaint(o).fillable);
  const image = objs.every((o) => o.kind === 'asset' && !!o.imageSrc);
  const st = useEditor.getState;
  const setAll = (patch: Partial<ObjectStyle>) => st().updateObjects(ids, patch);
  const pct = Math.round(p.fo * 100);
  const isLine = !fillable;

  return (
    <fieldset className="style-fields" data-testid="style-fields">
      <legend>Style</legend>
      {fillable && (
        <div className="style-row">
          <span className="style-label">{image ? 'Image' : 'Fill'}</span>
          {!image && (
            <input type="color" aria-label="Fill color" value={hex(p.fill)} data-testid="style-fill"
              onChange={(e) => live(ids, (o) => ({ fill: e.target.value, ...(o.kind === 'text' && !o.fill ? { fillOpacity: 1 } : {}) }))}
              onBlur={done} />
          )}
          <input type="range" min={0} max={100} step={1} value={pct} aria-label={image ? 'Image opacity' : 'Fill opacity'} data-testid="style-opacity"
            onChange={(e) => live(ids, (o) => ({ fillOpacity: Number(e.target.value) / 100, ...(o.kind === 'text' && !o.fill ? { fill: '#ffffff' } : {}) }))}
            onPointerUp={done} onKeyUp={done} onBlur={done} />
          <span className="style-value">{pct}%</span>
        </div>
      )}
      <div className="style-row">
        <span className="style-label">{isLine ? 'Line' : 'Border'}</span>
        <input type="color" aria-label={isLine ? 'Line color' : 'Border color'} value={hex(p.stroke)} data-testid="style-stroke"
          onChange={(e) => live(ids, () => ({ stroke: e.target.value }))} onBlur={done} />
        <label className="style-px">
          <CommitInput type="number" min={0} max={40} step={0.5} value={Math.round(p.sw * 10) / 10} aria-label="Border thickness in pixels" data-testid="style-stroke-width"
            onCommit={(v) => setAll({ strokeWidth: toNumber(v, p.sw, 0, 40) })} />
          px
        </label>
      </div>
      <div className="style-presets" role="group" aria-label="Border thickness presets">
        {[0, 1, 2, 3].map((n) => (
          <button key={n} className={`btn small${Math.abs(p.sw - n) < 0.01 ? ' active' : ''}`} onClick={() => setAll({ strokeWidth: n })} data-testid={`style-border-${n}`}>
            {n === 0 ? (isLine ? 'Hide' : 'No border') : `${n} px`}
          </button>
        ))}
        <button className="btn small link" title="Back to the library's colors" data-testid="style-reset"
          onClick={() => setAll({ fill: objs[0].kind === 'space' ? '#ffffff' : undefined, fillOpacity: undefined, stroke: undefined, strokeWidth: undefined })}>
          Reset
        </button>
      </div>
    </fieldset>
  );
}
