/** Tiled textures (grass, gravel, mulch…) and decorations painted inside merged landscape shapes. */
import { GRASS_TEXTURE, P } from '../assets/style';

type Painter = (c: CanvasRenderingContext2D, size: number) => void;
const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 0) => {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke && lw) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
};
const dots = (color: string, r: number): Painter => (c, n) => {
  for (const [x, y] of [[0.25, 0.3], [0.75, 0.2], [0.3, 0.8], [0.8, 0.7]]) dot(c, x * n, y * n, r, color);
};

/**
 * World-anchored textures for merged surfaces, matching each asset's own
 * drawing, so the fill runs on continuously across every piece. `tile` is the
 * repeat size in map pixels; painters draw in map pixels.
 */
export const MERGE_TEXTURE: Record<string, { tile: number; paint: Painter }> = {
  grass: {
    tile: GRASS_TEXTURE.tile,
    paint: (c) => {
      for (const [x, y, r, color, a] of GRASS_TEXTURE.patches) {
        c.globalAlpha = a;
        dot(c, x, y, r, color);
      }
      c.globalAlpha = 1;
      c.strokeStyle = GRASS_TEXTURE.blade;
      c.lineWidth = 0.9;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      for (const [x, y] of GRASS_TEXTURE.tufts) {
        c.moveTo(x - 1.6, y - 3.4);
        c.lineTo(x, y);
        c.lineTo(x + 1.6, y - 3.4);
        c.moveTo(x, y);
        c.lineTo(x, y - 4.4);
      }
      c.stroke();
    },
  },
  gravel: { tile: 14, paint: dots('#a39a88', 1.1) },
  dirt: { tile: 26, paint: dots('#8c6b4a', 1.2) },
  'rock-bed': { tile: 18, paint: dots('#8f897d', 2.4) },
  'flower-bed': {
    tile: 24,
    paint: (c) => {
      const colors = ['#e86a8a', '#f2c230', '#f4f4f4', '#b05cc8'];
      [[6, 6], [18, 6], [10, 18], [22, 18]].forEach(([x, y], i) => dot(c, x, y, 3, colors[i], P.foliageDark, 0.6));
    },
  },
};

/**
 * Things drawn once per piece on top of a merged surface (after the shared
 * fill), so one piece's details are never hidden under another piece's fill.
 * Drawn in the piece's own coordinates.
 */
export const MERGE_DECOR: Record<string, (c: CanvasRenderingContext2D, w: number, h: number) => void> = {
  // Landscaping bed: a row of shrubs down the middle, as in its own drawing.
  planter: (c, w, h) => {
    const along = w >= h;
    const len = along ? w : h;
    const r = Math.min(10, (along ? h : w) * 0.3);
    for (let t = 15; t < len - 5; t += 30) dot(c, along ? t : w / 2, along ? h / 2 : t, r, P.foliage, P.foliageDark, 1);
  },
};

const patternTiles = new Map<string, HTMLCanvasElement | null>();
export const TILE_K = 4; // tiles are drawn at 4x and scaled down, so they stay sharp when zoomed
export function textureTile(key: string): HTMLCanvasElement | null {
  if (patternTiles.has(key)) return patternTiles.get(key)!;
  const t = MERGE_TEXTURE[key];
  let tile: HTMLCanvasElement | null = null;
  if (t && typeof document !== 'undefined') {
    tile = document.createElement('canvas');
    tile.width = tile.height = t.tile * TILE_K;
    const c = tile.getContext('2d');
    if (c) {
      c.scale(TILE_K, TILE_K);
      t.paint(c, t.tile);
    } else tile = null;
  }
  patternTiles.set(key, tile);
  return tile;
}
