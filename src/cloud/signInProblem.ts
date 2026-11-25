import { isNetworkMessage, friendly } from '../errors/friendly';

/**
 * Why signing in didn't work, as a reason rather than a sentence, so the
 * sign-in page can say it in the reader's language (src/i18n, signInProblem).
 * Supabase's own error text is English; it only reaches the screen, through
 * `other`, when it matches none of the reasons below.
 */
export type SignInProblem =
  | { kind: 'link' }
  | { kind: 'badCode' }
  | { kind: 'unavailable' }
  | { kind: 'tooMany' }
  | { kind: 'wait'; seconds: number }
  | { kind: 'sendFailed' }
  | { kind: 'noAccount' }
  | { kind: 'offline' }
  | { kind: 'enterEmail' }
  | { kind: 'enterCode' }
  | { kind: 'other'; message: string };

const offlineOr = (m: string, problem: SignInProblem): SignInProblem => (isNetworkMessage(m) || /fetch|network/i.test(m) ? { kind: 'offline' } : problem);

/** A sign-in link or typed code that Supabase turned down. */
export const verifyProblem = (e: { message?: string }, wrong: 'link' | 'badCode'): SignInProblem => offlineOr(e.message ?? '', { kind: wrong });

/** The errors Supabase gives when it can't send the sign-in email. */
export function sendProblem(e: { message?: string } | null): SignInProblem {
  const m = e?.message ?? '';
  if (/rate limit/i.test(m)) return { kind: 'tooMany' };
  const wait = m.match(/only request this after (\d+) seconds/i);
  if (wait) return { kind: 'wait', seconds: Number(wait[1]) };
  if (isNetworkMessage(m)) return { kind: 'offline' };
  if (/error sending|smtp|mail/i.test(m)) return { kind: 'sendFailed' };
  if (/signups not allowed/i.test(m)) return { kind: 'noAccount' };
  return { kind: 'other', message: friendly(e) };
}
