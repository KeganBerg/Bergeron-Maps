// bergeronmaps.com Worker. Serves the built site and app from _site/ (the ASSETS binding) and
// handles a few routes of its own (emails go through Resend):
//   POST /api/contact  the "Get your map now" form, emailed to the company inbox;
//   POST /api/access   the "you've been given access" email to a person a manager just added.
//   POST /api/checkout and /api/stripe-webhook  Get Your Map Now payments (worker/stripe.js),
//                      which also open and pause accounts (worker/accounts.js).
// Once a day it also emails grace-period reminders (worker/grace.js).
// Every other request goes straight to the static files.
// The Resend key lives only in Cloudflare (Worker → Settings → Variables and Secrets →
// RESEND_API_KEY); see docs/EMAIL.md.

import { INBOX, FROM, ORIGIN, EMAIL, reply, esc, shell, button } from './shared.js';
import { checkout, checkoutTestPage, stripeWebhook } from './stripe.js';
import { sendGraceReminders } from './grace.js';

const FIELDS = ['Name', 'Company', 'Work email', 'Industry', 'Number of sites', 'Anything else', 'Page'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return contact(request, env);
    if (url.pathname === '/api/access') return access(request, env);
    if (url.pathname === '/api/checkout') return checkout(request, env);
    if (url.pathname === '/api/checkout-test') return checkoutTestPage(request, env);
    if (url.pathname === '/api/stripe-webhook') return stripeWebhook(request, env);
    return env.ASSETS.fetch(request);
  },
  // The daily cron in wrangler.jsonc: grace-period reminders to customers with an overdue payment.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(sendGraceReminders(env));
  },
};

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
  // Pages cached from before the form sent blanks still send these words for an empty answer.
  const BLANK = ['Not given', '(nothing)'];
  const field = (k) => { const v = String(data[k] ?? '').trim().slice(0, 2000); return BLANK.includes(v) ? '' : v; };
  const name = field('Name'), email = field('Work email');
  if (!name || !EMAIL.test(email)) return reply(400, { success: false, error: 'Name and a valid email are needed' });
  if (!env.RESEND_API_KEY) return reply(503, { success: false, error: 'Not set up' });

  const company = field('Company');
  const rows = FIELDS.map((k) => [k, field(k)]).filter(([, v]) => v);
  const html = leadEmail({
    name, email, company,
    industry: field('Industry'), sites: field('Number of sites'), note: field('Anything else'), page: field('Page'),
  });
  const res = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [INBOX],
      reply_to: email,
      subject: `New map request: ${(company || name).replace(/[\r\n]+/g, ' ')}`,
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
  const html = accessEmail({ verb: esc(verb), where: esc(where), link: esc(link), email: esc(email) });
  const text = `You can now ${verb} ${where} on Bergeron Maps.\n\nOpen ${link} and sign in with ${email}. We'll email you a sign-in link and code, so there's no password to set.\n\nBergeron Maps, bergeronmaps.com`;
  const res = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Bergeron Maps <noreply@bergeronmaps.com>', to: [email], subject: subject.replace(/[\r\n]+/g, ' '), html, text }),
  });
  if (!res.ok) return reply(502, { success: false, error: 'Email service failed' });
  return reply(200, { success: true });
}

/**
 * The website form's lead, for the company inbox. Only the answers the visitor gave are listed;
 * their note always gets its own block, left empty when they wrote nothing (Kegan's choice, so every
 * lead email has the same shape); the page it came from sits small at the bottom.
 */
export function leadEmail({ name, email, company, industry, sites, note, page }) {
  const who = company ? `${esc(name)} from <strong>${esc(company)}</strong>` : `<strong>${esc(name)}</strong>`;
  const facts = [
    ['Email', `<a href="mailto:${esc(email)}" style="color:#0b0b0b;">${esc(email)}</a>`],
    ['Company', company && esc(company)],
    ['Industry', industry && esc(industry)],
    ['Sites', sites && esc(sites)],
  ].filter(([, v]) => v);
  const row = ([k, v]) =>
    `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #e6e6e1;font-size:14px;color:#666666;vertical-align:top;white-space:nowrap;width:96px;">${k}</td>` +
    `<td style="padding:10px 0;border-top:1px solid #e6e6e1;font-size:15px;color:#0b0b0b;">${v}</td></tr>`;
  const mailto = `mailto:${esc(email)}?subject=${encodeURIComponent('Your Bergeron Maps request')}`;
  let from = '';
  try { if (page) from = new URL(page).host; } catch { /* not a link */ }
  return shell(`<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">New map request</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">${who} asked for a map.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-bottom:1px solid #e6e6e1;">${facts.map(row).join('')}</table>
<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#0b0b0b;">Their note</p>
<p style="margin:0 0 24px;padding:12px 16px;background:#f7f7f4;border-left:3px solid #0b0b0b;font-size:15px;line-height:1.5;color:#333333;white-space:pre-wrap;">${note ? esc(note) : '&nbsp;'}</p>
${button(mailto, `Reply to ${esc(name.split(/\s+/)[0])}`)}
<p style="margin:16px 0 24px;font-size:13px;line-height:1.5;color:#777777;">Or just hit Reply in your inbox.</p>`,
  `Sent from the form on ${esc(from || 'bergeronmaps.com')}.`);
}

function accessEmail({ verb, where, link, email }) {
  return shell(`<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;">You've been given access</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">You can now ${verb} <strong>${where}</strong> on Bergeron Maps.</p>
${button(link, 'Open Bergeron Maps')}
<p style="margin:24px 0 24px;font-size:15px;line-height:1.5;color:#333333;">Sign in with <strong>${email}</strong>. We'll email you a sign-in link and code, so there's no password to set.</p>`);
}
