// Builds every favicon and app icon from the traced business-card monogram
// (src/assets/brand/monogram.svg), so the browser tab shows the same BM as the card.
//
//   node scripts/build-icons.mjs
//
// Writes favicon-16.png, favicon-32.png, favicon.ico (16/32/48), apple-touch-icon.png,
// favicon.svg and logo.svg into public/ (the app) and site/ (the marketing site).
//
// The card mark is 3.3 times wider than tall, which reads as stretched inside a small
// square. Square icons use the compact icon version: the same artwork drawn 30% taller
// (ICON_RATIO 2.5 to 1, Kegan's pick). Headers and wordmarks keep the exact card shape.
// The small PNGs place the mark on whole pixels so its bands stay sharp; 16px is a
// hand-fitted bitmap.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const svg = readFileSync(`${root}src/assets/brand/monogram.svg`, 'utf8');
const d = svg.match(/ d="([^"]+)"/)[1];
const [VX, VY, VW, VH] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const TILE = '#0b0b0b';
const ICON_RATIO = 2.5;

// size: [mark x, mark y, mark width, mark height, tile corner radius] in output pixels.
const PNG = {
  16: [0, 5, 16, 6, 3],
  32: [1, 10, 30, 12, 6],
  48: [3, 16, 42, 17, 9],
  180: [20, 62, 140, 56, 0], // iOS rounds the corners itself
};

const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};
for (const [size, [x, y, w, h, r]] of Object.entries(PNG)) {
  // Draw 16x oversized, then average each 16x16 block: exact pixel coverage, no resampler blur.
  const url = await page.evaluate(({ d, T, x, y, w, h, r, VX, VY, VW, VH, TILE }) => {
    const S = 16;
    const c = document.createElement('canvas');
    c.width = c.height = T * S;
    const g = c.getContext('2d');
    g.fillStyle = TILE;
    g.beginPath();
    g.roundRect(0, 0, T * S, T * S, r * S);
    g.fill();
    g.translate(x * S, y * S);
    g.scale((w * S) / VW, (h * S) / VH);
    g.translate(-VX, -VY);
    g.fillStyle = '#fff';
    g.fill(new Path2D(d), 'evenodd');
    const big = g.getImageData(0, 0, T * S, T * S).data;
    const o = document.createElement('canvas');
    o.width = o.height = T;
    const og = o.getContext('2d');
    const id = og.createImageData(T, T);
    for (let j = 0; j < T; j++)
      for (let i = 0; i < T; i++) {
        let R = 0, G = 0, B = 0, A = 0;
        for (let v = 0; v < S; v++)
          for (let u = 0; u < S; u++) {
            const k = ((j * S + v) * T * S + (i * S + u)) * 4;
            const a = big[k + 3] / 255;
            R += big[k] * a; G += big[k + 1] * a; B += big[k + 2] * a; A += a;
          }
        const k = (j * T + i) * 4;
        id.data[k] = A ? R / A : 0;
        id.data[k + 1] = A ? G / A : 0;
        id.data[k + 2] = A ? B / A : 0;
        id.data[k + 3] = Math.round((A / (S * S)) * 255);
      }
    og.putImageData(id, 0, 0);
    return o.toDataURL('image/png');
  }, { d, T: Number(size), x, y, w, h, r, VX, VY, VW, VH, TILE });
  out[size] = Buffer.from(url.split(',')[1], 'base64');
}
await browser.close();

// 16px is hand-fitted, like a hinted font: one pixel row per band of the mark (two for the
// B's counter), so the B's open top-left and the M's raised left stem stay sharp.
// '#' full white, '+' half, '.' tile. Columns 0-6 are the B, 7 the gap, 8-15 the M.
const HINT16 = [
  '######+.#.....##',
  '.....##..#...###',
  '#######.#.#.#.##',
  '#.....#.#..##.##',
  '#.....#.#..+..##',
  '######+.#.....##',
];
{
  const p = await chromium.launch();
  const pg = await p.newPage();
  const url = await pg.evaluate(({ base, rows, y0 }) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, 16, 16);
      const tile = [11, 11, 11];
      rows.forEach((row, j) => [...row].forEach((ch, i) => {
        const t = ch === '#' ? 1 : ch === '+' ? 0.55 : 0;
        const k = ((y0 + j) * 16 + i) * 4;
        for (let n = 0; n < 3; n++) id.data[k + n] = Math.round(tile[n] + (255 - tile[n]) * t);
        id.data[k + 3] = 255;
      }));
      g.putImageData(id, 0, 0);
      res(c.toDataURL('image/png'));
    };
    img.src = base;
  }), { base: 'data:image/png;base64,' + out[16].toString('base64'), rows: HINT16, y0: PNG[16][1] });
  out[16] = Buffer.from(url.split(',')[1], 'base64');
  await p.close();
}

// ICO with PNG-compressed entries (supported by every browser since IE Vista era).
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(([size, png], n) => {
    const e = 6 + 16 * n;
    head.writeUInt8(size % 256, e); head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...entries.map(([, png]) => png)]);
}

// Scalable icon: same tile, compact icon mark 80% of the tile width, centred.
const mw = 80, mh = mw / ICON_RATIO, mx = (100 - mw) / 2, my = (100 - mh) / 2;
const kx = mw / VW, ky = mh / VH;
const scalable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="${TILE}"/><path fill="#fff" fill-rule="evenodd" transform="matrix(${+kx.toFixed(6)} 0 0 ${+ky.toFixed(6)} ${+(mx - VX * kx).toFixed(4)} ${+(my - VY * ky).toFixed(4)})" d="${d}"/></svg>\n`;

for (const dir of ['public', 'site']) {
  writeFileSync(`${root}${dir}/favicon-16.png`, out[16]);
  writeFileSync(`${root}${dir}/favicon-32.png`, out[32]);
  writeFileSync(`${root}${dir}/apple-touch-icon.png`, out[180]);
  writeFileSync(`${root}${dir}/favicon.ico`, ico([[16, out[16]], [32, out[32]], [48, out[48]]]));
  writeFileSync(`${root}${dir}/favicon.svg`, scalable);
}
writeFileSync(`${root}site/logo.svg`, scalable);
console.log('icons written');
