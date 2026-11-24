import { qrSvg } from '../model/qr';
import { MAP_FONT } from '../theme';
import type { FloorImage } from './view';

/**
 * Printed "You are here" signs: a QR code that opens the map on the sign's floor with
 * "You are here" on the spot, and (on the bigger sizes) the floor with a pin on it.
 *
 * How far away a code reads depends on its printed width. In scan tests (a 1080p camera
 * frame, blur, noise, uneven light) a code read every time from about 8 times its width
 * away, so the sizes below say that; most phones do better.
 */
export type SignSize = 'card' | 'letter' | 'poster';

export const SIGN_SIZES: { key: SignSize; label: string; page: string; use: string }[] = [
  { key: 'card', label: 'Card, 4 × 6 in', page: '4in 6in', use: 'For a desk, a pillar or next to an elevator button.' },
  { key: 'letter', label: 'Letter, 8.5 × 11 in', page: 'letter portrait', use: 'For a wall or a door.' },
  { key: 'poster', label: 'Poster, 11 × 17 in', page: '11in 17in', use: 'For a lobby or an entrance.' },
];

/** QR width in inches, with and without the floor map on the sign. */
const QR_IN: Record<SignSize, { map: number; alone: number }> = {
  card: { map: 2.5, alone: 2.5 },
  letter: { map: 4, alone: 5.5 },
  poster: { map: 6.5, alone: 8 },
};
export const qrInches = (size: SignSize, withMap: boolean) => QR_IN[size][withMap && size !== 'card' ? 'map' : 'alone'];
/** About how far away, in feet, the code still reads: 8 times its width, to the half foot. */
export const scanFeet = (qrIn: number) => Math.max(1, Math.round((qrIn * 8) / 6) / 2);

/** Usable page area in inches, inside the margins. */
const PAGE_IN: Record<SignSize, { w: number; h: number; margin: number }> = {
  card: { w: 4, h: 6, margin: 0.3 },
  letter: { w: 8.5, h: 11, margin: 0.5 },
  poster: { w: 11, h: 17, margin: 0.6 },
};
export interface SignContent {
  url: string;
  /** What the sign is at, e.g. "Elevator 1". */
  place: string;
  floor: string;
  mapName: string;
  size: SignSize;
  /** The floor picture with the pin already drawn on it; left out on a card. */
  mapPicture?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** The link as people would type it: no https://, broken after slashes so it wraps cleanly. */
export const readableLink = (url: string) => esc(url.replace(/^https?:\/\//, '')).replace(/\//g, '/<wbr>').replace(/\?/g, '<wbr>?');

export function signStyles(size: SignSize): string {
  const p = PAGE_IN[size];
  const scale = size === 'card' ? 0.55 : size === 'letter' ? 1 : 1.4;
  const pt = (n: number) => `${Math.round(n * scale * 10) / 10}pt`;
  return `@page { size: ${SIGN_SIZES.find((s) => s.key === size)!.page}; margin: ${p.margin}in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #000; font-family: ${MAP_FONT}; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sign { width: ${p.w - p.margin * 2}in; height: ${p.h - p.margin * 2 - 0.05}in; display: flex; flex-direction: column; gap: ${size === 'card' ? 0.12 : 0.22}in; overflow: hidden; }
    .head { background: #000; color: #fff; padding: ${size === 'card' ? '0.12in 0.16in' : '0.2in 0.3in'}; border-radius: 0.08in; }
    .head h1 { margin: 0; font-size: ${pt(46)}; line-height: 1; text-transform: uppercase; font-weight: 700; }
    .head p { margin: ${size === 'card' ? 0.05 : 0.08}in 0 0; font-size: ${pt(22)}; font-weight: 600; line-height: 1.15; }
    .map { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .map img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; border: 1px solid #000; }
    .scan { display: flex; align-items: center; gap: ${size === 'card' ? 0.14 : 0.3}in; ${size === 'card' ? 'flex-direction: column; text-align: center;' : ''} }
    .sign.alone .scan { flex: 1 1 auto; flex-direction: column; justify-content: center; text-align: center; }
    .qr { flex: none; display: block; }
    .scan h2 { margin: 0 0 0.06in; font-size: ${pt(28)}; line-height: 1.1; font-weight: 700; }
    .scan p { margin: 0 0 0.06in; font-size: ${pt(15)}; line-height: 1.3; }
    .scan .link { font-size: ${pt(11)}; color: #222; word-break: break-word; }
    .foot { flex: none; font-size: ${pt(11)}; color: #222; border-top: 1px solid #000; padding-top: 0.06in; }`;
}

export function signBody(c: SignContent): string {
  const qrIn = qrInches(c.size, !!c.mapPicture);
  const qr = qrSvg(c.url, { label: `QR code: opens the map at ${c.place}` }).replace('<svg ', `<svg class="qr" width="${qrIn * 96}" height="${qrIn * 96}" style="width:${qrIn}in;height:${qrIn}in" data-testid="sign-qr" `);
  const map = c.mapPicture && c.size !== 'card'
    ? `<div class="map"><img src="${c.mapPicture}" alt="${esc(`${c.floor} map with ${c.place} marked`)}" data-testid="sign-map"></div>`
    : '';
  return `<div class="sign ${map ? 'with-map' : 'alone'} ${c.size}" data-testid="sign">
    <div class="head"><h1>You are here</h1><p>${esc(c.place)}, ${esc(c.floor)}</p></div>
    ${map}
    <div class="scan">${qr}<div>
      <h2>Scan for directions</h2>
      <p>Point your phone’s camera at the code. The map opens right here, ready to find any space or place.</p>
      <p class="link">${readableLink(c.url)}</p>
    </div></div>
    <div class="foot">${esc(c.mapName)}</div>
  </div>`;
}

/** Marks the spot on the floor picture: a pin and a "You are here" tag, sized to the picture. */
export async function pinnedPicture(img: FloorImage, at: { x: number; y: number }): Promise<string> {
  const bmp = await createImageBitmap(img.blob);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const p = img.toPixel(at.x, at.y);
  const r = Math.max(img.width, img.height) * 0.014;
  // A white halo, then the red dot, so it shows on a light or a dark map.
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.45, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#d0021b';
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  // The tag above the pin, kept inside the picture.
  const font = Math.round(r * 1.5);
  ctx.font = `700 ${font}px ${MAP_FONT}`;
  const text = 'YOU ARE HERE';
  const tw = ctx.measureText(text).width;
  const pad = font * 0.45;
  const w = tw + pad * 2, h = font + pad * 1.4;
  const above = p.y - r * 1.6 - h >= 0;
  const x = Math.min(Math.max(p.x - w / 2, 2), cv.width - w - 2);
  const y = above ? p.y - r * 1.6 - h : p.y + r * 1.6;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + h / 2);
  return cv.toDataURL('image/png');
}

/**
 * Fills a print window (opened by the caller while the click still counts) with the sign
 * and opens the print dialog once its pictures are ready.
 */
export async function printSign(w: Window, c: SignContent) {
  const d = w.document;
  d.title = `You are here: ${c.place}, ${c.floor}`;
  d.head.innerHTML = '';
  const style = d.createElement('style');
  style.textContent = signStyles(c.size);
  d.head.appendChild(style);
  d.body.innerHTML = signBody(c);
  await d.fonts?.ready;
  await Promise.all([...d.images].map((im) => im.decode().catch(() => undefined)));
  w.focus();
  w.print();
}
