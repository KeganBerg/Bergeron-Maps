import { useEffect, useState, type ReactNode } from 'react';
import { AppHeader } from '../home/HomePage';
import { needsSetup, setupProblem, setupRows, type SetupSite } from '../model/companySetup';
import { navigate } from '../router';
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_TEL } from '../support';
import { friendly, supabase } from './client';

interface Site { id: string; name: string; address: string | null }

/**
 * Right after buying online: the account lead names the company and each location they paid for,
 * with its address, then goes straight to building a map. Rules are in model/companySetup.ts.
 */
export function CompanySetupPage({ companyId, nav, account, onDone }: {
  companyId: string; nav?: ReactNode; account?: ReactNode; onDone: () => void;
}) {
  const [company, setCompany] = useState('');
  const [rows, setRows] = useState<SetupSite[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, s] = await Promise.all([
        supabase!.from('companies').select('name, max_sites').eq('id', companyId).maybeSingle(),
        supabase!.from('facilities').select('id, name, address').eq('company_id', companyId).order('created_at'),
      ]);
      if (c.error || s.error) return setError(friendly((c.error ?? s.error)!));
      const co = c.data as { name: string; max_sites: number | null } | null;
      setCompany(co?.name && co.name !== 'Company' ? co.name : '');
      setRows(setupRows((s.data ?? []) as Site[], co?.max_sites ?? null));
    })();
  }, [companyId]);

  const change = (i: number, patch: Partial<SetupSite>) => setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!rows) return;
    const problem = setupProblem(company, rows);
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    const db = supabase!;
    const steps = [
      () => db.from('companies').update({ name: company.trim() }).eq('id', companyId),
      ...rows.filter((r) => r.name.trim()).map((r) => () => {
        const values = { name: r.name.trim(), address: r.address.trim() };
        return r.id ? db.from('facilities').update(values).eq('id', r.id) : db.from('facilities').insert({ company_id: companyId, ...values });
      }),
    ];
    for (const step of steps) {
      const res = await step();
      if (res.error) {
        setBusy(false);
        return setError(/duplicate key/i.test(res.error.message) ? 'Another site already uses one of these names. Try adding the city.' : friendly(res.error));
      }
    }
    setBusy(false);
    onDone();
    navigate('/');
  };

  return (
    <div className="home">
      <AppHeader nav={nav}>{account}</AppHeader>
      <main className="signin"><div className="signin-card company-setup" data-testid="company-setup">
        <h2>Set up your company</h2>
        <p className="muted">Name your company and each location you bought. Addresses are set once, so check them. You can add or rename sites later on Sites &amp; people.</p>
        {!rows && !error && <p className="muted">Loading…</p>}
        {rows && (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label className="stack">Company name
              <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} required autoFocus data-testid="setup-company" />
            </label>
            {rows.map((r, i) => (
              <fieldset key={r.id ?? `new-${i}`} className="setup-site">
                <legend>Location {i + 1}{i > 0 && !r.id ? ' (optional for now)' : ''}</legend>
                <label className="stack">Site name
                  <input value={r.name} onChange={(e) => change(i, { name: e.target.value })} maxLength={120} placeholder="Site Name" data-testid={`setup-name-${i}`} />
                </label>
                <label className="stack">Street address
                  <input value={r.address} onChange={(e) => change(i, { address: e.target.value })} maxLength={300} placeholder="Street, city, state" data-testid={`setup-address-${i}`} />
                </label>
              </fieldset>
            ))}
            {error && <p className="error-text" role="alert">{error}</p>}
            <button className="btn primary" disabled={busy} data-testid="setup-save">{busy ? 'Saving…' : 'Save and build my first map'}</button>
            <p className="muted small">Need a hand? Call <a href={`tel:${SUPPORT_TEL}`}>{SUPPORT_PHONE}</a> or email <a href={`mailto:${SUPPORT_EMAIL}?subject=Help%20setting%20up%20Bergeron%20Maps`}>{SUPPORT_EMAIL}</a> and we&apos;ll walk you through it.</p>
          </form>
        )}
        {error && !rows && <p className="error-text" role="alert">{error}</p>}
      </div></main>
    </div>
  );
}

/** Whether this company still needs the setup screen; null while checking. */
export function useNeedsSetup(companyId: string | null, enabled: boolean, tick: number): boolean | null {
  const [due, setDue] = useState<boolean | null>(null);
  useEffect(() => {
    if (!companyId || !enabled) return setDue(false);
    setDue(null);
    void supabase!.from('facilities').select('name, address').eq('company_id', companyId)
      .then((r) => setDue(!r.error && needsSetup((r.data ?? []) as { name: string; address: string | null }[])));
  }, [companyId, enabled, tick]);
  return due;
}
