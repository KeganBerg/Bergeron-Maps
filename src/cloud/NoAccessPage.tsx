import { useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { friendly, supabase } from './client';
import { AccountMenu } from './AccountMenu';

/** Signed in, but no site yet: join with a site code, or (admins) set up a company. */
export function NoAccessPage({ email, isAdmin, onJoined }: { email: string; isAdmin: boolean; onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(friendly(e));
    else onJoined();
  };

  return (
    <div className="home">
      <AppHeader><AccountMenu email={email} /></AppHeader>
      <main className="signin">
        {isAdmin && (
          <form className="signin-card" onSubmit={(e) => { e.preventDefault(); void run(() => supabase!.rpc('create_company', { p_name: company, p_facility_name: site })); }}>
            <h2>Set up a company</h2>
            <p className="muted">You’re a Bergeron Maps admin. Create the customer’s company and its first site, then add their managers from Team.</p>
            <label className="stack">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Towne Park" required maxLength={120} /></label>
            <label className="stack">First site<input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g. Harbor Hotel" required maxLength={120} /></label>
            <button className="btn primary big" disabled={busy}>Create company</button>
          </form>
        )}
        <form className="signin-card" onSubmit={(e) => { e.preventDefault(); void run(() => supabase!.rpc('join_site', { p_code: code })); }}>
          <h2>{isAdmin ? 'Or join a site' : 'You don’t have access to a site yet'}</h2>
          <p className="muted">
            Signed in as <strong>{email}</strong>. If you’re a manager, ask your admin to add this email to your site. If you’re an employee, enter the
            6-character site code from your manager.
          </p>
          <label className="stack">
            Site code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7} autoCapitalize="characters" autoComplete="off"
              placeholder="e.g. K7M2QX" className="code-input" data-testid="join-code" />
          </label>
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="btn primary big" disabled={busy || code.trim().length < 6}>Join site</button>
        </form>
      </main>
    </div>
  );
}
