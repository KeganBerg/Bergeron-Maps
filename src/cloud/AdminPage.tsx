import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { backupCompany, backupCounts, backupFileName, parseBackup, restoreCompany, serializeBackup,
  BACKUP_EXTENSION, type BackupFile, type RestoreResult } from './backup';
import { friendly, supabase } from './client';
import { siteLink } from './TeamPage';

interface AdminSite {
  id: string; name: string; slug: string; address: string | null; maps: number; trashed?: number; published: number; public?: number;
}
interface AdminPerson {
  user_id?: string | null; email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean; last_sign_in: string | null;
}
interface AdminRequest { id: string; email: string; facility_id: string; note: string | null; created_at: string }
interface AdminCompany {
  id: string; name: string; created_at: string; max_sites?: number | null; sites: AdminSite[]; people: AdminPerson[]; requests?: AdminRequest[];
}
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
  const role = p.role === 'owner' ? 'Account lead' : p.role === 'manager' ? (p.facility_ids === null ? 'Regional manager' : 'Site manager') : 'Employee';
  const where = p.facility_ids === null ? 'all sites' : p.facility_ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'a site').join(', ');
  return `${role} · ${where}`;
}

/** Saves text as a file in the browser's downloads. */
function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

/**
 * Bergeron Maps admins only: every company with its sites and people, and
 * the place to set up a new company. The database refuses this data to
 * anyone else, whatever the browser asks for.
 */
export function AdminPage({ nav, account, email, onOpen, onCreated }: {
  nav?: React.ReactNode; account: React.ReactNode; email: string; onOpen: (companyId: string, to?: string) => void; onCreated: () => void;
}) {
  const [data, setData] = useState<AdminCompany[] | null>(null);
  const [maps, setMaps] = useState<AdminMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [address, setAddress] = useState('');
  const [lead, setLead] = useState('');
  const [limit, setLimit] = useState('1');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ kind: 'limit' | 'address'; id: string; value: string } | null>(null);
  const [adding, setAdding] = useState<{ company: string; name: string; address: string } | null>(null);
  const [deletingSite, setDeletingSite] = useState<{ company: AdminCompany; site: AdminSite } | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<AdminCompany | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [removing, setRemoving] = useState<{ company: AdminCompany; person: AdminPerson } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState<{ file: BackupFile; fileName: string; picked: Set<string> } | null>(null);
  const [restored, setRestored] = useState<{ results: RestoreResult[]; failed: { name: string; error: string }[] } | null>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  /** Downloads a backup of the given companies (one file). */
  const download = async (companies: AdminCompany[]) => {
    if (working || !companies.length) return;
    setError(null);
    setNote(null);
    try {
      const out = [];
      for (const c of companies) out.push(await backupCompany(supabase!, c, setWorking));
      saveFile(backupFileName(out), serializeBackup(out, email));
      setBackedUp((b) => new Set([...b, ...companies.map((c) => c.id)]));
      setNote(companies.length === 1
        ? `Backup of ${companies[0].name} downloaded. Keep the file somewhere safe; Restore from backup brings it back.`
        : `Backup of all ${companies.length} companies downloaded. Keep the file somewhere safe; Restore from backup brings any of them back.`);
    } catch (e) {
      setError(`The backup couldn’t be made: ${friendly(e)}`);
    } finally {
      setWorking(null);
    }
  };

  const pickBackup = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setNote(null);
    try {
      const file = parseBackup(await f.text());
      if (!file.companies.length) return setError('That backup has no companies in it.');
      const live = new Set((data ?? []).map((c) => c.id));
      setRestoring({ file, fileName: f.name, picked: new Set(file.companies.filter((c) => !live.has(c.id)).map((c) => c.id)) });
    } catch (e) {
      setError(friendly(e));
    }
  };

  const runRestore = async () => {
    if (!restoring) return;
    const chosen = restoring.file.companies.filter((c) => restoring.picked.has(c.id));
    setRestoring(null);
    setError(null);
    setNote(null);
    const results: RestoreResult[] = [];
    const failed: { name: string; error: string }[] = [];
    for (const c of chosen) {
      try {
        results.push(await restoreCompany(supabase!, c, setWorking));
      } catch (e) {
        failed.push({ name: c.name, error: friendly(e) });
      }
    }
    setWorking(null);
    setRestored({ results, failed });
    onCreated();
    await load();
  };

  /** Runs one change, shows its result, and reloads the overview. */
  const act = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setError(null);
    setNote(null);
    const r = await fn();
    if (r.error) return setError(friendly(r.error));
    setNote(ok);
    onCreated();
    await load();
  };

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
    const max = limit.trim() ? Number(limit) : null;
    const r = await supabase!.rpc('setup_company', {
      p_name: company, p_site_name: site, p_site_address: address.trim() || null, p_lead_email: lead.trim() || null, p_max_sites: max,
    });
    setBusy(false);
    if (r.error) return setError(friendly(r.error));
    setNote(lead.trim()
      ? `${company.trim()} is set up. ${lead.trim().toLowerCase()} is its account lead and gets every site as soon as they sign in at the app link.`
      : `${company.trim()} is set up with you as its owner. Open it to add its managers.`);
    setCompany('');
    setSite('');
    setAddress('');
    setLead('');
    setLimit('1');
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
        {working && <p className="muted small" role="status" data-testid="backup-working">{working}…</p>}

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
          <p className="muted small">From the signed contract: the client’s account lead, how many sites they pay for, and the first site’s address.</p>
          <form className="setup-company" onSubmit={(e) => { e.preventDefault(); void create(); }}>
            <label className="stack">Company name<input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" required maxLength={120} data-testid="setup-name" /></label>
            <label className="stack">Account lead email<input type="email" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="lead@company.com" data-testid="setup-lead" /></label>
            <label className="stack">Sites in contract<input type="number" min={1} max={10000} value={limit} onChange={(e) => setLimit(e.target.value)} data-testid="setup-limit" /></label>
            <label className="stack">First site<input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Site Name" required maxLength={120} data-testid="setup-site" /></label>
            <label className="stack setup-wide">Site address<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" maxLength={300} /></label>
            <button className="btn primary" disabled={busy || !company.trim() || !site.trim()}>Create company</button>
          </form>
        </section>}

        {!q && data && <section className="panel-card" data-testid="backups">
          <h3>Backups</h3>
          <p className="muted small">
            A backup file holds a company’s sites, links and join codes, who has access, and every map with what employees see and its saved versions.
            Download one before deleting a company, so it can be brought back if the client returns.
          </p>
          <div className="site-actions backup-actions">
            <button className="btn small" disabled={!!working || !data.length} onClick={() => void download(data)} data-testid="backup-all">
              Download backup of all accounts
            </button>
            <button className="btn small" disabled={!!working} onClick={() => restoreInput.current?.click()} data-testid="restore-backup">
              Restore from backup…
            </button>
            <input ref={restoreInput} type="file" hidden accept={`${BACKUP_EXTENSION},.json,application/json`} data-testid="restore-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pickBackup(f); }} />
          </div>
        </section>}


        {data === null && !error && <p className="muted">Loading…</p>}
        {data?.length === 0 && <p className="muted">No companies yet. Set one up above.</p>}

        {shown.map((c) => (
          <section className="panel-card" key={c.id} data-testid={`admin-company-${c.name}`}>
            <div className="admin-company-head">
              <h3>{c.name}</h3>
              <span className="site-actions">
                <button className="btn small" disabled={!!working} onClick={() => void download([c])} data-testid={`backup-${c.name}`}>Download backup</button>
                <button className="btn small" onClick={() => onOpen(c.id, '/team')}>Sites &amp; people</button>
                <button className="btn small primary" onClick={() => onOpen(c.id)}>Open maps</button>
              </span>
            </div>
            <p className="muted small admin-contract">
              Set up {when(c.created_at)} ·{' '}
              {editing?.kind === 'limit' && editing.id === c.id ? (
                <form className="link-edit" onSubmit={(e) => { e.preventDefault(); setEditing(null);
                  void act(() => supabase!.rpc('set_site_limit', { p_company: c.id, p_max_sites: editing.value.trim() ? Number(editing.value) : null }), `Site limit for ${c.name} saved.`); }}>
                  <input type="number" min={1} autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    aria-label="Sites in contract" placeholder="No limit" data-testid="limit-input" />
                  <button className="btn small primary">Save</button>
                  <button type="button" className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  {c.max_sites == null ? `${c.sites.length} ${c.sites.length === 1 ? 'site' : 'sites'}, no site limit set` : `${c.sites.length} of ${c.max_sites} contracted sites`}{' '}
                  <button className="link" onClick={() => setEditing({ kind: 'limit', id: c.id, value: c.max_sites?.toString() ?? '' })} data-testid={`edit-limit-${c.name}`}>Change</button>
                </>
              )}
            </p>

            {!!c.requests?.length && (
              <>
                <h4>Manager requests</h4>
                <ul className="people">
                  {c.requests.map((q) => (
                    <li key={q.id}>
                      <span>
                        <strong>{q.email}</strong>
                        <span className="muted small">{c.sites.find((x) => x.id === q.facility_id)?.name ?? 'A site'}{q.note ? ` · “${q.note}”` : ''}</span>
                      </span>
                      <span className="site-actions">
                        <button className="btn small primary" onClick={() => void act(() => supabase!.rpc('decide_manager_request', { p_request: q.id, p_approve: true }),
                          `${q.email} is now a site manager.`)}>Approve</button>
                        <button className="btn small" onClick={() => void act(() => supabase!.rpc('decide_manager_request', { p_request: q.id, p_approve: false }),
                          `Request from ${q.email} denied.`)}>Deny</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h4>Sites</h4>
            <ul className="site-list">
              {c.sites.map((s) => (
                <li key={s.id} data-testid={`admin-site-${s.name}`}>
                  <span className="site-name">
                    <strong>{s.name}</strong>
                    {editing?.kind === 'address' && editing.id === s.id ? (
                      <form className="link-edit" onSubmit={(e) => { e.preventDefault(); setEditing(null);
                        void act(() => supabase!.rpc('set_site_address', { p_facility: s.id, p_address: editing.value }), `Address for ${s.name} saved.`); }}>
                        <input autoFocus value={editing.value} maxLength={300} onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          aria-label="Site address" placeholder="Street, city, state" />
                        <button className="btn small primary">Save</button>
                        <button type="button" className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                      </form>
                    ) : (
                      <span className="muted small">
                        {s.address ?? 'No address yet'}{' '}
                        <button className="link" onClick={() => setEditing({ kind: 'address', id: s.id, value: s.address ?? '' })}>{s.address ? 'Change' : 'Add address'}</button>
                      </span>
                    )}
                    <span className="muted small site-url">{siteLink(s.slug)}</span>
                  </span>
                  <span className="site-actions">
                    <span className="muted small">{s.maps} {s.maps === 1 ? 'map' : 'maps'} · {s.published} published{s.public ? ` · ${s.public} public` : ''}</span>
                    <button className="btn small danger-text" onClick={() => setDeletingSite({ company: c, site: s })} data-testid={`delete-site-${s.name}`}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
            {adding?.company === c.id ? (
              <form className="inline-form admin-add-site" onSubmit={(e) => { e.preventDefault(); const a = adding; setAdding(null);
                void act(() => supabase!.rpc('add_contract_site', { p_company: c.id, p_name: a.name, p_address: a.address.trim() || null }), `${a.name.trim()} added to ${c.name}.`); }}>
                <input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Site Name" maxLength={120} aria-label="Site name" />
                <input value={adding.address} onChange={(e) => setAdding({ ...adding, address: e.target.value })} placeholder="Street, city, state" maxLength={300} aria-label="Site address" />
                <button className="btn small primary" disabled={!adding.name.trim()}>Add site</button>
                <button type="button" className="btn small" onClick={() => setAdding(null)}>Cancel</button>
              </form>
            ) : (
              <button className="btn small" onClick={() => setAdding({ company: c.id, name: '', address: '' })}
                disabled={c.max_sites != null && c.sites.length >= c.max_sites}
                title={c.max_sites != null && c.sites.length >= c.max_sites ? 'Every contracted site is set up. Raise the site limit first.' : undefined}>
                Add contracted site
              </button>
            )}

            <h4>People</h4>
            {c.people.length === 0 ? <p className="muted small">Nobody yet.</p> : (
              <ul className="people">
                {c.people.map((p) => (
                  <li key={p.email}>
                    <span>
                      <strong>{p.email}</strong>
                      <span className="muted small">{access(p, c.sites)}</span>
                    </span>
                    <span className="site-actions">
                      <span className="muted small">{p.pending ? 'Hasn’t signed in yet' : p.last_sign_in ? `Last signed in ${when(p.last_sign_in)}` : ''}</span>
                      {p.email.toLowerCase() !== email.toLowerCase() && (
                        <button className="btn small danger-text" onClick={() => setRemoving({ company: c, person: p })} data-testid={`remove-${c.name}-${p.email}`}>Remove</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="admin-danger">
              <button className="btn small danger-text" onClick={() => { setConfirmName(''); setDeletingCompany(c); }} data-testid={`delete-company-${c.name}`}>
                Delete company
              </button>
            </div>
          </section>
        ))}
      </main>

      {deletingSite && (() => {
        const { company: c, site: s } = deletingSite;
        const held = s.maps + (s.trashed ?? 0);
        return held > 0 ? (
          <Dialog title={`${s.name} still has maps`} onClose={() => setDeletingSite(null)}
            footer={<>
              <button className="btn" onClick={() => setDeletingSite(null)}>Close</button>
              <button className="btn primary" onClick={() => { setDeletingSite(null); onOpen(c.id, `/${s.slug}`); }}>Open its maps</button>
            </>}>
            <p>
              A site can’t be deleted while it holds maps, because deleting it would erase them and their history for good. It has {s.maps}{' '}
              {s.maps === 1 ? 'map' : 'maps'}{s.trashed ? ` and ${s.trashed} in Recently deleted` : ''}.
            </p>
            <p>Open its maps, then move each one to another site or delete it (and empty it from Recently deleted). Then delete the site.</p>
          </Dialog>
        ) : (
          <ConfirmDialog title={`Delete ${s.name}?`} confirmLabel="Delete site" danger onCancel={() => setDeletingSite(null)}
            onConfirm={() => { setDeletingSite(null); void act(() => supabase!.rpc('admin_delete_site', { p_facility: s.id }), `${s.name} deleted.`); }}
            message={<p>Its site link and join code stop working, and it’s taken out of everyone’s access. People who only had this site lose access to {c.name}.</p>} />
        );
      })()}

      {deletingCompany && (
        <Dialog title={`Delete ${deletingCompany.name}?`} onClose={() => setDeletingCompany(null)}
          footer={<>
            <button className="btn" onClick={() => setDeletingCompany(null)}>Cancel</button>
            <button className="btn danger" disabled={confirmName.trim() !== deletingCompany.name} data-testid="delete-company-confirm"
              onClick={() => { const c = deletingCompany; setDeletingCompany(null);
                void act(() => supabase!.rpc('admin_delete_company', { p_company: c.id, p_confirm_name: confirmName }), `${c.name} deleted.`); }}>
              Delete for good
            </button>
          </>}>
          <p>
            This erases {deletingCompany.sites.length} {deletingCompany.sites.length === 1 ? 'site' : 'sites'},{' '}
            {(() => { const n = deletingCompany.sites.reduce((t, s) => t + s.maps + (s.trashed ?? 0), 0); return `${n} ${n === 1 ? 'map' : 'maps'}`; })()} with all their versions, every site link and join code, and
            the access of {deletingCompany.people.length} {deletingCompany.people.length === 1 ? 'person' : 'people'}, who are signed out right away. It
            can’t be undone except from a backup file.
          </p>
          <p className="backup-before-delete">
            {backedUp.has(deletingCompany.id)
              ? <span className="ok-inline" data-testid="delete-company-backed-up">Backup downloaded. Restore from backup can bring {deletingCompany.name} back.</span>
              : <span className="muted small">No backup of {deletingCompany.name} downloaded yet.</span>}{' '}
            <button className="btn small" disabled={!!working} onClick={() => void download([deletingCompany])} data-testid="delete-company-backup">
              {working ? 'Preparing…' : backedUp.has(deletingCompany.id) ? 'Download again' : 'Download backup'}
            </button>
          </p>
          <label className="stack"><span>Type <strong>{deletingCompany.name}</strong> to confirm</span>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" data-testid="delete-company-name" />
          </label>
        </Dialog>
      )}

      {restoring && (() => {
        const live = new Set((data ?? []).map((c) => c.id));
        const n = restoring.picked.size;
        return (
          <Dialog title="Restore from backup" wide onClose={() => setRestoring(null)}
            footer={<>
              <button className="btn" onClick={() => setRestoring(null)}>Cancel</button>
              <button className="btn primary" disabled={n === 0} onClick={() => void runRestore()} data-testid="restore-confirm">
                {n === 0 ? 'Restore' : `Restore ${plural(n, 'company', 'companies')}`}
              </button>
            </>}>
            <p className="muted small">
              {restoring.fileName} · made {when(restoring.file.exportedAt)}{restoring.file.exportedBy ? ` by ${restoring.file.exportedBy}` : ''}
            </p>
            <ul className="restore-list">
              {restoring.file.companies.map((c) => {
                const k = backupCounts(c);
                const exists = live.has(c.id);
                return (
                  <li key={c.id}>
                    <label>
                      <input type="checkbox" disabled={exists} checked={restoring.picked.has(c.id)} data-testid={`restore-pick-${c.name}`}
                        onChange={(e) => { const picked = new Set(restoring.picked); if (e.target.checked) picked.add(c.id); else picked.delete(c.id); setRestoring({ ...restoring, picked }); }} />
                      <span>
                        <strong>{c.name}</strong>
                        <span className="muted small">
                          {exists ? 'Still in All accounts, so there’s nothing to restore · ' : ''}
                          {plural(k.sites, 'site')}, {plural(k.people, 'person', 'people')}, {plural(k.maps, 'map')}
                          {k.trashed ? ` and ${k.trashed} in Recently deleted` : ''}, {plural(k.versions, 'saved version')}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="muted small">
              Everything comes back as it was in the backup, with the same site links and join codes (unless another site has taken one since).
              People who still have a sign-in get their access back right away; the rest get it when they next sign in.
            </p>
          </Dialog>
        );
      })()}

      {restored && (
        <Dialog title={restored.failed.length ? 'Restore finished with problems' : 'Restore finished'} onClose={() => setRestored(null)}
          footer={<button className="btn primary" onClick={() => setRestored(null)}>Done</button>}>
          <div data-testid="restore-result">
            {restored.results.map((r) => (
              <div key={r.name} className="restore-result">
                <p><strong>{r.name}</strong> is back: {plural(r.sites, 'site')}, {plural(r.maps, 'map')} ({r.published} published),
                  {' '}{plural(r.members + r.invited, 'person', 'people')} with access{r.invited ? ` (${r.invited} once they sign in)` : ''},
                  {' '}{plural(r.versions, 'saved version')}.</p>
                {r.slug_changes.map((x) => (
                  <p key={x.site} className="muted small">{x.site}’s link was taken by another site, so it is now {siteLink(x.now)}.</p>
                ))}
                {r.moved_to_trash > 0 && <p className="muted small">{plural(r.moved_to_trash, 'map')} didn’t fit in its site’s 5 slots and went to Recently deleted.</p>}
                {r.versionErrors > 0 && <p className="error-text">{plural(r.versionErrors, 'saved version')} couldn’t be restored. The maps themselves are fine.</p>}
              </div>
            ))}
            {restored.failed.map((f) => (
              <p key={f.name} className="error-text"><strong>{f.name}</strong> wasn’t restored: {f.error}</p>
            ))}
          </div>
        </Dialog>
      )}

      {removing && (
        <ConfirmDialog title={`Remove ${removing.person.email} from ${removing.company.name}?`} confirmLabel="Remove access" danger onCancel={() => setRemoving(null)}
          onConfirm={() => { const { company: c, person: p } = removing; setRemoving(null);
            void act(() => (p.pending || !p.user_id
              ? supabase!.rpc('cancel_invitation', { p_company: c.id, p_email: p.email })
              : supabase!.rpc('remove_member', { p_company: c.id, p_user: p.user_id })), `${p.email} removed from ${c.name}.`); }}
          message={<p>They lose access right away and are signed out on every device. Their sign-in email isn’t deleted. Access to any other company stays, though they’ll have to sign in again.</p>} />
      )}
    </div>
  );
}
