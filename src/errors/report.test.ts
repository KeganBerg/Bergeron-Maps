import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../cloud/db';
import { friendly } from './friendly';
import {
  configureReporter, envelope, frames, isStaleCodeError, observedFetch, recentErrors, reportError, resetReporter, routeShape, scrub, sentryOrigin, sentryTarget,
} from './report';

const DSN = 'https://abc123@o42.ingest.us.sentry.io/4507';

describe('scrub', () => {
  it('removes emails, sign-in tokens, and the query and #fragment of addresses', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXZhbHVl';
    const out = scrub(`Failed for dana.smith@example.com with ${jwt} at https://bergeronmaps.com/app/?code=xyz#/harbor-hotel and p_email=a@b.co`);
    expect(out).not.toMatch(/dana|example\.com|eyJ|xyz|harbor|a@b/);
    expect(out).toContain('[email]');
    expect(out).toContain('[token]');
    expect(out).toContain('https://bergeronmaps.com/app/');
  });

  it('keeps stack frame line numbers', () => {
    expect(scrub('at draw (https://bergeronmaps.com/app/assets/index-AbC12.js:12:345)')).toBe('at draw (https://bergeronmaps.com/app/assets/index-AbC12.js:12:345)');
  });
});

describe('routeShape', () => {
  it('keeps the kind of page and drops ids and customer site link names', () => {
    expect(routeShape('#/edit/map_123?preview=1')).toBe('#/edit/:id');
    expect(routeShape('#/harbor-hotel')).toBe('#/:link');
    expect(routeShape('#/view/harbor-hotel/map_1')).toBe('#/view/:id/:id');
    expect(routeShape('#/team')).toBe('#/team');
    expect(routeShape('')).toBe('#/');
  });
});

describe('reportError', () => {
  const sends: { url: string; body: string }[] = [];
  beforeEach(() => {
    resetReporter();
    sends.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.location.hash = '#/edit/map_9';
  });
  afterEach(() => {
    configureReporter({});
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('keeps a report with a short code, and sends nothing without an error-tracking address', () => {
    configureReporter({ send: (url, body) => sends.push({ url, body }) });
    const r = reportError(new Error('Boom for kegan@example.com'), 'crash')!;
    expect(r.code).toMatch(/^[0-9A-F]{8}$/);
    expect(r.message).toBe('Boom for [email]');
    expect(r.route).toBe('#/edit/:id');
    expect(recentErrors()[0]).toBe(r);
    expect(sends).toHaveLength(0);
  });

  it('sends a Sentry envelope with nothing personal, once per problem per page', () => {
    configureReporter({ dsn: DSN, release: 'abc', send: (url, body) => sends.push({ url, body }) });
    window.location.hash = '#/harbor-hotel';
    const err = new Error('Can’t draw for dana@example.com');
    reportError(err, 'crash', { email: 'dana@example.com' });
    reportError(err, 'crash');
    expect(sends).toHaveLength(1);
    expect(sends[0].url).toBe('https://o42.ingest.us.sentry.io/api/4507/envelope/?sentry_version=7&sentry_key=abc123');
    expect(sends[0].body).not.toMatch(/dana|example\.com|harbor/);
    const [head, item, event] = sends[0].body.split('\n').map((l) => JSON.parse(l));
    expect(head.event_id).toHaveLength(32);
    expect(item.type).toBe('event');
    expect(event.sdk.settings.infer_ip).toBe('never');
    expect(event.release).toBe('abc');
    expect(event.tags.route).toBe('#/:link');
    expect(event.user).toBeUndefined();
  });

  it('stops sending after 20 different problems on one page', () => {
    configureReporter({ dsn: DSN, send: (url, body) => sends.push({ url, body }) });
    for (let i = 0; i < 30; i++) reportError(new Error(`problem ${i}`), 'unhandled');
    expect(sends).toHaveLength(20);
  });

  it('ignores browser-extension errors and the ResizeObserver quirk', () => {
    const ext = new Error('x');
    ext.stack = 'Error: x\n    at f (chrome-extension://abcdef/content.js:1:2)';
    expect(reportError(ext, 'unhandled')).toBeNull();
    expect(reportError(new Error('ResizeObserver loop completed with undelivered notifications.'), 'unhandled')).toBeNull();
  });
});

describe('Supabase answers', () => {
  const sends: string[] = [];
  beforeEach(() => {
    resetReporter();
    sends.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    configureReporter({ dsn: DSN, send: (_u, body) => sends.push(body) });
  });
  afterEach(() => {
    configureReporter({});
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('reports a missing SQL function (a database step not run) and server errors, with the path only', async () => {
    const f = observedFetch('database', async () => json(404, { code: 'PGRST202', message: 'Could not find the function public.set_site_limit' }));
    await f('https://x.supabase.co/rest/v1/rpc/set_site_limit?p_email=dana@example.com', { method: 'POST' });
    const g = observedFetch('database', async () => json(503, { message: 'upstream down' }));
    await g('https://x.supabase.co/rest/v1/maps?select=id', {});
    await flush();
    expect(sends).toHaveLength(2);
    const event = JSON.parse(sends[0].split('\n')[2]);
    expect(event.extra).toMatchObject({ status: 404, code: 'PGRST202', method: 'POST', path: '/rest/v1/rpc/set_site_limit' });
    expect(sends[0]).not.toContain('dana');
  });

  it('does not report answers that mean "not allowed" or a duplicate, which the page explains', async () => {
    for (const [status, code] of [[403, '42501'], [409, '23505'], [400, 'P0001'], [401, 'PGRST301']] as const) {
      await observedFetch('database', async () => json(status, { code, message: 'nope' }))('https://x.supabase.co/rest/v1/maps', {});
    }
    await flush();
    expect(sends).toHaveLength(0);
  });

  it('reports when sign-in emails hit the sending limit', async () => {
    await observedFetch('sign-in', async () => json(429, { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }))('https://x.supabase.co/auth/v1/otp', { method: 'POST' });
    await flush();
    expect(sends).toHaveLength(1);
    expect(JSON.parse(sends[0].split('\n')[2]).exception.values[0].type).toBe('SignInServiceError');
  });

  it('is wired into the app’s database client', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { code: '42P01', message: 'relation "public.client_x" does not exist' })));
    const db = createDb('https://abcd.supabase.co', 'anon-key', { flowType: 'pkce', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    const r = await db.from('maps').select('id');
    expect(r.error?.code).toBe('42P01');
    await flush();
    expect(sends).toHaveLength(1);
  });
});

describe('helpers', () => {
  it('reads a DSN', () => {
    expect(sentryOrigin(DSN)).toBe('https://o42.ingest.us.sentry.io');
    expect(sentryOrigin(undefined)).toBeNull();
    expect(sentryTarget('not a dsn')).toBeNull();
  });

  it('turns Chrome and Safari stacks into frames, oldest call first', () => {
    const f = frames('Error: x\n    at inner (https://a.com/app/a.js:1:2)\n    at https://a.com/app/b.js:3:4\nouter@https://a.com/app/c.js:5:6');
    expect(f.map((x) => x.filename)).toEqual(['https://a.com/app/c.js', 'https://a.com/app/b.js', 'https://a.com/app/a.js']);
    expect(f[2]).toMatchObject({ function: 'inner', lineno: 1, colno: 2 });
  });

  it('recognises code files gone after a new version went live', () => {
    expect(isStaleCodeError(new TypeError('Failed to fetch dynamically imported module: https://a.com/app/assets/EditorPage-x.js'))).toBe(true);
    expect(isStaleCodeError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleCodeError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('builds an envelope without a release when none is set', () => {
    configureReporter({});
    const body = envelope('0'.repeat(32), { code: '00000000', at: new Date().toISOString(), where: 'crash', name: 'Error', message: 'm', route: '#/' });
    expect(JSON.parse(body.split('\n')[2]).release).toBeUndefined();
  });

  it('explains connection problems the way people see them on an iPhone', () => {
    expect(friendly({ message: 'TypeError: Load failed' })).toMatch(/Can’t reach the server/);
    expect(friendly({ message: 'JWT expired' })).toMatch(/sign-in expired/);
    expect(friendly({ message: 'Only owners and managers can add people.' })).toBe('Only owners and managers can add people.');
  });
});
