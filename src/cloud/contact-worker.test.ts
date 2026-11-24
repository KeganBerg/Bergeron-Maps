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
