import { useEffect, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import {
  accountTotals, adminPane, companySummary, describeHit, hitTitle, searchAccounts, KIND_LABEL,
  type AdminCompany, type AdminMap, type AdminPerson, type AdminSite, type AdminTool, type Hit,
} from '../model/adminAccounts';
import { navigate, useRoute } from '../router';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { Icon } from '../ui/icons';
import { useMotion } from '../ui/motion';
import { AdminCompanyPane } from './AdminCompanyPane';
import { BackupsPanel, SetupCompanyPanel } from './AdminTools';
import { backupCompany, backupFileName, serializeBackup } from './backup';
import { removeCompanyImages, runPictureMoveOnce } from './mapImages';
import { friendly, supabase } from './client';

const MAX_HITS = 50;
const TOOL_LABEL: Record<AdminTool, string> = { setup: 'Set up a company', backups: 'Backups' };

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

/**
 * Bergeron Maps admins only: every company with its sites and people, and
 * the place to set up a new company. The database refuses this data to
 * anyone else, whatever the browser asks for.
 *
 * Laid out like a mail app: the companies list on the left, the chosen
 * company (or an admin tool) on the right. The choice lives in the link
 * (#/admin?company=<id>, #/admin?tool=backups), so Back works and phones,
 * which show one pane at a time, can go from the list to a company and back.
 */
export function AdminPage({ nav, account, email, onOpen, onCreated }: {
  nav?: React.ReactNode; account: React.ReactNode; email: string; onOpen: (companyId: string, to?: string) => void; onCreated: () => void;
}) {
  const { query } = useRoute();
  const [data, setData] = useState<AdminCompany[] | null>(null);
  const [maps, setMaps] = useState<AdminMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [deletingSite, setDeletingSite] = useState<{ company: AdminCompany; site: AdminSite } | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<AdminCompany | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [removing, setRemoving] = useState<{ company: AdminCompany; person: AdminPerson } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState<Set<string>>(new Set());

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

  /** After a rename: say so, update the header and menus, and reload the overview. */
  const renamed = async (was: string, name: string) => {
    setError(null);
    setNote(`${was} is now called ${name}.`);
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
  useEffect(() => {
    void load();
    // Pictures in maps saved before file storage existed move out on their own, in the background (cloud/mapImages.ts).
    void runPictureMoveOnce(supabase!);
  }, []);

  const q = filter.trim().toLowerCase();
  const hits = q && data ? searchAccounts(q, data, maps) : [];
  const pane = data ? adminPane(data, query) : null;
  const shownId = pane?.kind === 'company' ? pane.company.id : null;
  const shownTool = pane?.kind === 'tool' ? pane.tool : null;
  const status = { working: !!working, setWorking, setNote, setError };
  // A map opens in the editor; anything else opens its company here.
  const go = (h: Hit) => {
    if (h.kind === 'map') return onOpen(h.company.id, h.map.deleted_at ? '/' : `/edit/${h.map.id}`);
    navigate(`/admin?company=${h.company.id}`);
  };
  const motion = useMotion();
  const detailMotion = useMotion();
  const totals = data && accountTotals(data);
  // Moving to another company or tool clears the last result, so it isn't read as being about the new one.
  const clear = () => { setNote(null); setError(null); };

  return (
    <div className="home">
      <AppHeader nav={nav}>{account}</AppHeader>
      <main className="home-main team admin" ref={motion}>
        <div className="page-head">
          <h2>All accounts</h2>
          {totals && (
            <dl className="admin-stats" data-testid="admin-totals">
              {([['Companies', totals.companies], ['Sites', totals.sites], ['People', totals.people], ['Maps', totals.maps]] as const).map(([label, n]) => (
                <div key={label}><dt>{label}</dt><dd>{n}</dd></div>
              ))}
            </dl>
          )}
        </div>

        <div className={`admin-split${pane?.chosen ? ' has-choice' : ''}`}>
          <aside className="admin-list" aria-label="Companies and tools">
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="Search all accounts" aria-label="Search all accounts" data-testid="admin-search" />
            <a href="#/admin?tool=setup" className={`btn primary admin-new${shownTool === 'setup' ? ' on' : ''}`} onClick={clear} data-testid="admin-tool-setup">
              <Icon name="plus" size={16} /> Set up a company
            </a>
            {q && data ? (
              <div className="search-results" role="region" aria-label="Search results" data-testid="admin-results">
                {hits.length === 0 ? <p className="muted small">Nothing matches “{filter.trim()}”.</p> : (
                  <ul>
                    {hits.slice(0, MAX_HITS).map((h) => (
                      <li key={h.key}>
                        <button onClick={() => { clear(); go(h); }}>
                          <span className={`hit-kind ${h.kind}`}>{KIND_LABEL[h.kind]}</span>
                          <span className="hit-text">
                            <strong>{hitTitle(h)}</strong>
                            <span className="muted small">{describeHit(h)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {hits.length > MAX_HITS && <p className="muted small">Showing the first {MAX_HITS} of {hits.length}. Add more of the name or email to narrow it down.</p>}
              </div>
            ) : (
              <nav className="admin-companies" aria-label="Companies">
                <h3>Companies</h3>
                {data === null && !error && <p className="muted small">Loading…</p>}
                {data?.length === 0 && <p className="muted small">No companies yet.</p>}
                <ul>
                  {data?.map((c) => (
                    <li key={c.id}>
                      <a href={`#/admin?company=${c.id}`} className={shownId === c.id ? 'on' : undefined} aria-current={shownId === c.id ? 'page' : undefined}
                        onClick={clear} data-testid={`admin-pick-${c.name}`}>
                        <strong>{c.name}</strong>
                        <span className="muted small">{companySummary(c)}</span>
                        {!!c.requests?.length && <span className="nav-count" aria-label={`${c.requests.length} manager requests waiting`}>{c.requests.length}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <nav className="admin-companies admin-tools" aria-label="Admin tools">
              <h3>Tools</h3>
              <ul>
                {(['backups'] as const).map((t) => (
                  <li key={t}>
                    <a href={`#/admin?tool=${t}`} className={shownTool === t ? 'on' : undefined} aria-current={shownTool === t ? 'page' : undefined}
                      onClick={clear} data-testid={`admin-tool-${t}`}>
                      <strong>{TOOL_LABEL[t]}</strong>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div className="admin-detail" ref={detailMotion}>
            <a href="#/admin" className="link back-link admin-back"><Icon name="back" size={16} /> All companies</a>
            {error && <p className="error-text" role="alert">{error}</p>}
            {note && <p className="ok-text" role="status">{note}</p>}
            {working && <p className="muted small" role="status" data-testid="backup-working">{working}…</p>}
            {data === null && !error && <p className="muted">Loading…</p>}
            {data && pane?.kind === 'company' && (
              <AdminCompanyPane key={pane.company.id} company={pane.company} maps={maps} email={email} working={!!working} act={act}
                onRenamed={(was, name) => void renamed(was, name)} onOpen={onOpen} onDownload={() => void download([pane.company])}
                onDeleteSite={(site) => setDeletingSite({ company: pane.company, site })}
                onDeleteCompany={() => { setConfirmName(''); setDeletingCompany(pane.company); }}
                onRemovePerson={(person) => setRemoving({ company: pane.company, person })} />
            )}
            {data && shownTool === 'setup' && (
              <SetupCompanyPanel setNote={setNote} setError={setError}
                onCreated={async (id) => { onCreated(); await load(); if (id) navigate(`/admin?company=${id}`); }} />
            )}
            {data && shownTool === 'backups' && (
              <BackupsPanel {...status} data={data} onDownloadAll={() => void download(data)} onRestored={async () => { onCreated(); await load(); }} />
            )}
          </div>
        </div>
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
                void act(async () => {
                  const r = await supabase!.rpc('admin_delete_company', { p_company: c.id, p_confirm_name: confirmName });
                  // Its map pictures go too. A backup file keeps its own copy of them.
                  if (!r.error) await removeCompanyImages(supabase!, c.id).catch(() => {});
                  return r;
                }, `${c.name} deleted.`); }}>
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
