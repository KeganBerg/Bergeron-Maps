// bergeronmaps.com Worker. Serves the built site and app from _site/ (the ASSETS binding) and
// handles one route of its own: POST /api/contact, the "Get your map now" form, which is emailed
// to the company inbox through Resend. Every other request goes straight to the static files.
// The Resend key lives only in Cloudflare (Worker → Settings → Variables and Secrets →
// RESEND_API_KEY); see docs/EMAIL.md.

const INBOX = 'bergeronmaps@gmail.com';
const FROM = 'Bergeron Maps website <noreply@bergeronmaps.com>';
// Pages allowed to post the form: the live site, the workers.dev test and preview addresses,
// and local development.
const ORIGIN = /^https:\/\/((www\.)?bergeronmaps\.com|([a-z0-9-]+-)?bergeron-maps\.bergeronmaps\.workers\.dev)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const FIELDS = ['Name', 'Company', 'Work email', 'Industry', 'Number of sites', 'Anything else', 'Page'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return contact(request, env);
    return env.ASSETS.fetch(request);
  },
};

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function contact(request, env, send = fetch) {
  if (request.method !== 'POST') return reply(405, { success: false, error: 'POST only' });
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN.test(origin)) return reply(403, { success: false, error: 'Not allowed' });
  const text = await request.text();
  if (text.length > 10000) return reply(413, { success: false, error: 'Too long' });
  let data;
  try { data = JSON.parse(text); } catch { return reply(400, { success: false, error: 'Bad request' }); }
  if (!data || typeof data !== 'object') return reply(400, { success: false, error: 'Bad request' });
  // The hidden field only bots fill in: pretend it worked.
  if (data._honey) return reply(200, { success: true });
  const field = (k) => String(data[k] ?? '').trim().slice(0, 2000);
  const name = field('Name'), email = field('Work email');
  if (!name || !EMAIL.test(email)) return reply(400, { success: false, error: 'Name and a valid email are needed' });
  if (!env.RESEND_API_KEY) return reply(503, { success: false, error: 'Not set up' });

  const company = field('Company');
  const rows = FIELDS.map((k) => [k, field(k) || 'Not given']);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html =
    '<table cellpadding="6" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;border-collapse:collapse">' +
    rows.map(([k, v]) => `<tr><td style="color:#666;vertical-align:top">${esc(k)}</td><td style="white-space:pre-wrap">${esc(v)}</td></tr>`).join('') +
    '</table><p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666">Reply to this email to answer them directly.</p>';
  const res = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [INBOX],
      reply_to: email,
      subject: `New map request: ${(company && company !== 'Not given' ? company : name).replace(/[\r\n]+/g, ' ')}`,
      html,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    }),
  });
  if (!res.ok) return reply(502, { success: false, error: 'Email service failed' });
  return reply(200, { success: true });
}
