#!/usr/bin/env node
/**
 * Checks that the live site, the app and the database answer (docs/MONITORING.md).
 * Run every 15 minutes by .github/workflows/uptime.yml, which opens a GitHub
 * issue (so Kegan gets an email) when something is down and closes it once
 * everything is back.
 *
 * Prints a Markdown report. Exits 1 when any check still fails after retries.
 * Sends no personal data: these are the same requests any visitor makes.
 */

const SITE = process.env.SITE_URL ?? 'https://bergeronmaps.com';
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ysebxeokxpnmckwdtimj.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const ATTEMPTS = Number(process.env.ATTEMPTS ?? 3);
const WAIT_MS = Number(process.env.WAIT_MS ?? 20_000);
const TIMEOUT_MS = 20_000;

async function get(url, init = {}) {
  const started = Date.now();
  const res = await fetch(url, { redirect: 'follow', ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { res, ms: Date.now() - started };
}

const checks = [
  {
    name: 'Website (bergeronmaps.com)',
    async run() {
      const { res, ms } = await get(`${SITE}/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/Bergeron/i.test(await res.text())) throw new Error('page loaded but looks wrong (no "Bergeron" on it)');
      return ms;
    },
  },
  {
    name: 'App (/app/) and its code file',
    async run() {
      const { res, ms } = await get(`${SITE}/app/`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const src = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1];
      if (!src) throw new Error('app page has no script: the build may be broken');
      const js = await get(new URL(src, `${SITE}/app/`).href);
      if (!js.res.ok) throw new Error(`app code file ${src} answered HTTP ${js.res.status}`);
      return ms + js.ms;
    },
  },
  {
    name: 'Sign-in service (Supabase Auth)',
    async run() {
      const { res, ms } = await get(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ms;
    },
  },
  {
    name: 'Database (Supabase)',
    async run() {
      // The public-link lookup any visitor may call (signed out). A made-up link answers an
      // empty list; a paused or broken database can't answer at all.
      const { res, ms } = await get(`${SUPABASE_URL}/rest/v1/rpc/get_public_site`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: 'uptime-check-no-such-site' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 540 ? ' (project paused)' : ''}`);
      return ms;
    },
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
for (const c of checks) {
  let last;
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      results.push({ name: c.name, ok: true, ms: await c.run(), tries: i });
      last = null;
      break;
    } catch (e) {
      last = e;
      if (i < ATTEMPTS) await sleep(WAIT_MS);
    }
  }
  if (last) results.push({ name: c.name, ok: false, error: [last.message, last.cause?.message || last.cause?.code].filter(Boolean).join(': '), tries: ATTEMPTS });
}

const down = results.filter((r) => !r.ok);
const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const lines = [
  down.length ? `**${down.length} of ${results.length} checks failing** (${when})` : `All ${results.length} checks passing (${when})`,
  '',
  '| Check | Result |',
  '| --- | --- |',
  ...results.map((r) => `| ${r.name} | ${r.ok ? `OK (${r.ms} ms${r.tries > 1 ? `, after ${r.tries} tries` : ''})` : `**Down**: ${r.error} (tried ${r.tries} times)`} |`),
];
if (down.length) {
  lines.push('', 'What to do: see "When an alert arrives" in docs/MONITORING.md. This issue closes by itself once every check passes again.');
}
console.log(lines.join('\n'));
process.exit(down.length ? 1 : 0);
