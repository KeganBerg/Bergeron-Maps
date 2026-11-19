/**
 * Error reporting for the live app (see docs/MONITORING.md).
 *
 * Every problem a person runs into (a crash, an unhandled failure, a server
 * error from Supabase) comes through `reportError`. It always logs to the
 * console and keeps the last few in memory for "Copy error details". When the
 * build has an error-tracking address (VITE_SENTRY_DSN), it also sends a
 * short report there, so Bergeron Maps hears about it without the customer
 * having to call.
 *
 * Privacy: reports never carry personal data. No email addresses, names,
 * sign-in tokens, map contents, site link names or IP addresses. Addresses
 * are cut to their page shape (#/edit/:id), and every text goes through
 * `scrub` before it leaves this file. This file sends its own small report
 * instead of loading a vendor SDK, so exactly what is sent is written here.
 */

import { sentryTarget } from './dsn';

export { sentryOrigin, sentryTarget } from './dsn';

export interface ErrorReport {
  /** Short code a person can read out to support, e.g. "7F3A9C2B". */
  code: string;
  at: string;
  /** Which part of the app: "crash", "unhandled", "database", "sign-in", … */
  where: string;
  name: string;
  message: string;
  stack?: string;
  route: string;
  extra?: Record<string, string | number | boolean | null>;
}

interface Config {
  dsn?: string;
  release?: string;
  environment?: string;
  /** Tests replace how reports are sent. */
  send?: (url: string, body: string) => void;
}

let config: Config = {};
const recent: ErrorReport[] = [];
const seen = new Set<string>();
let sent = 0;
/** One page load never sends more than this, so a loop can't flood the inbox (or the free plan). */
const MAX_SENT_PER_PAGE = 20;
const KEEP = 10;

export function configureReporter(c: Config) {
  config = c;
}

/** Forgets what was reported (tests only). */
export function resetReporter() {
  recent.length = 0;
  seen.clear();
  sent = 0;
}

export const recentErrors = (): readonly ErrorReport[] => recent;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g;
const SECRET_PARAM = /\b(access_token|refresh_token|token|code|apikey|key|join_code|p_code|p_email|email)=([^&\s"']+)/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{40,}\b/g;
const URL_RE = /\b(https?:\/\/[^\s"'()<>]+)/g;

/** Removes anything personal or secret from a piece of text. */
export function scrub(text: string): string {
  return text
    .replace(URL_RE, (u) => cleanUrl(u))
    .replace(JWT, '[token]')
    .replace(EMAIL, '[email]')
    .replace(SECRET_PARAM, (_m, k: string) => `${k}=[removed]`)
    .replace(LONG_TOKEN, '[token]');
}

/** A web address without its query or #fragment: those can hold tokens, emails, and site link names. */
function cleanUrl(u: string): string {
  // Stack frames end in :line:column, which must survive.
  const m = /^(.*?)(:\d+:\d+)?$/.exec(u)!;
  try {
    const p = new URL(m[1]);
    return `${p.origin}${p.pathname}${m[2] ?? ''}`;
  } catch {
    return m[1].split(/[?#]/)[0] + (m[2] ?? '');
  }
}

const NAMED_PAGES = new Set(['edit', 'view', 'team', 'admin', 'locations', 'site']);
/**
 * The page someone was on, as a shape: "#/edit/:id", "#/team", "#/:link".
 * Site links are named after the customer (#/harbor-hotel), so never sent.
 */
export function routeShape(hash = typeof window === 'undefined' ? '' : window.location.hash): string {
  const path = hash.replace(/^#/, '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return '#/';
  const first = NAMED_PAGES.has(parts[0]) ? parts[0] : ':link';
  return '#/' + [first, ...parts.slice(1).map(() => ':id')].join('/');
}

/** Noise that isn't a problem in the app: browser extensions, a resize quirk, people going offline. */
export function shouldIgnore(name: string, message: string, stack = ''): boolean {
  if (/ResizeObserver loop/i.test(message)) return true;
  if (message === 'Script error.' && !stack) return true;
  if (/(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)) return true;
  if (name === 'AbortError') return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Records a problem. Returns the report (with the code to show the person),
 * or null when it is noise that isn't worth anyone's attention.
 */
export function reportError(
  error: unknown,
  where: string,
  extra?: Record<string, string | number | boolean | null | undefined>,
): ErrorReport | null {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeString(error));
  const name = e.name || 'Error';
  const rawStack = e.stack ?? '';
  if (shouldIgnore(name, e.message ?? '', rawStack)) return null;
  const id = newId();
  const cleanExtra = extra
    ? Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'string' ? scrub(v).slice(0, 300) : v as number | boolean | null]))
    : undefined;
  const report: ErrorReport = {
    code: id.slice(0, 8).toUpperCase(),
    at: new Date().toISOString(),
    where,
    name: scrub(name).slice(0, 80),
    message: scrub(e.message || '(no message)').slice(0, 500),
    stack: rawStack ? scrub(rawStack).split('\n').slice(0, 30).join('\n') : undefined,
    route: routeShape(),
    extra: cleanExtra,
  };
  recent.unshift(report);
  recent.length = Math.min(recent.length, KEEP);
  console.error(`[Bergeron Maps] ${where} ${report.code}:`, error);

  const key = `${where}|${report.name}|${report.message}`;
  if (config.dsn && !seen.has(key) && sent < MAX_SENT_PER_PAGE) {
    seen.add(key);
    sent++;
    try {
      const target = sentryTarget(config.dsn);
      if (target) (config.send ?? beacon)(target, envelope(id, report));
    } catch {
      /* reporting must never cause a second problem */
    }
  }
  return report;
}

function safeString(v: unknown): string {
  try {
    return typeof v === 'object' ? JSON.stringify(v)?.slice(0, 300) ?? String(v) : String(v);
  } catch {
    return String(v);
  }
}

/** Sentry's envelope format: a header line, an item header line, then the event. */
export function envelope(id: string, r: ErrorReport): string {
  const event = {
    event_id: id,
    timestamp: Date.parse(r.at) / 1000,
    platform: 'javascript',
    level: 'error',
    logger: r.where,
    release: config.release || undefined,
    environment: config.environment || 'production',
    // Never work out who sent it from the connection.
    sdk: { name: 'bergeron-maps.reporter', version: '1.0.0', settings: { infer_ip: 'never' } },
    tags: { where: r.where, route: r.route, code: r.code },
    request: { url: typeof window === 'undefined' ? undefined : `${window.location.origin}${window.location.pathname}${r.route}` },
    extra: r.extra,
    exception: {
      values: [{ type: r.name, value: r.message, stacktrace: r.stack ? { frames: frames(r.stack) } : undefined }],
    },
  };
  return `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
}

/** Stack lines (Chrome "at f (url:1:2)", Firefox and Safari "f@url:1:2") as frames, oldest call first. */
export function frames(stack: string) {
  const out: { function?: string; filename: string; lineno: number; colno: number; in_app: boolean }[] = [];
  for (const line of stack.split('\n')) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line) ?? /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/.exec(line);
    if (!m) continue;
    out.push({ function: m[1] || undefined, filename: m[2], lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules/.test(m[2]) });
  }
  return out.reverse();
}

function beacon(url: string, body: string) {
  // text/plain keeps it a "simple" request (no CORS preflight); keepalive lets it finish if the page is closing.
  void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {});
}

/** Text for "Copy error details": what support needs, nothing personal. */
export function errorDetails(r: ErrorReport): string {
  return [`Code: ${r.code}`, `When: ${r.at}`, `Where: ${r.where} on ${r.route}`, `Problem: ${r.name}: ${r.message}`, config.release ? `Version: ${config.release}` : '', navigator.userAgent ? `Browser: ${navigator.userAgent}` : '']
    .filter(Boolean)
    .join('\n');
}

/* ---------- Problems nobody caught ---------- */

/** After a new version goes live, an open tab asks for code files that no longer exist. */
export function isStaleCodeError(e: unknown): boolean {
  const m = (e as { message?: string } | null)?.message ?? String(e);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk \S+ failed/i.test(m);
}

const RELOAD_KEY = 'bm.reloadedForUpdate';
/**
 * Reloads once to pick up the new version. Returns false (and doesn't reload)
 * if it already did in the last minute: the files really are missing then,
 * which is a problem worth reporting rather than looping on.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Catches what no screen handled: thrown errors and failed promises nobody waited for. */
export function installGlobalHandlers() {
  window.addEventListener('error', (ev) => {
    // A <script> or image that failed to load fires here too, without an error object.
    if (!ev.error && !ev.message) return;
    reportError(ev.error ?? new Error(ev.message), 'unhandled', { file: ev.filename ? cleanUrl(ev.filename) : undefined });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    if (isStaleCodeError(ev.reason)) return;
    reportError(ev.reason, 'unhandled-promise');
  });
  // Vite's lazy pages: a file from the previous version is gone. Reload into the new one,
  // except in the editor, where the page handles it (a reload could drop unsaved changes).
  window.addEventListener('vite:preloadError', (ev) => {
    if (routeShape().startsWith('#/edit')) return;
    if (reloadForNewVersion()) ev.preventDefault();
    else reportError((ev as Event & { payload?: unknown }).payload ?? new Error('Code files missing after reload'), 'stale-code');
  });
}

/* ---------- Supabase ---------- */

/**
 * Database answers that mean the app or the database is broken, rather than
 * the person doing something they aren't allowed to. Missing tables, columns
 * or functions mean a SQL step wasn't run before the app that needs it went live.
 */
const BROKEN_CODES = /^(42P01|42703|42883|42804|PGRST20[0-9]|PGRST1(0[0-9]|2[0-9])|XX\d{3}|53\d{3}|57\d{3}|58\d{3}|08\d{3})$/;

/** Looks at one Supabase answer and reports it if it shows a real problem. */
export async function noteSupabaseResponse(kind: 'database' | 'sign-in', url: string, method: string, res: Response): Promise<void> {
  if (res.ok) return;
  let code = '';
  let message = '';
  try {
    const body = (await res.clone().json()) as { code?: string; message?: string; msg?: string; error_code?: string; error?: string };
    code = String(body.code ?? body.error_code ?? '');
    message = String(body.message ?? body.msg ?? body.error ?? '');
  } catch {
    /* not JSON */
  }
  const status = res.status;
  // 429 on sign-in: the email limit was hit, so people stop getting sign-in links.
  const broken = status >= 500 || status === 429 || BROKEN_CODES.test(code);
  if (!broken) return;
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* keep */
  }
  const err = new Error(message || `HTTP ${status}`);
  err.name = kind === 'sign-in' ? 'SignInServiceError' : 'DatabaseError';
  reportError(err, kind, { status, code: code || null, method: method.toUpperCase(), path });
}

/** A fetch that reports broken Supabase answers and otherwise changes nothing. */
export function observedFetch(kind: 'database' | 'sign-in', inner: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init) => {
    const res = await inner(input, init);
    if (!res.ok) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      void noteSupabaseResponse(kind, url, init?.method ?? (input instanceof Request ? input.method : 'GET'), res).catch(() => {});
    }
    return res;
  };
}
