import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The marketing site may only promise what the app does today (docs/SITE_CLAIMS.md).
 * This guard catches the claims that are easiest to slip in by accident: features
 * that are planned but not live, and things the product deliberately doesn't do.
 * HTML comments are ignored, so a finished-but-hidden section can wait there.
 * If one of these becomes true in the app, remove its line here in the same PR.
 */
const NOT_LIVE: [RegExp, string][] = [
  [/\bstripe\b|checkout|credit card|pay online|subscribe now|free trial/i, 'online payment is not live'],
  [/\$\s?[1-9]/, 'prices are not published on the site yet'],
  [/white[- ]label|your own (domain|subdomain)|maps\.[a-z]+\.com|custom domain/i, 'white-label branding and subdomains are not live'],
  [/\binvit(e|es|ation)\b[^.]{0,40}\bemail\b|email[^.]{0,20}\binvit/i, 'the app sends no invitation emails; access is given by email address'],
  [/sign up (now|today|free)|create (an|your) account|self[- ]serve/i, 'self-serve sign-up is not live'],
  [/\bgps\b|real[- ]time|live (tracking|location|occupancy)|occupancy (sensor|detection)|(?<!(don't|doesn't|not|never) )track(s|ing)? (vehicles|cars|people)/i, 'the product does not track anything'],
  [/use my location|current location/i, '"Use my location" is not built'],
  [/\bapi\b|integrates? with|integration/i, 'there is no public API or integration'],
  [/offline/i, 'the viewer needs a connection'],
  [/\bpdf\b(?! reference)/i, 'PDF import is not built'],
  [/\b\d+% (faster|more|less|fewer|of)|\b\d+x faster|thousands of (customers|sites)/i, 'no made-up statistics'],
];

/** The Get Your Map Now purchase page, and the NOT_LIVE rules that are true on it. */
const BUY_PAGE = join('site', 'get-your-map', 'index.html');
const PURCHASE_TRUTHS = ['online payment is not live', 'prices are not published on the site yet'];

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'vendor' || n === 'img' || n === 'fonts') return [];
    return statSync(p).isDirectory() ? pages(p) : p.endsWith('.html') ? [p] : [];
  });
}

/** What a visitor or a link preview can read: text, alt text, titles and meta content. */
export function readable(html: string): string {
  const meta = [...html.matchAll(/<meta[^>]+content="([^"]*)"/g)].map((m) => m[1]);
  const attrs = [...html.matchAll(/\b(?:alt|title|aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return [...meta, ...attrs, body].join('\n').replace(/&amp;/g, '&').replace(/&[a-z]+;|&#\d+;/g, ' ');
}

describe('site claims', () => {
  it('finds a not-live claim in a sample', () => {
    const t = readable('<p>Pay online with Stripe</p><!-- <p>White-label</p> -->');
    expect(NOT_LIVE.some(([re]) => re.test(t))).toBe(true);
    expect(/white/i.test(readable('<!-- White-label -->'))).toBe(false);
  });

  it('the site promises nothing the app does not do', () => {
    const found: string[] = [];
    for (const f of pages('site')) {
      const lines = readable(readFileSync(f, 'utf8')).split('\n');
      // The purchase page really takes payment (worker/stripe.js), so prices and payment are true
      // there. Every other claim on it is still checked.
      const rules = f === BUY_PAGE ? NOT_LIVE.filter(([, why]) => !PURCHASE_TRUTHS.includes(why)) : NOT_LIVE;
      for (const line of lines) for (const [re, why] of rules) {
        const m = line.match(re);
        if (m) found.push(`${f}: "${m[0]}" (${why})`);
      }
    }
    expect(found).toEqual([]);
  });

  it('nothing links to the purchase page until sales go live', () => {
    // Live keys refuse to sell until CHECKOUT_LIVE is set (docs/STRIPE.md). When it is, remove this
    // test in the same PR that links the page and adds it to the sitemap.
    const linking = pages('site').filter((f) => f !== BUY_PAGE && /get-your-map/.test(readFileSync(f, 'utf8')));
    expect(linking).toEqual([]);
    expect(readFileSync('site/sitemap.xml', 'utf8')).not.toMatch(/get-your-map/);
    expect(readFileSync(BUY_PAGE, 'utf8')).toMatch(/<meta name="robots" content="noindex"/);
  });
});
