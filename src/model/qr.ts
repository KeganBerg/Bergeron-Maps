import qrcode from 'qrcode-generator';

/**
 * QR codes for printed "You are here" signs. Error correction level M (the usual one for
 * print: about 15% of the code can be scuffed or glared and it still scans). Level Q
 * would add a ring of smaller modules, and in scan tests smaller modules cost more reach
 * than the extra repair bought. The standard four-module quiet zone goes around it.
 */
export interface QrCode {
  /** Modules per side, without the quiet zone. */
  size: number;
  dark: (row: number, col: number) => boolean;
}

export const QUIET_ZONE = 4;

export function makeQr(text: string): QrCode {
  // Typed 0 picks the smallest version that holds the text.
  const qr = qrcode(0, 'M');
  // Byte mode, fed UTF-8 one byte per character (the library keeps the low byte of each),
  // so any character in a link survives.
  qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte');
  qr.make();
  return { size: qr.getModuleCount(), dark: (r, c) => qr.isDark(r, c) };
}

/** An SVG of the code, one unit per module, quiet zone included; scale it with width/height. */
export function qrSvg(text: string, { label }: { label?: string } = {}): string {
  const qr = makeQr(text);
  const n = qr.size + QUIET_ZONE * 2;
  let d = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.dark(r, c)) continue;
      // Runs of dark modules in a row become one rectangle: a smaller file and no hairline gaps.
      let run = 1;
      while (c + run < qr.size && qr.dark(r, c + run)) run++;
      d += `M${c + QUIET_ZONE} ${r + QUIET_ZONE}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  const title = label ? `<title>${escapeXml(label)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"${label ? ` aria-label="${escapeXml(label)}"` : ''}>${title}<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const escapeXml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
