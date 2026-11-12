import { expect, test, type Page } from '@playwright/test';
import { newMap } from './helpers';
import {
  Touch, editorState, probePoints, realClick, settle, spacePan, toScreen, topmostAt, trackpadPinch, type ObjInfo,
} from './real-input';

/**
 * Click accuracy with real input. A scene of 40+ objects: a strip of touching
 * spaces numbered 120-139 (neighbours share an edge, like 130 and 131), an angled
 * strip, and assets from every category, some rotated. For each object we click
 * the center and just inside each edge, at three zoom levels and after a pan, and
 * check the app picked exactly that object.
 */

const ASSET_KEYS = [
  'column', 'stairs', 'elevator', 'valet-booth', 'valet-podium', 'key-box', 'car', 'truck',
  'office-building', 'tree', 'bike-rack', 'stop-sign', 'fire-extinguisher', 'speed-bump', 'arrow',
  'crosswalk', 'dumpster', 'ev-charger', 'desk', 'aed',
];

async function buildScene(page: Page) {
  await newMap(page, 'Click accuracy');
  // Hundreds of clicks a few pixels apart would otherwise count as double clicks (which
  // open the label editor), something a person clicking one object at a time never does.
  await page.evaluate(() => { (window as unknown as { Konva: { dblClickWindow: number } }).Konva.dblClickWindow = 1; });
  return page.evaluate(async (keys) => {
    const { useEditor } = await import('/src/editor/store.ts');
    const { ASSET_BY_KEY } = await import('/src/assets/library.ts');
    const st = useEditor.getState();
    const added: string[] = [];
    const add = (key: string, at: { x: number; y: number }, patch: Record<string, unknown> = {}) => {
      st.addAsset(key, at);
      const id = useEditor.getState().selection[0];
      if (Object.keys(patch).length) useEditor.getState().updateObjects([id], patch);
      added.push(id);
    };
    // 20 touching spaces, 45 wide: 120 ... 139.
    for (let i = 0; i < 20; i++) add('space-standard', { x: 100 + i * 45, y: 100 }, { label: String(120 + i) });
    // An angled strip of 8 at 30 degrees.
    for (let i = 0; i < 8; i++) {
      const r = (30 * Math.PI) / 180;
      add('space-standard', { x: 200 + i * 45 * Math.cos(r), y: 320 + i * 45 * Math.sin(r) }, { label: `A${i + 1}`, rotation: 30 });
    }
    // Assets in a loose grid, every third one rotated.
    const real = keys.filter((k: string) => ASSET_BY_KEY[k]);
    real.forEach((k: string, i: number) => add(k, { x: 700 + (i % 6) * 140, y: 320 + Math.floor(i / 6) * 160 }, i % 3 === 2 ? { rotation: 45 } : {}));
    useEditor.getState().clearSelection();
    useEditor.getState().fitToFloor();
    return { count: added.length, missing: keys.filter((k: string) => !ASSET_BY_KEY[k]) };
  }, ASSET_KEYS);
}

/** A person never clicks within one frame of pressing a key; let the canvas redraw. */
const nextFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

interface Miss { object: string; point: string; got: string; zoom: string }

async function sweep(page: Page, zoom: string, opts: { touch?: Touch } = {}): Promise<{ checked: number; misses: Miss[] }> {
  await settle(page);
  const s = await editorState(page);
  const order = s.layers.map((l) => l.id);
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const misses: Miss[] = [];
  let checked = 0;
  for (const o of s.objects as ObjInfo[]) {
    for (const p of probePoints(o, s.viewport.scale)) {
      const scr = await toScreen(page, o, p.local);
      if (scr.x < c.x + 2 || scr.y < c.y + 2 || scr.x > c.x + c.width - 2 || scr.y > c.y + c.height - 2) continue;
      // What should be under that pixel: the topmost object whose shape holds it.
      const w = { x: (scr.x - c.x - s.viewport.x) / s.viewport.scale, y: (scr.y - c.y - s.viewport.y) / s.viewport.scale };
      const expected = topmostAt(s.objects, order, w);
      if (!expected) continue;
      await page.keyboard.press('Escape');
      await nextFrame(page);
      if (opts.touch) await opts.touch.tap(scr);
      else await realClick(page, scr);
      const sel = (await editorState(page)).selection;
      checked++;
      if (sel.length !== 1 || sel[0] !== expected.id) {
        const got = sel.map((id) => s.objects.find((x) => x.id === id)?.name ?? id).join(',') || 'nothing';
        misses.push({ object: expected.name, point: `${o.name}:${p.name}`, got, zoom });
      }
    }
  }
  return { checked, misses };
}

test.describe('click accuracy', () => {
  test.setTimeout(240_000);

  test('mouse: center and every edge, at three zooms and after panning', async ({ page }) => {
    const scene = await buildScene(page);
    expect(scene.missing).toEqual([]);
    expect(scene.count).toBeGreaterThanOrEqual(30);
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const results: { checked: number; misses: Miss[] }[] = [];

    results.push(await sweep(page, 'fit'));
    await trackpadPinch(page, mid, -300); // zoom in
    results.push(await sweep(page, 'zoomed in'));
    await page.getByTestId('fit').click();
    await trackpadPinch(page, mid, 200); // zoom out
    results.push(await sweep(page, 'zoomed out'));
    await page.getByTestId('fit').click();
    await trackpadPinch(page, mid, -150);
    await spacePan(page, mid, { x: mid.x - 180, y: mid.y - 90 });
    results.push(await sweep(page, 'after pan'));

    const misses = results.flatMap((r) => r.misses);
    const checked = results.reduce((n, r) => n + r.checked, 0);
    test.info().annotations.push({ type: 'checked', description: String(checked) });
    expect(checked).toBeGreaterThan(300);
    expect(misses, JSON.stringify(misses.slice(0, 20), null, 1)).toEqual([]);
  });

  test('touch: taps on center and every edge after a pinch', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch is sent through Chrome DevTools');
    await page.setViewportSize({ width: 1440, height: 900 });
    await buildScene(page);
    const touch = await Touch.open(page);
    const c = (await page.getByTestId('canvas').boundingBox())!;
    const mid = { x: c.x + c.width / 2, y: c.y + c.height / 2 };
    const a = await sweep(page, 'fit (touch)', { touch });
    await touch.pinch(mid, 1.8);
    const b = await sweep(page, 'pinched in (touch)', { touch });
    await touch.drag(mid, { x: mid.x + 120, y: mid.y + 60 });
    const d = await sweep(page, 'after finger pan (touch)', { touch });
    await touch.close();
    const misses = [...a.misses, ...b.misses, ...d.misses];
    expect(a.checked + b.checked + d.checked).toBeGreaterThan(150);
    expect(misses, JSON.stringify(misses.slice(0, 20), null, 1)).toEqual([]);
  });
});
