import { createDb, type Db } from './db';
import { friendly } from '../errors/friendly';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;

const LINK_PROBLEM = 'That sign-in link didn’t work. It may have expired or already been used (some work email systems open links to scan them). Enter your email for a new link, or type the code from the email instead.';
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

/** Sign-in email types Supabase puts in the link (`type=`). */
const EMAIL_LINK_TYPES = ['email', 'magiclink', 'signup', 'invite', 'email_change'] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

/**
 * Our sign-in emails link to the app itself with `?token_hash=…&type=email`
 * (see supabase/email-templates). Nothing is used up until the person presses
 * “Finish signing in”, so a work email scanner that opens the link first
 * doesn't spend it, and it works in any browser (no PKCE code to match).
 * Read it once and take it out of the address.
 */
function takeEmailLinkFromUrl(): { tokenHash: string; type: EmailLinkType; auto: boolean } | null {
  if (typeof window === 'undefined') return null;
  const u = new URL(window.location.href);
  const tokenHash = u.searchParams.get('token_hash');
  const type = u.searchParams.get('type') as EmailLinkType | null;
  if (!tokenHash) return null;
  // auto=1: the "account is open" email right after payment (worker/accounts.js), where the
  // buyer expects to land signed in. If a scanner used the link first, the usual "link didn't
  // work" message offers a new one.
  const auto = u.searchParams.get('auto') === '1';
  for (const k of ['token_hash', 'type', 'auto']) u.searchParams.delete(k);
  window.history.replaceState(null, '', u.toString());
  return { tokenHash, type: type && EMAIL_LINK_TYPES.includes(type) ? type : 'email', auto };
}
let emailLink = takeEmailLinkFromUrl();

/** A sign-in link from our email that is waiting for the person to press Finish signing in. */
export const pendingEmailLink = () => emailLink;

/** Uses the sign-in link from the email. On success the session appears and the app moves on. */
export async function finishEmailLink(): Promise<string | null> {
  if (!supabase || !emailLink) return LINK_PROBLEM;
  const { tokenHash, type } = emailLink;
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (!error) {
    emailLink = null;
    return null;
  }
  if (/fetch|network/i.test(error.message)) return friendly(error);
  emailLink = null;
  return LINK_PROBLEM;
}

/** The code printed in the sign-in email, typed on the “Check your email” screen. */
export async function signInWithCode(email: string, code: string): Promise<string | null> {
  if (!supabase) return 'Sign-in isn’t available here.';
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (!error) return null;
  if (/fetch|network/i.test(error.message)) return friendly(error);
  return 'That code didn’t work. Check it against the newest email (each new email replaces the last code), or send a new one.';
}

/** Messages for the errors Supabase gives when it can't send the sign-in email. */
export function sendProblem(e: { message?: string } | null): string {
  const m = e?.message ?? '';
  if (/rate limit/i.test(m)) return 'Too many sign-in emails were sent. Wait a minute and try again.';
  if (/only request this after (\d+) seconds/i.test(m)) return `A sign-in email was just sent. Wait ${m.match(/after (\d+) seconds/i)![1]} seconds before asking for another.`;
  if (/error sending|smtp|mail/i.test(m)) return 'We couldn’t send the sign-in email just now. Try again in a few minutes, or contact bergeronmaps@gmail.com if it keeps happening.';
  if (/signups not allowed/i.test(m)) return 'This email doesn’t have an account yet. Ask your manager or admin to add it.';
  return friendly(e);
}

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
export const supabase: Db | null =
  url && key
    ? createDb(url, key, { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true })
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
export { friendly } from '../errors/friendly';
