/**
 * The side view of a site's floors (see model/sideView.ts). `SideViewDrawing`
 * is plain SVG with no browser-only code, so the website renders the very same
 * drawing from the same data (scripts/site-demo.ts).
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SideLink, SideViewModel } from '../model/sideView';
import { floorColor, floorTextColor } from '../theme';
import { Icon } from '../ui/icons';

const CAR = 'M1 11V6l5-5h11l6 5h2v5z';

export function SideViewDrawing({ model, width, currentId, accent = '#d97706', onPick, idPrefix = 'sv' }: {
  model: SideViewModel;
  width: number;
  currentId?: string;
  accent?: string;
  onPick?: (floorId: string) => void;
  idPrefix?: string;
}) {
  const n = model.floors.length;
  const rowH = n <= 4 ? 76 : n <= 8 ? 60 : 46;
  const tagW = Math.round(Math.min(104, Math.max(56, width * 0.2)));
  const left = tagW + 18;
  const right = width - 12;
  const bw = Math.max(40, right - left);
  const top = model.mark ? 52 : 18;
  const slab = (level: number) => top + (n - level) * rowH;
  const X = (f: number) => left + f * bw;
  const groundY = slab(model.ground);
  const height = slab(0) + 26;
  const chars = Math.max(3, Math.floor((tagW - 12) / 8));
  const short = (s: string) => (s.length > chars ? `${s.slice(0, chars - 1)}…` : s);

  const key = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(id); }
  };

  const link = (l: SideLink, i: number) => {
    const x0 = X(l.x0), x1 = X(l.x1);
    if (l.kind === 'ramp') {
      return <path key={i} className="sv-ramp" d={`M${x0} ${slab(l.from)}L${x1} ${slab(l.to)}`} strokeWidth={3} />;
    }
    const y0 = slab(l.to) - rowH * 0.7, y1 = slab(l.from);
    const steps: string[] = [];
    if (l.kind === 'stairs' || l.kind === 'escalator') {
      // A flight between each pair of floors, switching back like real stairs.
      for (let v = l.from; v < l.to; v++) {
        const a = slab(v), b = slab(v + 1);
        steps.push((v - l.from) % 2 ? `M${x1} ${a}L${x0} ${b}` : `M${x0} ${a}L${x1} ${b}`);
      }
    }
    return (
      <g key={i} className={`sv-${l.kind}`}>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} strokeWidth={1.5} fill="currentColor" fillOpacity={0.06} />
        {steps.length > 0 && <path d={steps.join('')} strokeWidth={1.5} />}
        {l.kind === 'elevator' && <path d={`M${(x0 + x1) / 2} ${y0}V${y1}`} strokeWidth={1} strokeDasharray="3 3" />}
      </g>
    );
  };

  const mark = model.mark;
  const mx = mark ? X(mark.x) : 0;
  const my = mark ? slab(mark.level) : 0;
  const flip = mx > left + bw * 0.55;
  const calloutY = top - 30;
  // The callout's words sit on its leader line, kept inside the drawing on a narrow phone (about 7px a letter at 13px).
  const textW = mark ? mark.text.length * 6.6 : 0;
  const elbow = mx + (flip ? -20 : 20);
  const tx = flip ? Math.min(elbow, Math.max(textW + 6, elbow)) : Math.max(6, Math.min(width - 6 - textW, elbow));
  const lineTo = flip ? tx - textW : tx + textW;

  return (
    <svg className="sv" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" stroke="currentColor"
      role="group" aria-label="Side view of the floors">
      {/* Underground: shaded below the ground line. */}
      {model.ground > 0 && <rect x={0} y={groundY} width={width} height={slab(0) - groundY + 8} fill="currentColor" fillOpacity={0.05} stroke="none" />}
      {/* Columns. */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <path key={f} className="sv-col" d={`M${X(f)} ${slab(n - 1)}V${slab(0)}`} strokeWidth={1} strokeOpacity={0.45} />
      ))}
      {model.links.map(link)}
      {model.floors.map((f, i) => {
        const y = slab(i);
        const current = f.id === currentId;
        const cars: number[] = [];
        if (rowH >= 44)
          for (const [a, b] of f.parked) {
            const from = X(a), to = X(b);
            const count = Math.max(1, Math.floor((to - from) / 32));
            const gap = (to - from) / count;
            for (let k = 0; k < count; k++) {
              const cx = from + gap * k + (gap - 26) / 2;
              // The found space's car is drawn on its own, in the highlight color.
              if (!(mark?.space && mark.level === i && Math.abs(cx + 13 - mx) < 22)) cars.push(cx);
            }
          }
        const label = [f.name, current ? 'shown now' : '', f.spaces ? `${f.spaces} ${f.spaces === 1 ? 'space' : 'spaces'}` : ''].filter(Boolean).join(', ');
        return (
          <g key={f.id} className={`sv-floor${current ? ' current' : ''}`} data-floor={f.id}
            {...(onPick ? { role: 'button', tabIndex: 0, 'aria-label': `Open ${label}`, 'aria-current': current || undefined, onClick: () => onPick(f.id), onKeyDown: key(f.id) } : {})}>
            <rect className="sv-hit" x={0} y={y - rowH} width={width} height={rowH} fill="currentColor" fillOpacity={current ? 0.07 : 0} stroke="none" />
            <path className="sv-slab" d={`M${left} ${y}H${right}`} strokeWidth={current ? 5 : 4} />
            {cars.map((cx, k) => (
              <path key={k} d={CAR} transform={`translate(${cx} ${y - 14})`} strokeWidth={1.2} strokeOpacity={0.55} />
            ))}
            <rect x={6} y={y - 30} width={tagW - 6} height={26} rx={3} fill={floorColor(f.colorIndex)} stroke="none" />
            {current && <rect x={3} y={y - 33} width={tagW} height={32} rx={5} strokeWidth={2} />}
            <text x={6 + (tagW - 6) / 2} y={y - 12} textAnchor="middle" fontSize={13} fontWeight={700} fill={floorTextColor(f.colorIndex)} stroke="none">{short(f.name)}</text>
          </g>
        );
      })}
      {/* Ground line with hatching. */}
      <path d={`M0 ${groundY}H${width}`} strokeWidth={1.5} />
      <path d={Array.from({ length: Math.ceil(width / 14) }, (_, k) => `M${k * 14 + 10} ${groundY}l-8 9`).join('')} strokeWidth={0.7} strokeOpacity={0.7} />
      {model.route && (
        <g className="sv-route" style={{ stroke: accent }}>
          <path d={model.route.points.map(([x, l], k) => `${k ? 'L' : 'M'}${X(x)} ${slab(l) - 7}`).join('')} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={X(model.route.points[0][0])} cy={slab(model.route.points[0][1]) - 7} r={5} style={{ fill: accent }} stroke="none" />
        </g>
      )}
      {mark && (
        <g className="sv-mark" style={{ stroke: accent, color: accent }}>
          {mark.space
            ? <path d={CAR} transform={`translate(${mx - 13} ${my - 14})`} strokeWidth={2.2} fill="none" />
            : <circle cx={mx} cy={my - 9} r={7} strokeWidth={2.2} />}
          <path d={`M${mx} ${my - 16}L${elbow} ${calloutY}M${Math.min(elbow, tx, lineTo)} ${calloutY}H${Math.max(elbow, tx, lineTo)}`} strokeWidth={1.2} />
          <circle cx={mx} cy={my - 16} r={3.5} style={{ fill: accent }} stroke="none" />
          <text x={tx} y={calloutY - 6} textAnchor={flip ? 'end' : 'start'} fontSize={13} fontWeight={600} style={{ fill: accent }} stroke="none"
            data-testid={`${idPrefix}-callout`}>{mark.text}</text>
        </g>
      )}
    </svg>
  );
}

const KIND_NAMES: Record<SideLink['kind'], string> = { ramp: 'Ramp', stairs: 'Stairs', escalator: 'Escalator', elevator: 'Elevator' };

/** The sheet in the viewer: the drawing, a key, and tap a floor to open it. */
export function SideViewSheet({ model, currentId, title, onPick, onClose }: {
  model: SideViewModel;
  currentId: string;
  title: string;
  onPick: (floorId: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // clientWidth counts the body's side padding: the drawing gets what's inside it.
    const measure = () => {
      const cs = getComputedStyle(el);
      setWidth(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const kinds = [...new Set(model.links.map((l) => l.kind))];
  return (
    <div className="dir-sheet side-view" role="region" aria-label={title} tabIndex={-1} data-testid="side-view"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
      <div className="dir-head">
        <div>
          <strong>{title}</strong>
          <span className="muted">Tap a floor to open it.</span>
        </div>
        <button className="icon-btn" aria-label="Close side view" onClick={onClose} data-testid="side-view-close"><Icon name="close" /></button>
      </div>
      <div className="side-view-body" ref={box}>
        {width > 0 && <SideViewDrawing model={model} width={width} currentId={currentId} onPick={onPick} accent="var(--sv-accent)" />}
      </div>
      <p className="side-view-key muted" data-testid="side-view-key">
        {kinds.length
          ? [...kinds.map((k) => KIND_NAMES[k]), model.route ? 'Your route' : ''].filter(Boolean).join(' · ')
          : 'No ramps, stairs or elevators connect these floors on the map yet.'}
      </p>
    </div>
  );
}
