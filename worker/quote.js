// POST /api/quote: "Email me this quote" on the purchase page (site/get-your-map/). Kegan wants a quote
// to reach both the customer and us, so one request sends two emails through Resend: the quote to the
// customer, and a copy to the company inbox with the customer as Reply-To.
// Anyone can ask for a quote to any address, so the customer's email is built only from numbers we
// check here and never repeats text from the request. The name and company they typed go to our copy only.

import { INBOX, FROM, ORIGIN, EMAIL, reply, esc, shell, button, sendEmail } from './shared.js';

/** List prices (Kegan, 2026-11-23). Stripe charges the prices stored in Stripe; these are for the quote. */
export const SETUP = 2500;
export const MONTHLY = 500;
/** The purchase page's limits: 1 to 20 locations, and assisted setup from 5 (site/get-your-map/page.js). */
const MAX = 20, ASSISTED_FROM = 5;
const TERMS = ['6', '12'];
const KINDS = { valet: 'Valet', dealership: 'Dealership', school: 'School', warehouse: 'Warehouse', office: 'Other' };
const SALES = 'sales@bergeronmaps.com';
const PHONE = '(802) 578-3856';

const money = (v) => `$${v.toLocaleString('en-US')}`;

/** The checked order behind a quote, or null when the request isn't one the purchase page can make. */
export function readQuote(data) {
  const n = Number(data?.locations);
  const term = String(data?.term ?? '');
  const site = String(data?.site ?? '');
  const email = String(data?.email ?? '').trim();
  if (!Number.isInteger(n) || n < 1 || n > MAX || !TERMS.includes(term) || !Object.hasOwn(KINDS, site) || !EMAIL.test(email) || email.length > 200) return null;
  const text = (k) => String(data?.[k] ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return { n, term, site, email, name: text('name'), company: text('company') };
}

/** The quote's lines, shared by both emails so they always match. */
export function quoteLines({ n, term }) {
  return [
    [`Setup, ${n} ${n === 1 ? 'location' : `locations at ${money(SETUP)} each`}`, `${money(SETUP * n)} one-time`],
    ['Monthly service', `${money(MONTHLY * n)} a month, starting 30 days after setup is paid`],
    ['Term', `${term} months`],
    ...(n >= ASSISTED_FROM ? [['Assisted setup', 'Included: we help build your first maps']] : []),
    ['Due when you order', money(SETUP * n)],
  ];
}

const table = (lines) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-bottom:1px solid #e6e6e1;">${lines
    .map(([k, v]) => `<tr><td style="padding:10px 16px 10px 0;border-top:1px solid #e6e6e1;font-size:14px;color:#666666;vertical-align:top;">${esc(k)}</td>` +
      `<td style="padding:10px 0;border-top:1px solid #e6e6e1;font-size:15px;color:#0b0b0b;">${esc(v)}</td></tr>`)
    .join('')}</table>`;

export function customerQuoteEmail(q, link) {
  return shell(`<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">Your Bergeron Maps quote</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">Here is the quote you asked for on bergeronmaps.com.</p>
${table(quoteLines(q))}
${button(esc(link), 'Open this order')}
<p style="margin:16px 0 24px;font-size:14px;line-height:1.5;color:#555555;">The button opens the order with these choices, ready to pay. Questions? Call ${PHONE} or reply to this email.</p>`,
  `<a href="https://bergeronmaps.com" style="color:#777777;">bergeronmaps.com</a><br>Sales: <a href="mailto:${SALES}" style="color:#777777;">${SALES}</a>, ${PHONE}`);
}

export function companyQuoteEmail(q, link) {
  const who = [q.name, q.company].filter(Boolean).map(esc).join(', ');
  return shell(`<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;">Quote sent</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#333333;">We emailed this quote to <a href="mailto:${esc(q.email)}" style="color:#0b0b0b;">${esc(q.email)}</a>${who ? ` (${who})` : ''}. Press Reply to follow up.</p>
${table([...quoteLines(q), ['Site type', KINDS[q.site]]])}
<p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#555555;">Their order link: <a href="${esc(link)}" style="color:#0b0b0b;">${esc(link)}</a></p>`);
}

export async function quote(request, env, send = fetch) {
  if (request.method !== 'POST') return reply(405, { success: false, error: 'POST only' });
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN.test(origin)) return reply(403, { success: false, error: 'Not allowed' });
  const body = await request.text();
  if (body.length > 2000) return reply(413, { success: false, error: 'Too long' });
  let data;
  try { data = JSON.parse(body); } catch { return reply(400, { success: false, error: 'Bad request' }); }
  if (data?._honey) return reply(200, { success: true });
  const q = readQuote(data);
  if (!q) return reply(400, { success: false, error: 'Enter an email address, like name@company.com' });
  if (!env.RESEND_API_KEY) return reply(503, { success: false, error: 'Not set up' });

  const link = `${origin}/get-your-map/?n=${q.n}&term=${q.term}&site=${q.site}`;
  const text = quoteLines(q).map(([k, v]) => `${k}: ${v}`).join('\n');
  const sent = await sendEmail(env, send, {
    to: [q.email],
    subject: 'Your Bergeron Maps quote',
    html: customerQuoteEmail(q, link),
    text: `Your Bergeron Maps quote\n\n${text}\n\nOpen this order, ready to pay:\n${link}\n\nQuestions? Call ${PHONE} or reply to this email.`,
  });
  if (!sent) return reply(502, { success: false, error: 'Email service failed' });
  // Our copy. The customer already has their quote, so a failure here is logged, not shown to them.
  const copy = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [INBOX], reply_to: q.email,
      subject: `Quote sent: ${q.n} ${q.n === 1 ? 'location' : 'locations'} to ${q.company || q.email}`,
      html: companyQuoteEmail(q, link),
      text: `Quote sent to ${q.email}${q.name ? ` (${q.name})` : ''}\n\n${text}\n\n${link}`,
    }),
  });
  if (!copy.ok) console.error('Quote copy to the inbox failed', copy.status);
  return reply(200, { success: true });
}
