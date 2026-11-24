// bergeronmaps.com Worker. Serves the built site and app from _site/ (the ASSETS binding) and
// handles two routes of its own, both sent through Resend:
//   POST /api/contact  the "Get your map now" form, emailed to the company inbox;
//   POST /api/access   the "you've been given access" email to a person a manager just added.
// Every other request goes straight to the static files.
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
    if (url.pathname === '/api/access') return access(request, env);
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

/**
 * POST /api/access {company, email} with the signed-in manager's Supabase token. Emails that
 * person where to go and how to sign in. The Worker checks everything with the manager's own
 * token, so it can only ever send what the manager could already see in the app: the person must
 * be on the manager's Team list (list_members refuses employees and strangers), and the site
 * names come from what that manager can read. The email's wording is built here, never taken
 * from the request.
 */
export async function access(request, env, send = fetch) {
  if (request.method !== 'POST') return reply(405, { success: false, error: 'POST only' });
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN.test(origin)) return reply(403, { success: false, error: 'Not allowed' });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return reply(401, { success: false, error: 'Sign in first' });
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch { return reply(400, { success: false, error: 'Bad request' }); }
  const company = String(body?.company || '');
  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(company) || !EMAIL.test(email)) return reply(400, { success: false, error: 'Bad request' });
  if (!env.RESEND_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return reply(503, { success: false, error: 'Not set up' });

  const db = (path, init = {}) => send(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const members = await db('rpc/list_members', { method: 'POST', body: JSON.stringify({ p_company: company }) });
  if (!members.ok) return reply(403, { success: false, error: 'Not allowed' });
  const person = ((await members.json()) || []).find((m) => String(m.email || '').toLowerCase() === email);
  if (!person) return reply(404, { success: false, error: 'Not on your team' });

  const [co, fac] = await Promise.all([
    db(`companies?id=eq.${company}&select=name`),
    db(`facilities?company_id=eq.${company}&select=id,name,slug&order=name`),
  ]);
  const companyName = (co.ok && (await co.json())[0]?.name) || 'your company';
  const sites = fac.ok ? await fac.json() : [];
  const ids = person.facility_ids;
  const theirs = ids ? sites.filter((f) => ids.includes(f.id)) : [];
  const app = `${origin}/app/`;
  const one = ids && ids.length === 1 && theirs[0];
  const link = one ? `${app}#/${one.slug}` : app;
  const where = one ? one.name : ids && theirs.length ? theirs.map((f) => f.name).join(', ') : companyName;
  const role = person.role;
  const verb = role === 'employee' ? 'view the maps for' : role === 'owner' || !ids ? 'manage every site in' : 'manage';
  const subject = `You now have access to ${one ? one.name : companyName} on Bergeron Maps`;
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = accessEmail({ verb: esc(verb), where: esc(where), link: esc(link), email: esc(email) });
  const text = `You can now ${verb} ${where} on Bergeron Maps.\n\nOpen ${link} and sign in with ${email}. We'll email you a sign-in link and code, so there's no password to set.\n\nBergeron Maps · bergeronmaps.com`;
  const res = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Bergeron Maps <noreply@bergeronmaps.com>', to: [email], subject: subject.replace(/[\r\n]+/g, ' '), html, text }),
  });
  if (!res.ok) return reply(502, { success: false, error: 'Email service failed' });
  return reply(200, { success: true });
}

/** Same look as the sign-in emails in supabase/email-templates/. */
function accessEmail({ verb, where, link, email }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f2f2ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2ef;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #dcdcd6;">
<tr><td style="padding:24px 28px;background:#0b0b0b;"><img src="https://bergeronmaps.com/img/email/lockup.png" width="331" height="40" alt="Bergeron Maps" style="display:block;border:0;"></td></tr>
<tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">You've been given access</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">You can now ${verb} <strong>${where}</strong> on Bergeron Maps.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0b0b0b" style="background:#0b0b0b;">
<a href="${link}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">Open Bergeron Maps</a>
</td></tr></table>
<p style="margin:24px 0 24px;font-size:15px;line-height:1.5;color:#333333;">Sign in with <strong>${email}</strong>. We'll email you a sign-in link and code, so there's no password to set.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e6e6e1;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#777777;">
Bergeron Maps &middot; <a href="https://bergeronmaps.com" style="color:#777777;">bergeronmaps.com</a> &middot; Questions? <a href="mailto:bergeronmaps@gmail.com" style="color:#777777;">bergeronmaps@gmail.com</a>
</td></tr></table></td></tr></table></body></html>`;
}
