import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
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
