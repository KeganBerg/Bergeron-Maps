// Pieces every route in the Worker shares: the company inbox, which pages may call the API,
// the JSON reply, and the email frame (logo bar, white card, small footer) that matches the
// sign-in emails in supabase/email-templates/.

export const INBOX = 'bergeronmaps@gmail.com';
export const FROM = 'Bergeron Maps website <noreply@bergeronmaps.com>';
// Pages allowed to call the API: the live site, the workers.dev test and preview addresses,
// and local development.
export const ORIGIN = /^https:\/\/((www\.)?bergeronmaps\.com|([a-z0-9-]+-)?bergeron-maps\.bergeronmaps\.workers\.dev)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const FONT = 'font-family:Arial,Helvetica,sans-serif;';

/** Same frame as the sign-in emails in supabase/email-templates/: logo bar, white card, small footer. */
const FOOTER = '<a href="https://bergeronmaps.com" style="color:#777777;">bergeronmaps.com</a><br>Questions? Email <a href="mailto:bergeronmaps@gmail.com" style="color:#777777;">bergeronmaps@gmail.com</a>';

export function shell(inner, footer = FOOTER) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f2f2ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2ef;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #dcdcd6;">
<tr><td style="padding:24px 28px;background:#0b0b0b;"><img src="https://bergeronmaps.com/img/email/lockup.png" width="331" height="40" alt="Bergeron Maps" style="display:block;border:0;"></td></tr>
<tr><td style="padding:28px 28px 8px;${FONT}color:#0b0b0b;">
${inner}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e6e6e1;${FONT}font-size:12px;line-height:1.5;color:#777777;">
${footer}
</td></tr></table></td></tr></table></body></html>`;
}

export const button = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0b0b0b" style="background:#0b0b0b;">
<a href="${href}" style="display:inline-block;padding:14px 28px;${FONT}font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
</td></tr></table>`;

