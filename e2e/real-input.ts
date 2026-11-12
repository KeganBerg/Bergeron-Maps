import { expect, type CDPSession, type Page } from '@playwright/test';

/**
 * Helpers for tests that drive the app the way a person does: real mouse moves and
 * presses, real wheel/trackpad events, and real touch points (through the browser's
 * own input pipeline, not events dispatched from page code). The store is only read,
 * or used to lay out a scene before the test starts clicking.
 */

export type Pt = { x: number; y: number };
export interface ObjInfo {
  id: string;
  kind: string;
  name: string;
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Live editor state, read from the running app. */
export async function editorState(page: Page) {
  return page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const f = currentFloor(s)!;
    return {
      selection: s.selection,
      viewport: s.viewport,
      tool: s.tool.type,
      layers: f.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, locked: l.locked })),
      objects: f.objects.map((o) => ({
        id: o.id,
        kind: o.kind,
        name: o.kind === 'space' ? o.label : o.kind === 'text' ? o.text : o.name ?? o.assetKey,
        layerId: o.layerId,
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        rotation: o.rotation,
      })),
      past: (s as unknown as { past?: unknown[] }).past?.length ?? -1,
    };
  });
}

/** Where a point in an object's own frame (center-based, unrotated) lands on screen. */
export async function toScreen(page: Page, o: ObjInfo, local: Pt): Promise<Pt> {
  const c = (await page.getByTestId('canvas').boundingBox())!;
  const { viewport: v } = await editorState(page);
  const r = (o.rotation * Math.PI) / 180;
  const wx = o.x + local.x * Math.cos(r) - local.y * Math.sin(r);
  const wy = o.y + local.x * Math.sin(r) + local.y * Math.cos(r);
  return { x: c.x + v.x + wx * v.scale, y: c.y + v.y + wy * v.scale };
}

/**
 * The center and the middle of each edge (pulled in by `insetPx` screen pixels),
 * in the object's own frame. Edges are skipped when the object is too small on screen.
 */
export function probePoints(o: ObjInfo, scale: number, insetPx = 3): { name: string; local: Pt }[] {
  // Under 4px on screen nobody can aim at it (and Firefox and Safari send whole-pixel positions).
  if (Math.min(o.width, o.height) * scale < 4) return [];
  const pts = [{ name: 'center', local: { x: 0, y: 0 } }];
  const ix = Math.min(insetPx / scale, o.width / 4);
  const iy = Math.min(insetPx / scale, o.height / 4);
  if (o.width * scale >= 8) {
    pts.push({ name: 'left', local: { x: -o.width / 2 + ix, y: 0 } });
    pts.push({ name: 'right', local: { x: o.width / 2 - ix, y: 0 } });
  }
  if (o.height * scale >= 8) {
    pts.push({ name: 'top', local: { x: 0, y: -o.height / 2 + iy } });
    pts.push({ name: 'bottom', local: { x: 0, y: o.height / 2 - iy } });
  }
  return pts;
}

/** A real mouse click: move there, press, release. */
export async function realClick(page: Page, p: Pt, opts: { shift?: boolean } = {}) {
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.down();
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
}

/** A real mouse drag with intermediate moves. */
export async function realDrag(page: Page, from: Pt, to: Pt, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Trackpad pinch: browsers send it as a wheel event with Ctrl held. */
export async function trackpadPinch(page: Page, at: Pt, deltaY: number) {
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, deltaY / 5);
  await page.keyboard.up('Control');
}

/** Two-finger trackpad scroll (or a mouse wheel). */
export async function trackpadScroll(page: Page, at: Pt, dx: number, dy: number) {
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(dx / 4, dy / 4);
}

/** Pan with the space bar held and the mouse dragged, as in drawing apps. */
export async function spacePan(page: Page, from: Pt, to: Pt) {
  await page.keyboard.down('Space');
  await realDrag(page, from, to, 6);
  await page.keyboard.up('Space');
}

/** Real touch input through Chrome DevTools: browser-generated touch and pointer events. */
export class Touch {
  private constructor(private cdp: CDPSession) {}
  static async open(page: Page) {
    return new Touch(await page.context().newCDPSession(page));
  }
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }
  async tap(p: Pt) {
    await this.send('touchStart', [p]);
    await this.send('touchEnd', []);
  }
  async drag(from: Pt, to: Pt, steps = 8) {
    await this.send('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
    }
    await this.send('touchEnd', []);
  }
  /** Two fingers spreading apart (factor > 1) or pinching together around `at`. */
  async pinch(at: Pt, factor: number, steps = 8) {
    const start = 40;
    const end = start * factor;
    const pts = (d: number) => [{ x: at.x - d, y: at.y }, { x: at.x + d, y: at.y }];
    await this.send('touchStart', [pts(start)[0]]);
    await this.send('touchStart', pts(start));
    for (let i = 1; i <= steps; i++) await this.send('touchMove', pts(start + ((end - start) * i) / steps));
    await this.send('touchEnd', [pts(end)[0]]);
    await this.send('touchEnd', []);
  }
  async close() {
    await this.cdp.detach();
  }
}

/** Waits until the view stops moving (fit-to-screen and zoom animations). */
export async function settle(page: Page) {
  let last = '';
  await expect
    .poll(async () => {
      const v = JSON.stringify((await editorState(page)).viewport);
      const same = v === last;
      last = v;
      return same;
    }, { intervals: [50, 100, 100, 200] })
    .toBe(true);
}

/** Topmost object (drawing order) whose rectangle holds world point w. */
export function topmostAt(objects: ObjInfo[], layerOrder: string[], w: Pt): ObjInfo | undefined {
  const hits = objects.filter((o) => {
    const r = (-o.rotation * Math.PI) / 180;
    const dx = w.x - o.x;
    const dy = w.y - o.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    return Math.abs(lx) <= o.width / 2 && Math.abs(ly) <= o.height / 2;
  });
  const rank = (o: ObjInfo) => layerOrder.indexOf(o.layerId) * 1e6 + objects.indexOf(o);
  return hits.sort((a, b) => rank(b) - rank(a))[0];
}
