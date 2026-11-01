import { useEffect, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { navigate } from '../router';
import { Icon } from '../ui/icons';
import { friendly, supabase } from './client';
import { siteLink } from './TeamPage';

interface AdminSite { id: string; name: string; slug: string; maps: number; published: number }
interface AdminPerson { email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean; last_sign_in: string | null }
interface AdminCompany { id: string; name: string; created_at: string; sites: AdminSite[]; people: AdminPerson[] }

function access(p: AdminPerson, sites: AdminSite[]): string {
  const role = p.role === 'owner' ? 'Owner' : p.role === 'manager' ? (p.facility_ids === null ? 'Regional manager' : 'Site manager') : 'Employee';
  const where = p.facility_ids === null ? 'all sites' : p.facility_ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'a site').join(', ');
  return `${role} · ${where}`;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

/**
 * Bergeron Maps admins only: every company with its sites and people, and
 * the place to set up a new company. The database refuses this data to
 * anyone else, whatever the browser asks for.
 */
export function AdminPage({ header, onOpen, onCreated, canGoBack }: {
  header: React.ReactNode; onOpen: (companyId: string, to?: string) => void; onCreated: () => void; canGoBack: boolean;
}) {
  const [data, setData] = useState<AdminCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await supabase!.rpc('admin_overview');
    if (r.error) return setError(friendly(r.error));
    setData(r.data as AdminCompany[]);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await supabase!.rpc('create_company', { p_name: company, p_facility_name: site });
    setBusy(false);
    if (r.error) return setError(friendly(r.error));
    setNote(`${company.trim()} is set up. Open it to add its managers.`);
    setCompany('');
    setSite('');
    onCreated();
    await load();
  };

  const q = filter.trim().toLowerCase();
  const shown = (data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.sites.some((s) => s.name.toLowerCase().includes(q))
    || c.people.some((p) => p.email.includes(q)));
  const totals = data && {
    companies: data.length,
    sites: data.reduce((n, c) => n + c.sites.length, 0),
    people: data.reduce((n, c) => n + c.people.length, 0),
    maps: data.reduce((n, c) => n + c.sites.reduce((m, s) => m + s.maps, 0), 0),
  };

  return (
    <div className="home">
      <AppHeader>{header}</AppHeader>
      <main className="home-main team admin">
        {canGoBack && <button className="link back-link" onClick={() => navigate('/')}><Icon name="back" size={14} /> Back to maps</button>}
        <h2>All accounts</h2>
        {totals && (
          <p className="muted admin-totals" data-testid="admin-totals">
            {totals.companies} {totals.companies === 1 ? 'company' : 'companies'} · {totals.sites} sites · {totals.people} people · {totals.maps} maps
          </p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        {note && <p className="ok-text" role="status">{note}</p>}

        <section className="panel-card">
          <h3>Set up a company</h3>
          <form className="add-person" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <label className="stack">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" required maxLength={120} /></label>
            <label className="stack">First site<input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site Name" required maxLength={120} /></label>
            <button className="btn primary" disabled={busy || !company.trim() || !site.trim()}>Create company</button>
          </form>
        </section>

        {data && data.length > 3 && (
          <input className="admin-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a company, site or email" aria-label="Find" />
        )}

        {data === null && !error && <p className="muted">Loading…</p>}
        {data?.length === 0 && <p className="muted">No companies yet. Set one up above.</p>}

        {shown.map((c) => (
          <section className="panel-card" key={c.id} data-testid={`admin-company-${c.name}`}>
            <div className="admin-company-head">
              <h3>{c.name}</h3>
              <span className="site-actions">
                <button className="btn small" onClick={() => onOpen(c.id, '/team')}>Sites &amp; people</button>
                <button className="btn small primary" onClick={() => onOpen(c.id)}>Open maps</button>
              </span>
            </div>
            <p className="muted small">Set up {when(c.created_at)}</p>

            <h4>Sites</h4>
            <ul className="site-list">
              {c.sites.map((s) => (
                <li key={s.id}>
                  <span className="site-name">
                    <strong>{s.name}</strong>
                    <span className="muted small site-url">{siteLink(s.slug)}</span>
                  </span>
                  <span className="muted small">{s.maps} {s.maps === 1 ? 'map' : 'maps'} · {s.published} published</span>
                </li>
              ))}
            </ul>

            <h4>People</h4>
            {c.people.length === 0 ? <p className="muted small">Nobody yet.</p> : (
              <ul className="people">
                {c.people.map((p) => (
                  <li key={p.email}>
                    <span>
                      <strong>{p.email}</strong>
                      <span className="muted small">{access(p, c.sites)}</span>
                    </span>
                    <span className="muted small">{p.pending ? 'Hasn’t signed in yet' : p.last_sign_in ? `Last signed in ${when(p.last_sign_in)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
