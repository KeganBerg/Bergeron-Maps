import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { makeQr, qrSvg, QUIET_ZONE } from './qr';

/** Draws the code the way a printer would (black modules on white) and reads it back with a real decoder. */
function scan(text: string, px = 4) {
  const qr = makeQr(text);
  const n = (qr.size + QUIET_ZONE * 2) * px;
  const data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++) {
      if (!qr.dark(r, c)) continue;
      for (let y = 0; y < px; y++)
        for (let x = 0; x < px; x++) {
          const i = (((r + QUIET_ZONE) * px + y) * n + (c + QUIET_ZONE) * px + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { qr, read: jsQR(data, n, n)?.data };
}

describe('QR sign codes', () => {
  it('a public sign link reads back exactly', () => {
    const url = 'https://bergeronmaps.com/app/#/view/harbor-garage/a0000000-0000-4000-8000-0000000000aa?from=el_1abc2def3ghi';
    const { qr, read } = scan(url);
    expect(read).toBe(url);
    // Small enough to print big modules: a version 7 code (45 modules a side).
    expect(qr.size).toBeLessThanOrEqual(45);
  });

  it('keeps characters outside plain ASCII', () => {
    const url = 'https://example.com/app/#/view/café?from=x_1';
    expect(scan(url).read).toBe(url);
  });

  it('the SVG has a white quiet zone and one path of modules', () => {
    const svg = qrSvg('https://example.com/a', { label: 'QR code for "A & B"' });
    const qr = makeQr('https://example.com/a');
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain('aria-label="QR code for &#34;A &#38; B&#34;"');
    expect(svg.match(/<path/g)).toHaveLength(1);
  });
});
