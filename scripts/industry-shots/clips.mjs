// Short clips of the real app in use, one pair per industry page on bergeronmaps.com:
// the editor (find a library item for that industry, place it, publish) and the
// phone viewer (search, the space lights up, walking directions).
// Run: npx vite --port 5190 & node scripts/industry-shots/clips.mjs [scene ...]
// Output: site/img/industries/<scene>-editor.mp4 and <scene>-phone.mp4, plus a
// WebP still of each clip's last frame (<scene>-editor.webp, <scene>-phone.webp)
// that shows before the clip plays and for visitors who ask for reduced motion.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { centre, film, withPointer } from './recorder.mjs';
import { INDUSTRIES } from '../site-pages.mjs';

const BASE = process.env.BASE || 'http://localhost:5190';
const OUT = process.env.OUT || 'site/img/industries';

// What happens in each clip. The phone searches for the page's own example (sample.find in
// scripts/site-pages.mjs), so the caption and the clip agree. from: where directions start;
// lib/tile/drop: the library search, the tile picked, and where it is dragged to (map units).
// step: a direction step to tap at the end, to show the next floor.
// The dropped item is left out of the sample map in scenes.ts (see CLIP_ITEM there), so the clip adds it.
const PLAN = {
  dealership: {
    from: 'Entrance',
    lib: 'inventory',
    tile: 'used-inventory-sign',
    drop: [730, 420],
    focus: [620, 400],
    zoom: 1.3,
  },
  warehouse: { from: 'Entrance', lib: 'first aid', tile: 'first-aid', drop: [70, 300], focus: [520, 420], zoom: 1.1 },
  school: { from: 'Visitor entrance', lib: 'aed', tile: 'aed', drop: [960, 300], focus: [700, 450], zoom: 1.2 },
  valet: {
    from: 'Entrance',
    lib: 'key',
    tile: 'key-box',
    drop: [260, 770],
    focus: [420, 430],
    zoom: 1.1,
    step: 'Walk to Space',
  },
  office: {
    from: 'Elevator',
    lib: 'cubicle',
    tile: 'cubicle-cluster',
    drop: [560, 470],
    focus: [600, 360],
    zoom: 1.15,
  },
};
const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(PLAN);

const browser = await chromium.launch();

async function seed(page, name) {
  await page.goto(BASE + '/');
  return page.evaluate(async (n) => {
    const { SCENES } = await import('/scripts/industry-shots/scenes.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = SCENES[n]();
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  }, name);
}

const pause = (page, ms) => page.waitForTimeout(ms);

/** Taps the middle of an element, as a finger would. */
const tap = async (page, selector) => {
  const p = await centre(page.locator(selector).first());
  await page.touchscreen.tap(p.x, p.y);
};

/** Converts a clip's last frame to the WebP still the page shows first. */
function still(mp4, width) {
  const png = mp4.replace(/\.mp4$/, '-last.png');
  execFileSync('python3', [
    '-c',
    `from PIL import Image; im = Image.open(${JSON.stringify(png)}).convert('RGB'); im.thumbnail((${width}, 9999), Image.LANCZOS); im.save(${JSON.stringify(mp4.replace(/\.mp4$/, '.webp'))}, quality=82, method=6)`,
  ]);
  rmSync(png);
}

async function phoneClip(name) {
  const plan = PLAN[name];
  const find = INDUSTRIES.find((i) => i.scene === name).sample.find;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 1.6,
    isMobile: true,
    hasTouch: true,
  });
  await withPointer(ctx, true);
  const page = await ctx.newPage();
  await page.clock.install();
  const id = await seed(page, name);
  await page.goto(`${BASE}/#/view/${id}`);
  await page.getByTestId('viewer-search').waitFor();
  await pause(page, 1500);
  const cam = await film(page);
  await cam.hold(900);
  await tap(page, '[data-testid="viewer-search"]');
  await cam.hold(300);
  await cam.type(find, 140);
  await cam.hold(700);
  await tap(page, '[data-testid="search-results"] li:first-child button');
  await cam.hold(2000);
  await tap(page, '[data-testid="directions"]');
  await cam.hold(900);
  await tap(page, `[data-testid="dir-start"]:has-text("${plan.from}")`);
  await cam.hold(3800);
  if (plan.step) {
    await tap(page, `[data-testid="directions-sheet"] button:has-text("${plan.step}")`);
    await cam.hold(3000);
  }
  await cam.save(`${OUT}/${name}-phone.mp4`, { width: 624, height: 1248 });
  still(`${OUT}/${name}-phone.mp4`, 780);
  await ctx.close();
}

/** Where a map point is on screen, from the editor's own viewport. */
async function onScreen(page, [x, y]) {
  const v = await page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    return useEditor.getState().viewport;
  });
  const box = await page.getByTestId('canvas').boundingBox();
  return { x: box.x + v.x + x * v.scale, y: box.y + v.y + y * v.scale };
}

async function editorClip(name) {
  const plan = PLAN[name];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
  await withPointer(ctx, false);
  const page = await ctx.newPage();
  await page.clock.install();
  const id = await seed(page, name);
  await page.goto(`${BASE}/#/edit/${id}`);
  await page.getByTestId('canvas').waitFor();
  await pause(page, 1500);
  // Zoom in a little around where the item goes, as someone working on that corner would.
  await page.evaluate(
    async ([x, y, zoom]) => {
      const { useEditor } = await import('/src/editor/store.ts');
      const s = useEditor.getState();
      const scale = s.viewport.scale * zoom;
      s.setViewport({ scale, x: s.viewSize.width * 0.5 - x * scale, y: s.viewSize.height * 0.5 - y * scale });
    },
    [...(plan.focus ?? plan.drop), plan.zoom ?? 1.5],
  );
  await pause(page, 600);
  let at = { x: 760, y: 520 };
  await page.mouse.move(at.x, at.y);
  const cam = await film(page);
  await cam.hold(900);
  // Find the item in the library and add it.
  const search = page.getByPlaceholder(/Search .* objects/);
  at = await cam.glide(at, await centre(search), 800);
  await cam.click();
  await cam.type(plan.lib, 120);
  await cam.hold(600);
  const tile = page.getByTestId(`asset-${plan.tile}`);
  at = await cam.glide(at, await centre(tile), 700);
  await cam.hold(150);
  await cam.click();
  await cam.hold(700);
  // Drag it from the middle of the view to where it belongs.
  const placed = await page.evaluate(async () => {
    const { useEditor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const floor = s.doc.floors.find((f) => f.id === s.floorId) ?? s.doc.floors[0];
    const o = floor.objects.find((x) => x.id === s.selection[0]);
    return [o.x, o.y];
  });
  at = await cam.glide(at, await onScreen(page, placed), 700);
  await page.mouse.down();
  await cam.hold(100);
  at = await cam.glide(at, await onScreen(page, plan.drop), 1100);
  await page.mouse.up();
  await cam.hold(900);
  // Publish, so the team's phones show it.
  const publish = page.getByTestId('publish');
  at = await cam.glide(at, await centre(publish), 900);
  await cam.hold(150);
  await cam.click();
  const done = page.locator('[data-testid="publish"][data-state="current"]');
  await cam.until(async () => (await done.count()) > 0, 2200);
  await cam.save(`${OUT}/${name}-editor.mp4`, { width: 1600, height: 1000 });
  still(`${OUT}/${name}-editor.mp4`, 2000);
  await ctx.close();
}

for (const name of names) {
  await editorClip(name);
  await phoneClip(name);
  console.log('clip', name);
}
await browser.close();
