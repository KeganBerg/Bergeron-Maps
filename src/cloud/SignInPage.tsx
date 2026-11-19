import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { setLocalMode, supabase, clearSignInProblem, takeSignInProblem, pendingEmailLink, finishEmailLink, signInWithCode, sendProblem } from './client';

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
  const [error, setError] = useState<string | null>(takeSignInProblem);
  // The button that was pressed is gone once the email is sent: move focus to what replaced it, so a
  // screen reader says the email went out instead of going quiet.
  const sentCard = useRef<HTMLDivElement>(null);
  useEffect(() => { if (sent) sentCard.current?.focus(); }, [sent]);
  const [link, setLink] = useState(pendingEmailLink);
  const [code, setCode] = useState('');

  const send = async () => {
    if (!supabase) return;
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setError('Enter your work email address.');
    setBusy(true);
    setError(null);
    clearSignInProblem();
    try {
      localStorage.setItem(RETURN_KEY, window.location.hash.slice(1) || '/');
    } catch {
      /* the link still signs you in; you just land on the home page */
    }
    const base = `${window.location.origin}${window.location.pathname}`;
    const { error: e } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: base } });
    setBusy(false);
    if (e) setError(sendProblem(e));
    else {
      setCode('');
      setSent(true);
    }
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    const problem = await finishEmailLink();
    setBusy(false);
    if (problem) {
      setError(problem);
      setLink(pendingEmailLink());
    }
  };

  const submitCode = async () => {
    const digits = code.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(digits)) return setError('Enter the code from the email. It’s 6 digits.');
    setBusy(true);
    setError(null);
    const problem = await signInWithCode(email.trim().toLowerCase(), digits);
    setBusy(false);
    if (problem) setError(problem);
  };

  if (link) {
    return (
      <div className="home">
        <AppHeader />
        <main className="signin">
          <div className="signin-card" data-testid="signin-finish">
            <h2>Finish signing in</h2>
            <p className="muted">You opened your sign-in link. Press the button to sign in to Bergeron Maps on this device.</p>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button className="btn primary big" autoFocus disabled={busy} onClick={() => void finish()} data-testid="signin-finish-btn">
              {busy ? 'Signing in…' : 'Finish signing in'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="home">
      <AppHeader />
      <main className="signin">
        {sent ? (
          <div className="signin-card" data-testid="signin-sent" ref={sentCard} tabIndex={-1} role="region" aria-label="Check your email" aria-describedby="signin-sent-text">
            <h2>Check your email</h2>
            <p id="signin-sent-text">
              We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. Open it on this device, or type the code from the email here. The link
              and code work once and expire in an hour. If it isn’t in your inbox within a few minutes, check spam or junk.
            </p>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void submitCode(); }}>
              <label className="stack">
                Code from the email
                <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)}
                  placeholder="123456" data-testid="signin-code"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? 'signin-code-error' : undefined} />
              </label>
              {error && <p className="error-text" role="alert" id="signin-code-error">{error}</p>}
              <button className="btn primary" disabled={busy || !code.trim()} data-testid="signin-code-send">{busy ? 'Signing in…' : 'Sign in with code'}</button>
            </form>
            <button className="btn" onClick={() => { setSent(false); setError(null); }}>Use a different email</button>
          </div>
        ) : (
          <form className="signin-card" noValidate onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <h2>{siteLink ? 'Sign in to open your site' : 'Sign in'}</h2>
            <p className="muted">Use the email your manager or admin added. We’ll email you a sign-in link, so there’s no password.</p>
            <label className="stack">
              Work email
              <input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com" data-testid="signin-email"
                aria-invalid={error ? true : undefined} aria-describedby={error ? 'signin-error' : undefined} />
            </label>
            {error && <p className="error-text" role="alert" id="signin-error">{error}</p>}
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
