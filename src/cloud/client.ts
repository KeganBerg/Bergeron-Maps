import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const LINK_PROBLEM = 'That sign-in link didn’t work. It may have expired or already been used (some work email systems open links to scan them). Enter your email for a new link, and open it in this browser.';
const AUTH_ERROR_KEYS = ['error', 'error_code', 'error_description'];

/**
 * A sign-in link that failed (expired, already used) comes back with the
 * error in the address. Read it once, before anything else looks at the
 * address, and remove it so the hash router doesn't mistake it for a site link.
 */
function takeLinkErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const u = new URL(window.location.href);
  const hash = new URLSearchParams(u.hash.slice(1));
  const inQuery = AUTH_ERROR_KEYS.some((k) => u.searchParams.has(k));
  const inHash = AUTH_ERROR_KEYS.some((k) => hash.has(k));
  if (!inQuery && !inHash) return null;
  for (const k of AUTH_ERROR_KEYS) u.searchParams.delete(k);
  if (inHash) u.hash = '';
  window.history.replaceState(null, '', u.toString());
  return LINK_PROBLEM;
}
let linkProblem = takeLinkErrorFromUrl();

/**
 * Why the person is back on the sign-in page, if a sign-in link failed. Also
 * covers a link opened in another browser: the code in the address can only
 * be used by the browser that asked for it, so it is still there, unused.
 */
export function takeSignInProblem(): string | null {
  const u = new URL(window.location.href);
  if (u.searchParams.has('code')) {
    u.searchParams.delete('code');
    window.history.replaceState(null, '', u.toString());
    linkProblem = LINK_PROBLEM;
  }
  return linkProblem;
}
/** Once a new link is on its way, the old link's problem no longer applies. */
export const clearSignInProblem = () => {
  linkProblem = null;
};
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Online mode is on when the build has a Supabase URL and public (anon) key.
 * The anon key is safe in the browser: row-level security decides what each
 * signed-in person can read or change. Without them the app runs in browser-only mode.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

/** Lets someone try the editor without an account; maps then stay in this browser. */
const LOCAL_KEY = 'bm.localMode';
export const localModeChosen = () => {
  try {
    return localStorage.getItem(LOCAL_KEY) === '1';
  } catch {
    return false;
  }
};
export const setLocalMode = (on: boolean) => {
  try {
    if (on) localStorage.setItem(LOCAL_KEY, '1');
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* private mode: stays online */
  }
};

/** Postgres/PostgREST errors carry a friendly message from our SQL functions. */
export function friendly(e: unknown, fallback = 'Something went wrong. Check your connection and try again.'): string {
  const m = (e as { message?: string } | null)?.message;
  if (!m) return fallback;
  if (/row-level security|permission denied/i.test(m)) return 'You don’t have permission to do that.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Can’t reach the server. Check your connection and try again.';
  return m;
}
