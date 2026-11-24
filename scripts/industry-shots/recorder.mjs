// Films a Playwright page to an MP4 for the industry clips (clips.mjs), one frame at a time.
// The page runs on a paused clock (Playwright's clock: timers, Date and requestAnimationFrame),
// and CSS animations are paused too. Each frame moves time forward by exactly 1/60 s and then
// takes a screenshot, so the clip plays as evenly as the browser's own animations, however
// slow the machine recording it is. Pointer moves happen between frames, a step per frame.
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

/** Puts the page on a paused clock and returns a camera that films it frame by frame. */
export async function film(page, { fps = 60 } = {}) {
  const step = 1000 / fps;
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 50);
  const shots = [];
  const cam = {
    /** Moves time forward one frame and keeps a picture of it. */
    async frame() {
      await page.clock.runFor(step);
      // CSS transitions and animations run on the compositor's own clock; step them by hand.
      await page.evaluate((ms) => {
        for (const a of document.getAnimations()) {
          if (a.bmTime === undefined) {
            a.bmTime = a.currentTime ?? 0;
            a.pause();
          }
          a.bmTime += ms;
          a.currentTime = a.bmTime;
        }
      }, step);
      shots.push(await page.screenshot({ type: 'jpeg', quality: 93 }));
    },
    /** Films ms of the page as it is. */
    async hold(ms) {
      for (let i = 0; i < Math.round(ms / step); i++) await cam.frame();
    },
    /** Films until the page shows what test() looks for, then ms more. */
    async until(test, ms = 0, limit = 600) {
      for (let i = 0; i < limit && !(await test()); i++) await cam.frame();
      await cam.hold(ms);
    },
    /** Moves the mouse along an eased path, one step per frame, so the pointer glides like a hand. */
    async glide(from, to, ms = 700) {
      const n = Math.max(2, Math.round(ms / step));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
        await cam.frame();
      }
      return to;
    },
    /** Types text a key at a time, at a person's pace. */
    async type(text, ms = 130) {
      for (const ch of text) {
        await page.keyboard.type(ch);
        await cam.hold(ms);
      }
    },
    /** Clicks where the mouse is, with the press showing for a couple of frames. */
    async click() {
      await page.mouse.down();
      await cam.hold(70);
      await page.mouse.up();
      await cam.frame();
    },
    /** Writes the MP4, and the last frame as a PNG next to it (the still the page shows first). */
    async save(out, { width, height, crf = 23 }) {
      const dir = out + '.frames';
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      shots.forEach((b, i) => writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), b));
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        String(fps),
        '-i',
        join(dir, 'f%05d.jpg'),
        '-vf',
        `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
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
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        join(dir, `f${String(shots.length - 1).padStart(5, '0')}.jpg`),
        '-vf',
        `scale=${width}:${height}:flags=lanczos`,
        out.replace(/\.mp4$/, '-last.png'),
      ]);
      rmSync(dir, { recursive: true, force: true });
      return shots.length;
    },
  };
  return cam;
}

export const centre = async (loc) => {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
