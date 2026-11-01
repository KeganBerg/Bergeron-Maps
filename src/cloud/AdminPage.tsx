import { useEffect, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { friendly, supabase } from './client';
import { siteLink } from './TeamPage';

interface AdminSite { id: string; name: string; slug: string; maps: number; published: number }
interface AdminPerson { email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean; last_sign_in: string | null }
interface AdminCompany { id: string; name: string; created_at: string; sites: AdminSite[]; people: AdminPerson[] }
interface AdminMap {
  id: string; name: string; company_id: string; facility_id: string; updated_at: string; deleted_at: string | null; revision: number;
  published_maps: { revision: number } | null;
}

type Hit =
  | { kind: 'company'; key: string; company: AdminCompany }
  | { kind: 'site'; key: string; company: AdminCompany; site: AdminSite }
  | { kind: 'person'; key: string; company: AdminCompany; person: AdminPerson }
  | { kind: 'map'; key: string; company: AdminCompany; site?: AdminSite; map: AdminMap };

const KIND_LABEL: Record<Hit['kind'], string> = { company: 'Company', site: 'Site', person: 'Person', map: 'Map' };
const MAX_HITS = 50;

/** Everything matching the query, across every company: names, link names, emails and map ids. */
function search(q: string, companies: AdminCompany[], maps: AdminMap[]): Hit[] {
  const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(q);
  const hits: Hit[] = [];
  const byId = new Map(companies.map((c) => [c.id, c]));
  for (const c of companies) {
    if (has(c.name)) hits.push({ kind: 'company', key: `c${c.id}`, company: c });
    for (const site of c.sites) if (has(site.name) || has(site.slug)) hits.push({ kind: 'site', key: `s${site.id}`, company: c, site });
    for (const person of c.people) if (has(person.email)) hits.push({ kind: 'person', key: `p${c.id}${person.email}`, company: c, person });
  }
  for (const map of maps) {
    const company = byId.get(map.company_id);
    if (!company || !(has(map.name) || (q.length >= 6 && map.id.startsWith(q)))) continue;
    hits.push({ kind: 'map', key: `m${map.id}`, company, site: company.sites.find((s) => s.id === map.facility_id), map });
  }
  return hits;
}

function mapState(m: AdminMap): string {
  if (m.deleted_at) return 'In Recently deleted';
  if (!m.published_maps) return 'Draft, not published';
  return m.published_maps.revision === m.revision ? 'Published' : 'Unpublished changes';
}

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
export function AdminPage({ nav, account, onOpen, onCreated }: {
  nav?: React.ReactNode; account: React.ReactNode; onOpen: (companyId: string, to?: string) => void; onCreated: () => void;
}) {
  const [data, setData] = useState<AdminCompany[] | null>(null);
  const [maps, setMaps] = useState<AdminMap[]>([]);
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
    // Admins can read every company's maps (row-level security allows it), so map search needs no extra setup.
    const m = await supabase!.from('maps').select('id, name, company_id, facility_id, updated_at, deleted_at, revision, published_maps(revision)')
      .order('updated_at', { ascending: false }).limit(5000);
    if (!m.error) setMaps(m.data as unknown as AdminMap[]);
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
  const hits = q && data ? search(q, data, maps) : [];
  const hitCompanies = new Set(hits.map((h) => h.company.id));
  const shown = (data ?? []).filter((c) => !q || hitCompanies.has(c.id));
  const go = (h: Hit) => {
    if (h.kind === 'company') return onOpen(h.company.id, '/team');
    if (h.kind === 'site') return onOpen(h.company.id, `/${h.site.slug}`);
    if (h.kind === 'person') return onOpen(h.company.id, `/team?q=${encodeURIComponent(h.person.email)}`);
    return onOpen(h.company.id, h.map.deleted_at ? '/' : `/edit/${h.map.id}`);
  };
  const describeHit = (h: Hit) => {
    if (h.kind === 'company') return `${h.company.sites.length} sites, ${h.company.people.length} people`;
    if (h.kind === 'site') return `${h.company.name} · ${h.site.maps} ${h.site.maps === 1 ? 'map' : 'maps'}`;
    if (h.kind === 'person') return `${h.company.name} · ${access(h.person, h.company.sites)}${h.person.pending ? ' · hasn’t signed in yet' : ''}`;
    return `${h.company.name} · ${h.site?.name ?? 'a site'} · ${mapState(h.map)} · edited ${when(h.map.updated_at)}`;
  };
  const totals = data && {
    companies: data.length,
    sites: data.reduce((n, c) => n + c.sites.length, 0),
    people: data.reduce((n, c) => n + c.people.length, 0),
    maps: data.reduce((n, c) => n + c.sites.reduce((m, s) => m + s.maps, 0), 0),
  };

  return (
    <div className="home">
      <AppHeader nav={nav}>{account}</AppHeader>
      <main className="home-main team admin">
        <div className="page-head"><h2>All accounts</h2></div>
        {totals && (
          <dl className="admin-stats" data-testid="admin-totals">
            {([['Companies', totals.companies], ['Sites', totals.sites], ['People', totals.people], ['Maps', totals.maps]] as const).map(([label, n]) => (
              <div key={label}><dt>{label}</dt><dd>{n}</dd></div>
            ))}
          </dl>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        {note && <p className="ok-text" role="status">{note}</p>}

        <div className="admin-search">
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus
            placeholder="Search companies, sites, people (email) and maps" aria-label="Search all accounts" data-testid="admin-search" />
          {q && data && (
            <div className="search-results" role="region" aria-label="Search results" data-testid="admin-results">
              {hits.length === 0 ? <p className="muted small">Nothing matches “{filter.trim()}”.</p> : (
                <ul>
                  {hits.slice(0, MAX_HITS).map((h) => (
                    <li key={h.key}>
                      <button onClick={() => go(h)}>
                        <span className={`hit-kind ${h.kind}`}>{KIND_LABEL[h.kind]}</span>
                        <span className="hit-text">
                          <strong>{h.kind === 'company' ? h.company.name : h.kind === 'site' ? h.site.name : h.kind === 'person' ? h.person.email : h.map.name}</strong>
                          <span className="muted small">{describeHit(h)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {hits.length > MAX_HITS && <p className="muted small">Showing the first {MAX_HITS} of {hits.length}. Add more of the name or email to narrow it down.</p>}
            </div>
          )}
        </div>

        {!q && <section className="panel-card">
          <h3>Set up a company</h3>
          <form className="add-person" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <label className="stack">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" required maxLength={120} /></label>
            <label className="stack">First site<input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site Name" required maxLength={120} /></label>
            <button className="btn primary" disabled={busy || !company.trim() || !site.trim()}>Create company</button>
          </form>
        </section>}


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
