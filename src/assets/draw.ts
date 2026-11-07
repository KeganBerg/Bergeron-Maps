/**
 * Shared drawing recipes. Each category file builds its assets from these so
 * that equivalent things (all zones, all rooms, all signs, all vehicles) look
 * like one family.
 */
import { glyph } from './glyphs';
import { symbolSvg } from './symbols';
import { boxRect, F, FS, fitText, icon, P, r2, S, shade, text, type DrawCtx, type DrawFn } from './style';

// ---------------------------------------------------------------- badges

/** Where the round badge and the name sit inside a room, zone or building. */
export function badgeLayout(w: number, h: number) {
  const r = Math.max(7, Math.min(20, Math.min(w, h) * 0.17));
  const fitsBoth = h >= r * 4.2;
  return { r, cx: w / 2, cy: fitsBoth ? h / 2 - r * 0.75 : h / 2, labelY: fitsBoth ? h / 2 + r * 0.95 : h / 2 };
}

/** White disc with a colored ring and symbol: the library's one "what is this place" marker. */
export function badge(name: string, cx: number, cy: number, r: number, color: string): string {
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="#ffffff" stroke="${color}" stroke-width="${r2(Math.max(1, r * 0.14))}"/>${glyph(name, cx, cy, r * 1.25, color)}`;
}

/**
 * The symbol an object shows: its chosen Material symbol, nothing when the
 * symbol is switched off, or the asset's built-in glyph `g`.
 */
export function symbolMark(c: DrawCtx, g: string | undefined, cx: number, cy: number, size: number, color: string): string {
  if (c.symbol === null) return '';
  if (c.symbol) return symbolSvg(c.symbol.path, cx, cy, size, color);
  return g ? glyph(g, cx, cy, size, color) : '';
}

/** Whether this object draws any symbol (built-in or chosen). */
export const hasSymbol = (c: DrawCtx, g?: string) => c.symbol !== null && (!!c.symbol || !!g);

/** `badge`, honoring the object's symbol choice. */
export function badgeFor(c: DrawCtx, g: string | undefined, cx: number, cy: number, r: number, color: string): string {
  if (!hasSymbol(c, g)) return '';
  return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="#ffffff" stroke="${color}" stroke-width="${r2(Math.max(1, r * 0.14))}"/>${symbolMark(c, g, cx, cy, r * (c.symbol ? 1.3 : 1.25), color)}`;
}

const raisedShadow = (x: number, y: number, w: number, h: number, rx = 0, off = 1.5) =>
  `<rect x="${r2(x + off)}" y="${r2(y + off * 1.3)}" width="${r2(w)}" height="${r2(h)}" rx="${rx}" fill="${P.shadow}"/>`;

// ---------------------------------------------------------------- zones, rooms, buildings

export interface ZoneOpts {
  glyph?: string;
  hatch?: string;
  dash?: boolean;
}

/** A painted or marked operating area: tinted fill, dashed edge, badge. */
export const zone = (o: ZoneOpts = {}): DrawFn => (c) => {
  const i = c.sw / 2;
  const id = `h${Math.round(c.w)}x${Math.round(c.h)}`;
  const hatch = o.hatch
    ? `<defs><pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="14" fill="${o.hatch}" fill-opacity="${Math.min(1, c.fo + 0.25)}"/></pattern></defs><rect x="${r2(i)}" y="${r2(i)}" width="${r2(c.w - c.sw)}" height="${r2(c.h - c.sw)}" fill="url(#${id})"/>`
    : '';
  const dash = o.dash === false || c.sw <= 0 ? '' : `stroke-dasharray="${r2(c.sw * 4)} ${r2(c.sw * 2.5)}"`;
  const b = badgeLayout(c.w, c.h);
  return `${boxRect(c, 4, dash)}${hatch}${badgeFor(c, o.glyph, b.cx, b.cy, b.r, shade(c.stroke, 0))}`;
};

/** An interior room: floor tint, solid walls, a door swing, and a badge. */
export const room = (g?: string, badgeColor: string = P.inkSoft): DrawFn => (c) => {
  const b = badgeLayout(c.w, c.h);
  const dw = Math.min(36, c.w * 0.3);
  const dx = Math.max(c.sw + 4, c.w * 0.14);
  const y = c.h - c.sw / 2;
  const door = c.sw > 0 && c.h > 40
    ? `<rect x="${r2(dx)}" y="${r2(c.h - c.sw - 0.5)}" width="${r2(dw)}" height="${r2(c.sw + 1)}" fill="${P.room}"/><path d="M${r2(dx)} ${r2(y)} v${r2(-dw)} a${r2(dw)} ${r2(dw)} 0 0 1 ${r2(dw)} ${r2(dw)}" fill="none" stroke="${P.inkSoft}" stroke-width="1" stroke-dasharray="3 2"/>`
    : '';
  return `${boxRect(c)}${door}${badgeFor(c, g, b.cx, b.cy, b.r, badgeColor)}`;
};

/** A building footprint seen from above: roof with hip lines, outline, badge. */
export const building = (g?: string, badgeColor: string = P.inkSoft): DrawFn => (c) => {
  const i = c.sw / 2 + 0.5;
  const inset = Math.min(c.w, c.h) * 0.5;
  const x1 = Math.min(inset, c.w / 2);
  const x2 = Math.max(c.w - inset, c.w / 2);
  const ridge = `<path d="M${r2(i)} ${r2(i)} L${r2(x1)} ${r2(c.h / 2)} L${r2(i)} ${r2(c.h - i)} M${r2(c.w - i)} ${r2(i)} L${r2(x2)} ${r2(c.h / 2)} L${r2(c.w - i)} ${r2(c.h - i)} M${r2(x1)} ${r2(c.h / 2)} H${r2(x2)}" fill="none" stroke="${shade(c.fill, 0.18)}" stroke-width="1.2"/>`;
  const b = badgeLayout(c.w, c.h);
  return `${raisedShadow(0, 0, c.w, c.h, 2, 3)}${boxRect(c, 2)}${ridge}${badgeFor(c, g, b.cx, b.cy, b.r, badgeColor)}`;
};

/** A service bay: concrete floor, painted bay lines, a door at the front. */
export const bay = (g: string, extra: (c: DrawCtx) => string = () => ''): DrawFn => (c) => {
  const b = badgeLayout(c.w, c.h);
  const door = `<rect x="${r2(c.w * 0.12)}" y="${r2(c.h - 4)}" width="${r2(c.w * 0.76)}" height="4" fill="${P.steel}" stroke="${P.steelDark}" stroke-width="0.8"/>`;
  return `${boxRect(c)}<path d="M${r2(c.w * 0.1)} ${r2(c.h * 0.06)} V${r2(c.h * 0.9)} M${r2(c.w * 0.9)} ${r2(c.h * 0.06)} V${r2(c.h * 0.9)}" stroke="${P.paintYellow}" stroke-width="2.5"/>${extra(c)}${door}${badgeFor(c, g, b.cx, b.cy, b.r, P.inkSoft)}`;
};

// ---------------------------------------------------------------- pins and markers

/** Teardrop map pin with a symbol or short text (number / letter). */
export const pin = (g?: string): DrawFn => icon(40, 52, (c) => {
  const content = hasSymbol(c, g)
    ? symbolMark(c, g, 20, 18.5, c.symbol ? 16 : 17, c.fill)
    : text(20, 18.5, fitText(22, c.label.length || 1, 15), c.label || '1', c.fill);
  return `<ellipse cx="21.5" cy="50" rx="7" ry="2" fill="${P.shadow}"/><path d="M20 50S5 32 5 19a15 15 0 0 1 30 0c0 13-15 31-15 31Z" ${FS(c)}/><circle cx="20" cy="18.5" r="11" fill="#ffffff"/>${content}`;
});

/** Round numbered / lettered marker, flat like a printed map key. */
export const disc = (fallback: string): DrawFn => icon(40, 40, (c) => {
  const t = c.label || fallback;
  const inner = c.symbol ? symbolMark(c, undefined, 20, 20, 24, '#ffffff') : text(20, 20.5, fitText(28, t.length, 18), t, '#ffffff');
  return `<circle cx="21" cy="22" r="17" fill="${P.shadow}"/><circle cx="20" cy="20" r="17" ${FS(c)}/>${inner}`;
});

// ---------------------------------------------------------------- signs (front face)

/** A sign face on a short post, the way signs are drawn on site plans. */
const post = (cx: number, top: number, bottom: number) =>
  `<rect x="${r2(cx - 1.5)}" y="${r2(top)}" width="3" height="${r2(bottom - top)}" fill="${P.steelDark}"/>`;

export const signRect = (o: { bg: string; fg: string; lines: string[]; glyph?: string; border?: string }): DrawFn =>
  icon(56, 64, (c) => {
    const bg = c.fill;
    const n = o.lines.length;
    const hasG = !!o.glyph;
    const top = 4;
    const h = 44;
    const gy = hasG ? top + (n ? 13 : 22) : 0;
    const longest = Math.max(...o.lines.map((l) => l.length), 1);
    const size = Math.min(n > 2 ? 8 : 10, fitText(44, longest, 11));
    const startY = hasG ? top + 27 : top + h / 2 - ((n - 1) * size * 1.15) / 2;
    const lines = o.lines.map((l, i) => text(28, startY + i * size * 1.15, size, l, o.fg)).join('');
    return `${post(28, top + h, 62)}<rect x="5" y="${top + 1.5}" width="48" height="${h}" rx="4" fill="${P.shadow}"/><rect x="4" y="${top}" width="48" height="${h}" rx="4" fill="${bg}" fill-opacity="${c.fo}" ${S(c)}/>${o.border ? `<rect x="7" y="${top + 3}" width="42" height="${h - 6}" rx="2.5" fill="none" stroke="${o.border}" stroke-width="1.5"/>` : ''}${hasG ? glyph(o.glyph!, 28, gy, n ? 15 : 26, o.fg) : ''}${lines}`;
  });

/** Custom sign: prints the object's own label. */
export const customSign: DrawFn = icon(56, 64, (c) => {
  const t = c.label || 'SIGN';
  const words = t.toUpperCase().split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 10) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  const withSym = !!c.symbol;
  const ls = lines.slice(0, withSym ? 2 : 3);
  const size = Math.min(withSym ? 8 : 10, fitText(42, Math.max(...ls.map((l) => l.length)), 11));
  const mid = withSym ? 36 : 26;
  const y0 = mid - ((ls.length - 1) * size * 1.15) / 2;
  const sym = withSym ? symbolMark(c, undefined, 28, 17, 20, '#ffffff') : '';
  return `${post(28, 48, 62)}<rect x="5" y="5.5" width="48" height="44" rx="4" fill="${P.shadow}"/><rect x="4" y="4" width="48" height="44" rx="4" ${FS(c)}/>${sym}${ls.map((l, i) => text(28, y0 + i * size * 1.15, size, l, '#ffffff')).join('')}`;
});

export const signOctagon = (word: string): DrawFn => icon(56, 64, (c) => {
  const pts = [[19, 4], [37, 4], [50, 17], [50, 35], [37, 48], [19, 48], [6, 35], [6, 17]].map((p) => p.join(' ')).join(' ');
  return `${post(28, 48, 62)}<polygon points="${pts}" transform="translate(1 1.5)" fill="${P.shadow}"/><polygon points="${pts}" ${F(c)} ${S(c)}/><polygon points="${pts}" fill="none" stroke="#fff" stroke-width="2" transform="translate(28 26) scale(0.88) translate(-28 -26)"/>${text(28, 26.5, 11.5, word, '#ffffff')}`;
});

export const signTriangle = (o: { word?: string; glyph?: string; fg?: string; down?: boolean }): DrawFn => icon(56, 64, (c) => {
  const pts = o.down ? '4 6 52 6 28 48' : '28 4 53 47 3 47';
  const inner = o.down ? '11 10 45 10 28 39' : '28 12 46 44 10 44';
  const cy = o.down ? 19 : 34;
  return `${post(28, o.down ? 48 : 47, 62)}<polygon points="${pts}" transform="translate(1 1.5)" fill="${P.shadow}"/><polygon points="${pts}" ${F(c)} ${S(c)}/><polygon points="${inner}" fill="${o.down ? '#ffffff' : 'none'}"/>${o.word ? text(28, cy, 7, o.word, o.fg ?? P.danger) : ''}${o.glyph ? glyph(o.glyph, 28, cy, 17, o.fg ?? P.ink) : ''}`;
});

export const signDiamond = (g: string, fg: string = P.ink, word?: string): DrawFn => icon(56, 64, (c) => {
  const pts = '28 3 51 26 28 49 5 26';
  return `${post(28, 49, 62)}<polygon points="${pts}" transform="translate(1 1.5)" fill="${P.shadow}"/><polygon points="${pts}" ${F(c)} ${S(c)}/><polygon points="28 6.5 47.5 26 28 45.5 8.5 26" fill="none" stroke="${fg}" stroke-width="1.6"/>${word ? text(28, 26, 7.5, word, fg) : glyph(g, 28, 26, 22, fg)}`;
});

export const signCircle = (o: { glyph?: string; word?: string; fg: string; ring?: string; slash?: boolean }): DrawFn =>
  icon(56, 64, (c) => {
    const ring = o.ring ? `<circle cx="28" cy="26" r="19" fill="none" stroke="${o.ring}" stroke-width="5"/>` : '';
    const slash = o.slash ? `<path d="M14.5 12.5 41.5 39.5" stroke="${o.ring ?? P.danger}" stroke-width="5"/>` : '';
    return `${post(28, 48, 62)}<circle cx="29" cy="27.5" r="22" fill="${P.shadow}"/><circle cx="28" cy="26" r="22" ${F(c)} ${S(c)}/>${o.glyph ? glyph(o.glyph, 28, 26, 24, o.fg) : ''}${o.word ? text(28, 26.5, fitText(30, o.word.length, 18), o.word, o.fg) : ''}${ring}${slash}`;
  });

// ---------------------------------------------------------------- vehicles (top-down, front at the top)

export interface VehicleSpec {
  W: number;
  L: number;
  r: number;
  hood: number;
  ws: number;
  roof: number;
  rw: number;
  open?: boolean;
  rails?: boolean;
  bed?: number;
  boxFrom?: number;
  ev?: boolean;
  sliding?: boolean;
}

export const vehicle = (v: VehicleSpec): DrawFn => icon(v.W + 4, v.L + 4, (c) => {
  const x = 2, y = 2, W = v.W, L = v.L;
  const cab = y + v.hood;
  const inset = W * 0.12;
  const glass = (y1: number, y2: number, narrowTop: boolean) => {
    const a = narrowTop ? inset * 1.6 : inset;
    const b = narrowTop ? inset : inset * 1.6;
    return `<path d="M${r2(x + a)} ${r2(y1)} H${r2(x + W - a)} L${r2(x + W - b)} ${r2(y2)} H${r2(x + b)} Z" fill="${P.glass}" stroke="${P.glassDark}" stroke-width="0.6"/>`;
  };
  let detail = '';
  // windshield
  detail += glass(cab, cab + v.ws, true);
  const roofY = cab + v.ws;
  if (v.open) {
    detail += `<rect x="${r2(x + inset)}" y="${r2(roofY)}" width="${r2(W - inset * 2)}" height="${r2(v.roof)}" rx="2" fill="${P.ink}" fill-opacity="0.8"/>`;
    detail += `<rect x="${r2(x + inset * 1.5)}" y="${r2(roofY + 2)}" width="${r2(W / 2 - inset * 2)}" height="${r2(v.roof * 0.42)}" rx="2" fill="${P.steel}"/><rect x="${r2(x + W / 2 + inset * 0.5)}" y="${r2(roofY + 2)}" width="${r2(W / 2 - inset * 2)}" height="${r2(v.roof * 0.42)}" rx="2" fill="${P.steel}"/>`;
  } else {
    detail += `<rect x="${r2(x + inset)}" y="${r2(roofY)}" width="${r2(W - inset * 2)}" height="${r2(v.roof)}" rx="2" fill="#000" fill-opacity="0.07"/>`;
    if (v.rails) detail += `<path d="M${r2(x + inset + 1.5)} ${r2(roofY + 2)} v${r2(v.roof - 4)} M${r2(x + W - inset - 1.5)} ${r2(roofY + 2)} v${r2(v.roof - 4)}" stroke="${P.ink}" stroke-width="1.2"/>`;
    if (v.ev) detail += glyph('bolt', x + W / 2, roofY + v.roof / 2, Math.min(W * 0.5, v.roof * 0.6), P.go);
    if (v.sliding) detail += `<path d="M${r2(x + 0.8)} ${r2(roofY + v.roof * 0.25)} v${r2(v.roof * 0.5)} M${r2(x + W - 0.8)} ${r2(roofY + v.roof * 0.25)} v${r2(v.roof * 0.5)}" stroke="${P.ink}" stroke-width="0.8"/>`;
  }
  const rearY = roofY + v.roof;
  if (v.rw > 0) detail += glass(rearY, rearY + v.rw, false);
  if (v.bed) {
    const by = y + L - v.bed - 1.5;
    detail += `<rect x="${r2(x + inset * 0.6)}" y="${r2(by)}" width="${r2(W - inset * 1.2)}" height="${r2(v.bed)}" rx="1.5" fill="${P.ink}" fill-opacity="0.18" stroke="${P.ink}" stroke-width="0.8"/>`;
  }
  if (v.boxFrom) {
    const by = y + v.boxFrom;
    detail += `<rect x="${r2(x - 0.5)}" y="${r2(by)}" width="${r2(W + 1)}" height="${r2(L - v.boxFrom)}" rx="1.5" fill="#f3f4f6" stroke="${c.stroke}" stroke-width="${r2(Math.max(c.sw, 0.8))}"/><path d="M${r2(x + 2)} ${r2(by + 3)} H${r2(x + W - 2)}" stroke="${P.steel}" stroke-width="0.8"/>`;
  }
  // lights and mirrors
  const lights = `<rect x="${r2(x + 2)}" y="${r2(y + 0.8)}" width="${r2(W * 0.2)}" height="1.6" rx="0.8" fill="#fff6c8"/><rect x="${r2(x + W - 2 - W * 0.2)}" y="${r2(y + 0.8)}" width="${r2(W * 0.2)}" height="1.6" rx="0.8" fill="#fff6c8"/><rect x="${r2(x + 2)}" y="${r2(y + L - 2.4)}" width="${r2(W * 0.2)}" height="1.6" rx="0.8" fill="#c0392b"/><rect x="${r2(x + W - 2 - W * 0.2)}" y="${r2(y + L - 2.4)}" width="${r2(W * 0.2)}" height="1.6" rx="0.8" fill="#c0392b"/>`;
  const my = cab + v.ws * 0.15;
  const mirrors = `<rect x="${r2(x - 2)}" y="${r2(my)}" width="2.6" height="3" rx="1" ${FS(c)}/><rect x="${r2(x + W - 0.6)}" y="${r2(my)}" width="2.6" height="3" rx="1" ${FS(c)}/>`;
  return `<rect x="${x + 1}" y="${y + 1.8}" width="${W}" height="${L}" rx="${v.r}" fill="${P.shadow}"/>${mirrors}<rect x="${x}" y="${y}" width="${W}" height="${L}" rx="${v.r}" ${FS(c)}/>${detail}${lights}`;
});

// ---------------------------------------------------------------- pavement arrows (paint)

export const ARROW_PATHS: Record<string, string> = {
  straight: 'M12 2 21 14H15.5V58H8.5V14H3Z',
  left: 'M15.5 58V24C15.5 19 13 17 9 17H8V23L0 13 8 3V9H10C18 9 22.5 14 22.5 23V58Z',
  right: 'M8.5 58V24C8.5 19 11 17 15 17H16V23L24 13 16 3V9H14C6 9 1.5 14 1.5 23V58Z',
  uturn: 'M19 58V18C19 13 16.5 10 12.5 10S6 13 6 18V40H10L3 50-4 40H0V18C0 8 5 3 12.5 3S25 8 25 18V58Z',
  two: 'M12 1 20.5 12H15.5V48H20.5L12 59 3.5 48H8.5V12H3.5Z',
  merge: 'M15 2 24 14H18.5V58H11.5V45L4.5 52 0.5 48 11.5 37V14H6Z',
};

/**
 * Painted pavement arrow, pointing right (along the object's width), so a
 * lane arrow lines up with a lane without rotating it.
 */
export const pavementArrow = (path: keyof typeof ARROW_PATHS | string, opts: { word?: string } = {}): DrawFn => {
  const dw = opts.word ? 40 : 26;
  return icon(62, dw, (c) => {
    const dx = opts.word ? 14 : 1;
    const word = opts.word ? `<text x="7" y="31" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700" fill="${c.fill}" fill-opacity="${c.fo}" text-anchor="middle" dominant-baseline="central" transform="rotate(-90 7 31)" stroke="${c.stroke}" stroke-width="0.35">${opts.word}</text>` : '';
    return `<g transform="translate(62 0) rotate(90)"><path transform="translate(${dx} 1)" d="${ARROW_PATHS[path] ?? path}" ${FS(c)}/>${word}</g>`;
  });
};

// ---------------------------------------------------------------- lanes and paint lines (parametric, horizontal)

export const hLine = (y: number, x1: number, x2: number, color: string, width: number, dash = '') =>
  `<path d="M${r2(x1)} ${r2(y)} H${r2(x2)}" stroke="${color}" stroke-width="${r2(width)}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;

/** A driving surface with paint. `marks` draws on top in the lane's own coordinates. */
export const lane = (marks: (c: DrawCtx) => string, edge: 'white' | 'none' = 'white'): DrawFn => (c) => {
  if (c.marksOnly) return marks(c);
  const e = edge === 'white' ? hLine(3.5, 0, c.w, P.paint, 2) + hLine(c.h - 3.5, 0, c.w, P.paint, 2) : '';
  return `${boxRect(c)}${e}${marks(c)}`;
};

/** Repeats a mark along the length of a lane. */
export function along(c: DrawCtx, every: number, mark: (x: number) => string, margin = every / 2): string {
  const n = Math.max(1, Math.floor((c.w - margin * 2) / every) + 1);
  const span = (n - 1) * every;
  const start = c.w / 2 - span / 2;
  let s = '';
  for (let i = 0; i < n; i++) s += mark(start + i * every);
  return s;
}

/** Small lane arrow pointing along +x at (x, y). */
export const laneArrow = (x: number, y: number, len: number, color: string = P.paint, flip = false) => {
  const s = len / 40;
  return `<path transform="translate(${r2(x)} ${r2(y)}) scale(${flip ? -r2(s) : r2(s)} ${r2(s)})" d="M-20 -3H8V-9L20 0 8 9V3H-20Z" fill="${color}"/>`;
};

/** Diagonal-hatched paint strip used for fire lanes, keep-clear and hazard paint. */
export const hatched = (stripe: string, word?: string, wordColor?: string): DrawFn => (c) => {
  const id = `s${Math.round(c.w)}_${Math.round(c.h)}`;
  const t = word ? text(c.w / 2, c.h / 2, Math.min(c.h * 0.42, fitText(c.w * 0.7, word.length, 26)), word, wordColor ?? stripe, `stroke="${'#ffffff'}" stroke-width="0" `) : '';
  const pad = word ? `<rect x="${r2(c.w / 2 - Math.min(c.w * 0.4, word.length * c.h * 0.22))}" y="${r2(c.h * 0.22)}" width="${r2(Math.min(c.w * 0.8, word.length * c.h * 0.44))}" height="${r2(c.h * 0.56)}" fill="${c.fill}" fill-opacity="${Math.max(c.fo, 0.85)}"/>` : '';
  return `${boxRect(c)}<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="16" fill="${stripe}"/></pattern></defs><rect x="${r2(c.sw / 2)}" y="${r2(c.sw / 2)}" width="${r2(c.w - c.sw)}" height="${r2(c.h - c.sw)}" fill="url(#${id})"/>${pad}${t}`;
};

export { raisedShadow };
