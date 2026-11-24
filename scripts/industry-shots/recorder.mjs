// Records a Playwright page to an MP4, frame by frame, for the industry clips (clips.mjs).
// Chrome's own screencast sends a frame each time the screen changes; ffmpeg then
// holds each frame for as long as it was on screen, so the clip runs at real speed.
// A drawn pointer (and a tap mark on phones) is added to the page, because a
// headless browser shows none and the viewer needs to see where the clicks go.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const POINTER = `
(() => {
  if (window.__bmPointer) return;
  window.__bmPointer = true;
  const add = () => {
    const css = document.createElement('style');
    css.textContent = \`
      #bm-pointer { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647; pointer-events: none;
        transform: translate(-100px, -100px); transition: none; }
      #bm-pointer.down svg { transform: scale(.86); transform-origin: 3px 2px; }
      .bm-tap { position: fixed; z-index: 2147483647; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px;
        border-radius: 50%; background: rgba(11, 37, 69, .28); border: 2px solid rgba(11, 37, 69, .55);
        animation: bm-tap .5s ease-out forwards; }
      @keyframes bm-tap { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.15); opacity: 0; } }\`;
    document.head.appendChild(css);
    const p = document.createElement('div');
    p.id = 'bm-pointer';
    p.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2v16l4.2-4 2.8 6.4 2.6-1.1-2.8-6.3H16z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    if (window.__bmTouch) p.style.display = 'none';
    document.body.appendChild(p);
    addEventListener('pointermove', (e) => { p.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('pointerdown', (e) => {
      p.classList.add('down');
      if (!window.__bmTouch) return;
      const t = document.createElement('div');
      t.className = 'bm-tap';
      t.style.left = e.clientX + 'px';
      t.style.top = e.clientY + 'px';
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 600);
    }, true);
    addEventListener('pointerup', () => p.classList.remove('down'), true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();`;

/** Adds the drawn pointer to every page this context opens. */
export async function withPointer(ctx, touch) {
  if (touch) await ctx.addInitScript('window.__bmTouch = true;');
  await ctx.addInitScript(POINTER);
}

/** Starts recording; call stop(path) to write the MP4. */
export async function record(page, { width, height }) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width, maxHeight: height });
  const started = Date.now() / 1000;
  return {
    async stop(out, { fps = 30, crf = 24, trimStart = 0 } = {}) {
      const ended = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      await cdp.detach();
      const dir = out + '.frames';
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const keep = frames.filter((f) => f.t >= started + trimStart);
      // The frame showing when trimStart passed still belongs at the start.
      const before = frames.filter((f) => f.t < started + trimStart).pop();
      if (before) keep.unshift({ ...before, t: started + trimStart });
      let list = '';
      keep.forEach((f, i) => {
        const name = `f${String(i).padStart(5, '0')}.png`;
        writeFileSync(join(dir, name), Buffer.from(f.data, 'base64'));
        const next = i + 1 < keep.length ? keep[i + 1].t : ended;
        list += `file '${name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
      });
      list += `file 'f${String(keep.length - 1).padStart(5, '0')}.png'\n`;
      writeFileSync(join(dir, 'list.txt'), list);
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        join(dir, 'list.txt'),
        '-vf',
        `fps=${fps},scale=${width}:${height}:flags=lanczos,format=yuv420p`,
        '-c:v',
        'libx264',
        '-preset',
        'veryslow',
        '-crf',
        String(crf),
        '-tune',
        'animation',
        '-movflags',
        '+faststart',
        '-an',
        out,
      ]);
      // The last frame doubles as the still shown before the clip plays (and when motion is reduced).
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-sseof',
        '-0.1',
        '-i',
        out,
        '-frames:v',
        '1',
        out.replace(/\.mp4$/, '-last.png'),
      ]);
      rmSync(dir, { recursive: true, force: true });
      return keep.length;
    },
  };
}

/** Moves the mouse along an eased path, so the pointer glides like a hand would. */
export async function glide(page, from, to, ms = 700) {
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(ms / steps / 2);
  }
  return to;
}

export const centre = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
