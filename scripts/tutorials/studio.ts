// The recording studio for the tutorial videos: the real app, built and served as it is on
// bergeronmaps.com/app/ (see build-app in README.md), signed in to a stand-in Supabase server that holds only demo
// data ("Company", "Sample Garage"), and a recorder that keeps each step on screen for
// as long as its narration lasts. See README.md here for the whole pipeline.
import type { Browser, Locator, Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuickLot } from '../../src/model/quickLot';
import { MockSupabase, SITE_A, SITE_B, USERS, type User } from '../../e2e/online/mock-supabase';
import { centre, glide, record, withPointer } from './recorder.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = join(HERE, '../../site');
export const OUT = join(HERE, 'out');
export const ORIGIN = 'https://bergeronmaps.com';
const APP_DIR = join(OUT, 'app');

// The people on screen. The stand-in server's own test addresses are example.com ones;
// a tutorial reads better with work addresses, so they are swapped before it starts.
USERS.owner.email = 'you@company.com';
USERS.siteManager.email = 'manager@company.com';
USERS.employee.email = 'employee@company.com';
USERS.newcomer.email = 'new.hire@company.com';
export { USERS };

/** One step of a video: what the narrator says, and what happens on screen meanwhile. */
export interface Beat {
  say: string;
  /** The caption, when it should read differently from what is said (space numbers: "1A1", said "1 A 1"). */
  caption?: string;
  do?: (s: Studio) => Promise<void>;
}

export interface Video {
  /** Short name used for files: v1-sign-in. */
  id: string;
  number: number;
  title: string;
  /** The title of the video that comes next, for the closing card. */
  next?: string;
  /** Starts on the marketing site, signed out (default: the app, signed in as the account lead). */
  signedOut?: boolean;
  /** Page the video starts on (default /app/). */
  start?: string;
  /** Demo data the video needs before it starts. */
  setup?: (server: MockSupabase) => void;
  beats: Beat[];
}

/** Adds the garage built in video 2 ("Main garage" at Sample Garage), published or not. */
export function addGarage(server: MockSupabase, published: boolean) {
  const doc = createQuickLot('Main garage', { floors: 2, rows: 4, spacesPerRow: 12, accessible: 4 });
  const site = server.sites[0];
  server.maps.push({
    id: doc.id,
    company_id: site.company_id,
    facility_id: site.id,
    name: doc.name,
    draft: doc as unknown as Record<string, unknown>,
    revision: 1,
    slot: 1,
  });
  if (published) server.published.set(doc.id, { isPublic: false, revision: 1 });
}

/** How long each beat's narration lasts, from out/<id>/durations.json (written after the voice is made). */
function narrationSeconds(video: Video): number[] {
  const file = join(OUT, video.id, 'durations.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as number[];
  // Before the voice exists: about 2.6 words a second, the pace of the generated voice.
  return video.beats.map((b) => b.say.split(/\s+/).length / 2.6);
}

/** The demo company the videos show, on a stand-in server that holds nothing real. */
export function demoServer(page: Page) {
  const sb = new MockSupabase(page);
  sb.sites = [
    { ...SITE_A, name: 'Sample Garage', slug: 'sample-garage' },
    { ...SITE_B, name: 'Sample Lot', slug: 'sample-lot' },
  ];
  return sb;
}

export class Studio {
  /** Where the drawn pointer is now. */
  at = { x: 640, y: 400 };
  constructor(public page: Page) {}

  pause(ms: number) {
    return this.page.waitForTimeout(ms);
  }

  async moveTo(target: Locator | { x: number; y: number }, ms = 700) {
    if (!('x' in target)) await target.scrollIntoViewIfNeeded();
    const to = 'x' in target ? target : await centre(target);
    this.at = await glide(this.page, this.at, to, ms);
  }

  async click(target: Locator | { x: number; y: number }, ms = 700) {
    await this.moveTo(target, ms);
    await this.pause(150);
    await this.page.mouse.click(this.at.x, this.at.y);
  }

  /** Clicks a field and types into it at a readable pace, replacing what was there. */
  async type(field: Locator, text: string, delay = 90) {
    await this.click(field);
    await this.page.keyboard.press('Control+a');
    await field.pressSequentially(text, { delay });
  }

  /** Drags with the mouse from one point to another, as a hand would. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }, ms = 1100) {
    await this.moveTo(from);
    await this.page.mouse.down();
    this.at = await glide(this.page, this.at, to, ms);
    await this.page.mouse.up();
  }
}

/** A browser tab showing bergeronmaps.com, with the app and the demo server behind it. */
export async function openStudio(browser: Browser, opts: { as?: User; phone?: boolean } = {}) {
  const ctx = await browser.newContext(
    opts.phone
      ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 },
  );
  await withPointer(ctx, !!opts.phone);
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const [dir, path] = url.pathname.startsWith('/app/') ? [APP_DIR, url.pathname.slice(4)] : [SITE_DIR, url.pathname];
    const file = join(dir, path.endsWith('/') ? path + 'index.html' : path);
    return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const server = demoServer(page);
  await server.install(opts.as);
  return { ctx, page, server, studio: new Studio(page) };
}

/**
 * Records a video's beats. Each beat starts its action as its narration starts, and the next
 * beat waits until that narration has finished (plus a short breath). Writes the screen
 * recording and when each beat began, for build.mjs to lay the voice and captions over.
 */
export async function shoot(video: Video, s: Studio, { size = { width: 1920, height: 1080 } } = {}) {
  const seconds = narrationSeconds(video);
  const dir = join(OUT, video.id);
  mkdirSync(dir, { recursive: true });
  const rec = await record(s.page, size);
  const t0 = Date.now();
  const starts: number[] = [];
  await s.pause(600);
  for (const [i, beat] of video.beats.entries()) {
    const start = Date.now();
    starts.push((start - t0) / 1000);
    if (beat.do) await beat.do(s);
    const left = start + seconds[i] * 1000 + 450 - Date.now();
    if (left > 0) await s.pause(left);
  }
  await s.pause(900);
  await rec.stop(join(dir, 'screen.mp4'), { crf: 22 });
  writeFileSync(join(dir, 'starts.json'), JSON.stringify(starts));
}

type KonvaNode = {
  attrs: Record<string, unknown>;
  name(): string;
  className: string;
  getAbsoluteTransform(): { point(p: { x: number; y: number }): { x: number; y: number } };
  getAbsolutePosition(): { x: number; y: number };
};
type KonvaGlobal = { stages: { find(sel: string): KonvaNode[] }[] };

/**
 * Where a point of the uploaded background picture (in its own pixels) is on screen.
 * Read from the drawing library's own transform, so it follows any zoom or pan.
 */
export async function pictureToScreen(page: Page, [x, y]: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const p = await page.evaluate(
    ([px, py]) => {
      const K = (window as unknown as { Konva: KonvaGlobal }).Konva;
      const img = K.stages[0].find('Image').find((n) => Number(n.attrs.width) > 800)!;
      return img.getAbsoluteTransform().point({ x: px, y: py });
    },
    [x, y],
  );
  return { x: box.x + p.x, y: box.y + p.y };
}

/** Where the bend handles of the selected curved piece are on screen, end first, far end last. */
export async function curveHandles(page: Page) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const pts = await page.evaluate(() => {
    const K = (window as unknown as { Konva: KonvaGlobal }).Konva;
    return K.stages[0].find('.curve-handle').map((n) => n.getAbsolutePosition());
  });
  // They are drawn bend handles first (so the ends sit on top): bend 1, bend 2, end 0, end 3.
  const [b1, b2, e0, e3] = pts.map((p) => ({ x: box.x + p.x, y: box.y + p.y }));
  return [e0, b1, b2, e3];
}
