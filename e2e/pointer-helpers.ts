import type { Page } from '@playwright/test';

/** Seeds a published quick lot straight into the app's storage and returns its id. */
export async function seedLot(page: Page, spec: { rows: number; spacesPerRow: number }, name = 'Pointer Lot') {
  await page.goto('/');
  return page.evaluate(async ({ spec, name }) => {
    const { createQuickLot } = await import('/src/model/quickLot.ts');
    const { repository } = await import('/src/storage/indexedDbRepository.ts');
    const doc = createQuickLot(name, { floors: 1, accessible: 0, ...spec });
    await repository.createMap(doc);
    await repository.publishMap(doc.id);
    return doc.id;
  }, { spec, name });
}

export interface ScreenBox { x: number; y: number; w: number; h: number; inside: boolean }

/** Where a space (by its number) is on screen right now, and whether its middle is on the canvas. */
export function spaceBox(page: Page, label: string): Promise<ScreenBox | null> {
  return page.evaluate((label) => {
    type N = { getClientRect: () => { x: number; y: number; width: number; height: number }; findOne: (s: string) => { text: () => string } | undefined };
    const st = (window as unknown as { Konva: { stages: { find: (s: string) => N[]; container: () => HTMLElement }[] } }).Konva.stages[0];
    const g = st.find('.obj').find((n) => n.findOne('Text')?.text() === label);
    if (!g) return null;
    const r = g.getClientRect();
    const b = st.container().getBoundingClientRect();
    const x = b.left + r.x + r.width / 2;
    const y = b.top + r.y + r.height / 2;
    return { x, y, w: r.width, h: r.height, inside: x > b.left + 8 && x < b.right - 80 && y > b.top + 8 && y < b.bottom - 8 };
  }, label);
}

/** Waits until the map stops moving (the first fit can land a frame late). */
export async function settle(page: Page) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => {
      const s = (window as unknown as { Konva: { stages: { x: () => number; y: () => number; scaleX: () => number }[] } }).Konva.stages[0];
      return `${s.x()},${s.y()},${s.scaleX()}`;
    });
    if (now === last) return;
    last = now;
    await page.waitForTimeout(80);
  }
}

/** Ctrl+wheel zoom around the middle of the canvas, like a trackpad pinch. */
export async function zoomBy(page: Page, deltaY: number) {
  const c = (await page.locator('.konvajs-content').first().boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
  await settle(page);
}

/** The labels (or ids) the editor's selection box is attached to. */
export function editorSelection(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { useEditor, currentFloor } = await import('/src/editor/store.ts');
    const s = useEditor.getState();
    const f = currentFloor(s)!;
    return s.selection.map((id) => {
      const o = f.objects.find((x) => x.id === id);
      return (o && 'label' in o && o.label) || (o && 'assetKey' in o && o.assetKey) || id;
    });
  });
}
