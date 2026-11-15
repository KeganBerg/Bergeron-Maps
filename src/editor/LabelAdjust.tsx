import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { renderAssetSvg, symbolSupport, type AssetDef } from '../assets/library';
import { badgeLayout } from '../assets/draw';
import { svgDataUrl } from '../assets/style';
import { cleanLabelLayout, LABEL_SCALE_MAX, LABEL_SCALE_MIN, patchLabelLayout } from '../model/labelLayout';
import type { AssetObject, LabelLayout, MapObject } from '../model/types';
import { LABEL_FONT } from '../render/MapObjects';
import { labelSpot } from '../render/labelSpot';
import { useEditor } from './store';

/** Assets whose name (and symbol) are drawn inside them: zones, rooms, buildings. */
export const hasInsideLabel = (def: AssetDef | undefined) => def?.labelPos === 'badge' || def?.labelPos === 'center';

/** Does the object show its round symbol badge right now? */
export function showsBadge(def: AssetDef, a: AssetObject): boolean {
  const sup = symbolSupport(def);
  return sup.custom && !a.symbolHidden && (!!a.symbol || (def.labelPos === 'badge' && sup.builtIn));
}

const PAD_W = 236;
const PAD_H = 170;
const STEP = 0.02;

type Part = 'text' | 'symbol';

/**
 * "Adjust label": a small picture of the zone where the name and the symbol
 * can be dragged anywhere inside it, size sliders for each, and a reset that
 * puts both back in the middle at their usual size.
 */
export function LabelAdjust({ a, def }: { a: AssetObject; def: AssetDef }) {
  const st = useEditor.getState;
  const pad = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Part | null>(null);
  const lay = cleanLabelLayout(a.labelLayout);
  const label = a.labelHidden ? '' : a.label?.trim() ?? '';
  const badge = showsBadge(def, a);
  const zoneWord = def.dashed || /zone/i.test(`${def.key} ${def.name}`) ? 'zone ' : '';

  const k = Math.min(PAD_W / a.width, PAD_H / a.height);
  const w = a.width * k;
  const h = a.height * k;
  // The zone drawn upright with its symbol (moved and sized as now), but without the name, which the pad draws.
  const picture = useMemo(
    () => svgDataUrl(renderAssetSvg(def, { ...a, rotation: 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, a.width, a.height, a.fill, a.fillOpacity, a.stroke, a.strokeWidth, a.symbol, a.symbolHidden, a.labelHidden, a.labelLayout],
  );
  const spot = label ? labelSpot(def, a) : null;
  const b = badgeLayout(a.width, a.height);
  const sym = lay?.symbol ?? (a.labelHidden ? { x: 0.5, y: 0.5 } : { x: b.cx / a.width, y: b.cy / a.height });
  const symR = b.r * (lay?.symbolScale ?? 1) * k;

  const write = (patch: Partial<LabelLayout>, preview: boolean) => {
    const next = patchLabelLayout(findSelf(a.id)?.labelLayout, patch);
    if (preview) {
      st().previewGesture((_d, f) => {
        const o = f.objects.find((x) => x.id === a.id);
        if (o && o.kind === 'asset') o.labelLayout = next;
      });
    } else st().updateObjects([a.id], { labelLayout: next } as Partial<MapObject>);
  };

  // Keeps the whole name or symbol inside the zone, not just its middle.
  const keepIn = (el: HTMLElement, p: { x: number; y: number }) => {
    const r = pad.current!.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const mx = Math.min(0.5, b.width / 2 / r.width);
    const my = Math.min(0.5, b.height / 2 / r.height);
    return { x: Math.min(1 - mx, Math.max(mx, p.x)), y: Math.min(1 - my, Math.max(my, p.y)) };
  };
  const at = (e: PointerEvent<HTMLElement>) => {
    const r = pad.current!.getBoundingClientRect();
    return keepIn(e.currentTarget, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };
  const down = (part: Part) => (e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(part);
    st().beginGesture();
  };
  const move = (part: Part) => (e: PointerEvent<HTMLElement>) => {
    if (dragging !== part) return;
    write({ [part]: at(e) }, true);
  };
  const up = (e: PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(null);
    st().endGesture();
  };
  const nudge = (part: Part, cur: { x: number; y: number }) => (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? STEP * 5 : STEP;
    write({ [part]: keepIn(e.currentTarget as HTMLElement, { x: cur.x + d[0] * step, y: cur.y + d[1] * step }) }, false);
  };
  const textAt = spot ? { x: spot.x / a.width, y: spot.y / a.height } : { x: 0.5, y: 0.5 };

  return (
    <details className="label-adjust" data-testid="label-adjust">
      <summary>Adjust {zoneWord}label</summary>
      <p className="hint">Drag the name or the symbol to anywhere inside the {zoneWord ? 'zone' : 'shape'}.</p>
      <div className="label-pad-wrap">
        <div ref={pad} className="label-pad" style={{ width: w, height: h }} data-testid="label-pad">
          <img src={picture} alt="" draggable={false} width={w} height={h} />
          {badge && (
            <button
              type="button"
              className={`label-handle symbol${dragging === 'symbol' ? ' on' : ''}`}
              style={{ left: `${sym.x * 100}%`, top: `${sym.y * 100}%`, width: Math.max(22, symR * 2 + 6), height: Math.max(22, symR * 2 + 6) }}
              aria-label="Symbol position. Drag, or use the arrow keys."
              onPointerDown={down('symbol')}
              onPointerMove={move('symbol')}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={nudge('symbol', sym)}
              data-testid="label-handle-symbol"
            />
          )}
          {spot && (
            <button
              type="button"
              className={`label-handle text${dragging === 'text' ? ' on' : ''}`}
              style={{ left: `${textAt.x * 100}%`, top: `${textAt.y * 100}%`, fontSize: Math.max(7, spot.size * k), fontFamily: LABEL_FONT }}
              aria-label="Name position. Drag, or use the arrow keys."
              onPointerDown={down('text')}
              onPointerMove={move('text')}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={nudge('text', textAt)}
              data-testid="label-handle-text"
            >
              {label}
            </button>
          )}
        </div>
      </div>
      {!spot && !badge && <p className="hint">The name and symbol are both hidden.</p>}
      {spot && (
        <ScaleSlider label="Text size" value={lay?.textScale ?? 1} testId="label-text-size" onChange={(v) => write({ textScale: v }, false)} />
      )}
      {badge && (
        <ScaleSlider label="Symbol size" value={lay?.symbolScale ?? 1} testId="label-symbol-size" onChange={(v) => write({ symbolScale: v }, false)} />
      )}
      <button
        className="btn small"
        disabled={!lay}
        onClick={() => st().updateObjects([a.id], { labelLayout: undefined } as Partial<MapObject>)}
        data-testid="label-reset"
      >
        Reset to center
      </button>
    </details>
  );
}

/** The object as it is in the store right now (a drag reads it between renders). */
function findSelf(id: string): AssetObject | undefined {
  for (const f of useEditor.getState().doc?.floors ?? []) {
    const o = f.objects.find((x) => x.id === id);
    if (o) return o.kind === 'asset' ? o : undefined;
  }
  return undefined;
}

function ScaleSlider({ label, value, testId, onChange }: { label: string; value: number; testId: string; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="slider-field">
      <span>{label}</span>
      <input
        type="range"
        min={LABEL_SCALE_MIN * 100}
        max={LABEL_SCALE_MAX * 100}
        step={5}
        value={pct}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        data-testid={testId}
      />
      <span className="num">{pct}%</span>
    </div>
  );
}
