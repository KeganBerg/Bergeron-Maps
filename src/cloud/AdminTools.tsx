import { useState } from 'react';
import type { AdminCompany } from '../model/adminAccounts';
import { friendly, supabase } from './client';
import { RestoreFromBackup } from './RestoreFromBackup';

/** What every admin tool may report back to the page: progress, a result and an error. */
export interface ToolStatus {
  working: boolean;
  setWorking: (step: string | null) => void;
  setNote: (note: string | null) => void;
  setError: (error: string | null) => void;
}

/** New company from a signed contract. `onCreated` gets the new company's id. */
export function SetupCompanyPanel({ onCreated, setNote, setError }: Pick<ToolStatus, 'setNote' | 'setError'> & { onCreated: (id: string | null) => void }) {
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [address, setAddress] = useState('');
  const [lead, setLead] = useState('');
  const [limit, setLimit] = useState('1');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    const max = limit.trim() ? Number(limit) : null;
    const r = await supabase!.rpc('setup_company', {
      p_name: company, p_site_name: site, p_site_address: address.trim() || null, p_lead_email: lead.trim() || null, p_max_sites: max,
    });
    setBusy(false);
    if (r.error) return setError(friendly(r.error));
    setNote(lead.trim()
      ? `${company.trim()} is set up. ${lead.trim().toLowerCase()} is its account lead and gets every site as soon as they sign in at the app link.`
      : `${company.trim()} is set up with you as its owner. Open it to add its managers.`);
    onCreated(typeof r.data === 'string' ? r.data : null);
  };

  return (
    <section className="panel-card" data-testid="setup-company">
      <h3>Set up a company</h3>
      <p className="muted small">From the signed contract: the client’s account lead, how many sites they pay for, and the first site’s address.</p>
      <form className="setup-company" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="stack">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" required maxLength={120} data-testid="setup-name" /></label>
        <label className="stack">Account lead email<input type="email" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="lead@company.com" data-testid="setup-lead" /></label>
        <label className="stack">Sites in contract<input type="number" min={1} max={10000} value={limit} onChange={(e) => setLimit(e.target.value)} data-testid="setup-limit" /></label>
        <label className="stack">First site<input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site Name" required maxLength={120} data-testid="setup-site" /></label>
        <label className="stack">Site address<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" maxLength={300} /></label>
        <button className="btn primary" disabled={busy || !company.trim() || !site.trim()}>Create company</button>
      </form>
    </section>
  );
}

/** Download every company to one file, or bring companies back from one (cloud/backup.ts). */
export function BackupsPanel({ data, onDownloadAll, onRestored, ...status }: ToolStatus & {
  data: AdminCompany[]; onDownloadAll: () => void; onRestored: () => Promise<void>;
}) {
  return (
    <section className="panel-card" data-testid="backups">
      <h3>Backups</h3>
      <p className="muted small">
        A backup file holds a company’s sites, links and join codes, who has access, and every map with what employees see and its saved versions.
        Download one before deleting a company, so it can be brought back if the client returns. A backup also brings back a map deleted forever or a site deleted by mistake.
      </p>
      <div className="site-actions backup-actions">
        <button className="btn small" disabled={status.working || !data.length} onClick={onDownloadAll} data-testid="backup-all">
          Download backup of all accounts
        </button>
        <RestoreFromBackup live={new Set(data.map((c) => c.id))} working={status.working} setWorking={status.setWorking} setError={status.setError}
          setNote={status.setNote} onRestored={onRestored} />
      </div>
    </section>
  );
}
