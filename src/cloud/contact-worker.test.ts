import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { contact } from '../../worker/index.js';

const form = { Name: 'Pat', Company: 'Company', 'Work email': 'pat@example.com', Industry: 'Valet', 'Number of sites': '1', 'Anything else': '<b>hi</b>', Page: 'https://bergeronmaps.com/' };
const post = (body: unknown, origin = 'https://bergeronmaps.com') =>
  new Request('https://bergeronmaps.com/api/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const env = { RESEND_API_KEY: 're_test' };

describe('POST /api/contact', () => {
  it('emails the lead to the inbox through Resend, reply-to the visitor, with HTML escaped', async () => {
    const send = ok();
    const res = await contact(post(form), env, send);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer re_test');
    const mail = JSON.parse(String(init.body));
    expect(mail).toMatchObject({ to: ['bergeronmaps@gmail.com'], reply_to: 'pat@example.com', subject: 'New map request: Company' });
    expect(mail.from).toContain('@bergeronmaps.com');
    expect(mail.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>hi</b>');
  });
  it('accepts the preview and local addresses', async () => {
    for (const o of ['https://pr-7-bergeron-maps.bergeronmaps.workers.dev', 'http://localhost:5173', 'https://www.bergeronmaps.com'])
      expect((await contact(post(form, o), env, ok())).status).toBe(200);
  });
  it('refuses other sites, other methods, junk and missing details without sending', async () => {
    const send = ok();
    expect((await contact(post(form, 'https://evil.example'), env, send)).status).toBe(403);
    expect((await contact(post(form, 'https://bergeronmaps.com.evil.example'), env, send)).status).toBe(403);
    expect((await contact(new Request('https://bergeronmaps.com/api/contact'), env, send)).status).toBe(405);
    expect((await contact(post('not json'), env, send)).status).toBe(400);
    expect((await contact(post({ ...form, 'Work email': 'nope' }), env, send)).status).toBe(400);
    expect((await contact(post({ ...form, Name: '' }), env, send)).status).toBe(400);
    expect((await contact(post({ ...form, 'Anything else': 'x'.repeat(20000) }), env, send)).status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });
  it('quietly drops bots that fill the hidden field', async () => {
    const send = ok();
    const res = await contact(post({ ...form, _honey: 'x' }), env, send);
    expect(await res.json()).toEqual({ success: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('says it failed when the key is missing or Resend refuses', async () => {
    expect((await contact(post(form), {}, ok())).status).toBe(503);
    expect((await contact(post(form), env, vi.fn(async () => new Response('', { status: 422 })))).status).toBe(502);
  });
});

// @ts-expect-error plain JS module run by the Cloudflare Worker
import { access } from '../../worker/index.js';

describe('POST /api/access', () => {
  const company = '11111111-2222-3333-4444-555555555555';
  const site = { id: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Site Name', slug: 'site-name' };
  const other = { id: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'Other Site', slug: 'other' };
  const aEnv = { RESEND_API_KEY: 're_test', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
  const req = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer user-jwt' }) =>
    new Request('https://bergeronmaps.com/api/access', { method: 'POST', headers: { origin: 'https://bergeronmaps.com', ...headers }, body: JSON.stringify(body) });
  /** A fake Supabase + Resend: list_members answers `members` (or refuses), and every call is recorded. */
  const fake = (members: unknown[] | null) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
      if (url.endsWith('/rpc/list_members')) return members ? json(members) : json({ message: 'no' }, 403);
      if (url.includes('/companies?')) return json([{ name: 'Company' }]);
      if (url.includes('/facilities?')) return json([other, site]);
      if (url === 'https://api.resend.com/emails') return json({ id: 'e1' });
      return json({}, 404);
    });
    return { fn, calls };
  };

  it('checks with the manager’s own token, then emails the person their one site link', async () => {
    const { fn, calls } = fake([{ email: 'Pat@Example.com', role: 'manager', facility_ids: [site.id] }]);
    const res = await access(req({ company, email: 'pat@example.com' }), aEnv, fn);
    expect(res.status).toBe(200);
    const list = calls.find((c) => c.url.endsWith('/rpc/list_members'))!;
    expect((list.init.headers as Record<string, string>).authorization).toBe('Bearer user-jwt');
    const mail = JSON.parse(String(calls.find((c) => c.url.includes('resend'))!.init.body));
    expect(mail.to).toEqual(['pat@example.com']);
    expect(mail.subject).toBe('You now have access to Site Name on Bergeron Maps');
    expect(mail.text).toContain('https://bergeronmaps.com/app/#/site-name');
    expect(mail.html).toContain('lockup.png');
    expect(mail.text).not.toContain('Other Site');
  });
  it('a regional manager gets the company and the app link', async () => {
    const { fn, calls } = fake([{ email: 'r@example.com', role: 'manager', facility_ids: null }]);
    expect((await access(req({ company, email: 'r@example.com' }), aEnv, fn)).status).toBe(200);
    const mail = JSON.parse(String(calls.find((c) => c.url.includes('resend'))!.init.body));
    expect(mail.text).toContain('manage every site in Company');
    expect(mail.text).toContain('Open https://bergeronmaps.com/app/ and');
  });
  it('sends nothing for someone not on the manager’s team, or when the manager can’t list the team', async () => {
    for (const members of [[{ email: 'someone@else.com', role: 'employee', facility_ids: [site.id] }], null]) {
      const { fn, calls } = fake(members);
      const res = await access(req({ company, email: 'pat@example.com' }), aEnv, fn);
      expect([403, 404]).toContain(res.status);
      expect(calls.some((c) => c.url.includes('resend'))).toBe(false);
    }
  });
  it('refuses without a sign-in, from other sites, with bad input or when not set up', async () => {
    const { fn, calls } = fake([]);
    expect((await access(req({ company, email: 'p@e.co' }, {}), aEnv, fn)).status).toBe(401);
    expect((await access(new Request('https://bergeronmaps.com/api/access', { method: 'POST', headers: { origin: 'https://evil.example', authorization: 'Bearer t' }, body: '{}' }), aEnv, fn)).status).toBe(403);
    expect((await access(req({ company: 'not-a-uuid', email: 'p@e.co' }), aEnv, fn)).status).toBe(400);
    expect((await access(req({ company, email: 'nope' }), aEnv, fn)).status).toBe(400);
    expect((await access(req({ company, email: 'p@e.co' }), { ...aEnv, RESEND_API_KEY: '' }, fn)).status).toBe(503);
    expect(calls).toEqual([]);
  });
});
