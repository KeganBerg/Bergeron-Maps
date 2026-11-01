import { useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { friendly, setLocalMode, supabase } from './client';

const RETURN_KEY = 'bm.returnTo';

/** Where to go after the sign-in link brings the person back (e.g. a site link). */
export function takeReturnRoute(): string | null {
  try {
    const r = localStorage.getItem(RETURN_KEY);
    localStorage.removeItem(RETURN_KEY);
    return r;
  } catch {
    return null;
  }
}

/**
 * Email sign-in with a one-time link: no passwords to forget or share, and
 * no role to choose. What the person can reach is decided by the email an
 * admin or manager added.
 */
export function SignInPage({ siteLink }: { siteLink: boolean }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!supabase) return;
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setError('Enter your work email address.');
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(RETURN_KEY, window.location.hash.slice(1) || '/');
    } catch {
      /* the link still signs you in; you just land on the home page */
    }
    const base = `${window.location.origin}${window.location.pathname}`;
    const { error: e } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: base } });
    setBusy(false);
    if (e) setError(/rate limit/i.test(e.message) ? 'Too many sign-in emails were sent. Wait a minute and try again.' : friendly(e));
    else setSent(true);
  };

  return (
    <div className="home">
      <AppHeader />
      <main className="signin">
        {sent ? (
          <div className="signin-card" data-testid="signin-sent">
            <h2>Check your email</h2>
            <p>
              We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. Open it on this device, in this browser. The link works once and expires
              in an hour.
            </p>
            <button className="btn" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <form className="signin-card" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <h2>{siteLink ? 'Sign in to open your site' : 'Sign in'}</h2>
            <p className="muted">Use the email your manager or admin added. We’ll email you a sign-in link, so there’s no password.</p>
            <label className="stack">
              Work email
              <input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com" data-testid="signin-email" />
            </label>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button className="btn primary big" disabled={busy} data-testid="signin-send">{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            {!siteLink && (
              <button type="button" className="link small" onClick={() => { setLocalMode(true); window.location.reload(); }} data-testid="try-local">
                Try it without an account (maps stay in this browser)
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
