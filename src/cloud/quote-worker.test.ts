import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS module run by the Cloudflare Worker
import { quote, readQuote } from '../../worker/quote.js';

const order = { email: 'pat@example.com', name: 'Pat <b>', locations: 3, term: 12, site: 'valet' };
const post = (body: unknown, origin = 'https://bergeronmaps.com') =>
  new Request('https://bergeronmaps.com/api/quote', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const env = { RESEND_API_KEY: 're_test' };
const mails = (send: ReturnType<typeof ok>) =>
  (send.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(String(init.body)));

describe('POST /api/quote', () => {
  it('emails the quote to the customer and a copy to our inbox', async () => {
    const send = ok();
    const res = await quote(post(order), env, send);
    expect(res.status).toBe(200);
    const [customer, copy] = mails(send);
    expect(customer).toMatchObject({ to: ['pat@example.com'], reply_to: 'bergeronmaps@gmail.com', subject: 'Your Bergeron Maps quote' });
    expect(customer.html).toContain('$7,500 one-time');
    expect(customer.html).toContain('$1,500 a month');
    expect(customer.html).toContain('https://bergeronmaps.com/get-your-map/?n=3&amp;term=12&amp;site=valet');
    expect(copy).toMatchObject({ to: ['bergeronmaps@gmail.com'], reply_to: 'pat@example.com' });
    expect(copy.subject).toBe('Quote sent: 3 locations to pat@example.com');
    expect(copy.html).toContain('Pat &lt;b&gt;');
  });
  it('never repeats what the visitor typed in the customer email', async () => {
    const send = ok();
    await quote(post({ ...order, name: 'Click http://spam.example' }), env, send);
    const [customer] = mails(send);
    expect(customer.html + customer.text).not.toContain('spam.example');
  });
  it('lists assisted setup from 5 locations', async () => {
    const send = ok();
    await quote(post({ ...order, locations: 5 }), env, send);
    expect(mails(send)[0].html).toContain('Assisted setup');
  });
  it('refuses orders the purchase page cannot make, other sites, and missing setup', async () => {
    expect(readQuote({ ...order, locations: 21 })).toBeNull();
    expect(readQuote({ ...order, locations: 1.5 })).toBeNull();
    expect(readQuote({ ...order, term: 3 })).toBeNull();
    expect(readQuote({ ...order, site: 'castle' })).toBeNull();
    expect(readQuote({ ...order, email: 'nope' })).toBeNull();
    expect((await quote(post(order, 'https://evil.example'), env, ok())).status).toBe(403);
    expect((await quote(post(order), {}, ok())).status).toBe(503);
    const send = ok();
    expect((await quote(post({ ...order, _honey: 'x' }), env, send)).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
  it('reports a failure when the customer email fails', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 500 }));
    expect((await quote(post(order), env, send)).status).toBe(502);
  });
});
