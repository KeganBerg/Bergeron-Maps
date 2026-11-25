import { useState } from 'react';
import { accessText, type AdminCompany, type AdminPerson, type AdminSite } from '../model/adminAccounts';
import { useMotionGroup } from '../ui/motion';
import { MoreMenu } from '../ui/MoreMenu';
import { supabase } from './client';
import { RenameForm } from './rename';
import { siteLink } from './TeamPage';

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null);

/**
 * All accounts, detail pane: one company's contract, manager requests, sites
 * and people, with the admin's actions on each. Changes go through `act`,
 * which shows the result and reloads the page's data.
 */
export function AdminCompanyPane({ company: c, email, working, act, onRenamed, onOpen, onDownload, onDeleteSite, onDeleteCompany, onRemovePerson }: {
  company: AdminCompany;
  /** The signed-in admin, who can't remove themselves. */
  email: string;
  /** True while a backup or picture move runs; backup buttons wait for it. */
  working: boolean;
  act: (fn: () => PromiseLike<{ error: unknown }>, ok: string) => Promise<void>;
  onRenamed: (was: string, name: string) => void;
  onOpen: (companyId: string, to?: string) => void;
  onDownload: () => void;
  onDeleteSite: (site: AdminSite) => void;
  onDeleteCompany: () => void;
  onRemovePerson: (person: AdminPerson) => void;
}) {
  const [editing, setEditing] = useState<{ kind: 'limit' | 'address'; id: string; value: string } | null>(null);
  const [renaming, setRenaming] = useState<{ kind: 'company' | 'site'; id: string } | null>(null);
  const [adding, setAdding] = useState<{ name: string; address: string } | null>(null);
  const lists = useMotionGroup();
  const renamed = (was: string, name: string) => { setRenaming(null); onRenamed(was, name); };
  const full = c.max_sites != null && c.sites.length >= c.max_sites;

  return (
    <section className="admin-company" data-testid={`admin-company-${c.name}`} aria-label={c.name}>
      <div className="admin-company-head">
        {renaming?.kind === 'company' ? (
          <RenameForm kind="company" id={c.id} current={c.name} onDone={(n) => renamed(c.name, n)} onCancel={() => setRenaming(null)} />
        ) : (
          <h3>{c.name}{' '}
            <button className="link rename-link" onClick={() => setRenaming({ kind: 'company', id: c.id })} data-testid={`rename-company-${c.name}`}>Rename</button>
          </h3>
        )}
        <span className="site-actions">
          <button className="btn small" disabled={working} onClick={onDownload} data-testid={`backup-${c.name}`}>Download backup</button>
          <button className="btn small" onClick={() => onOpen(c.id, '/team')}>Sites &amp; people</button>
          <button className="btn small primary" onClick={() => onOpen(c.id)}>Open maps</button>
        </span>
      </div>
      <p className="muted small admin-contract">
        Set up {when(c.created_at)},{' '}
        {editing?.kind === 'limit' ? (
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
        <div className="panel-card">
          <h4>Manager requests</h4>
          <ul className="people" ref={lists(`${c.id}-requests`)}>
            {c.requests.map((q) => (
              <li key={q.id}>
                <span>
                  <strong>{q.email}</strong>
                  <span className="muted small">{c.sites.find((x) => x.id === q.facility_id)?.name ?? 'A site'}{q.note ? `: “${q.note}”` : ''}</span>
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
        </div>
      )}

      <div className="admin-company-cols">
        <div className="panel-card">
          <h4>Sites</h4>
          <ul className="site-list" ref={lists(`${c.id}-sites`)}>
            {c.sites.map((s) => (
              <li key={s.id} data-testid={`admin-site-${s.name}`}>
                <span className="site-name">
                  {renaming?.kind === 'site' && renaming.id === s.id ? (
                    <RenameForm kind="site" id={s.id} current={s.name} others={c.sites.filter((x) => x.id !== s.id).map((x) => x.name)}
                      onDone={(n) => renamed(s.name, n)} onCancel={() => setRenaming(null)} />
                  ) : (
                    <strong>{s.name}</strong>
                  )}
                  {editing?.kind === 'address' && editing.id === s.id ? (
                    <form className="link-edit" onSubmit={(e) => { e.preventDefault(); setEditing(null);
                      void act(() => supabase!.rpc('set_site_address', { p_facility: s.id, p_address: editing.value }), `Address for ${s.name} saved.`); }}>
                      <input autoFocus value={editing.value} maxLength={300} onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        aria-label="Site address" placeholder="Street, city, state" />
                      <button className="btn small primary">Save</button>
                      <button type="button" className="btn small" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <span className="muted small">{s.address ?? 'No address yet'}</span>
                  )}
                  <span className="muted small site-url">{siteLink(s.slug)}</span>
                </span>
                <span className="site-actions">
                  <span className="muted small">{s.maps} {s.maps === 1 ? 'map' : 'maps'}, {s.published} published{s.public ? `, ${s.public} public` : ''}</span>
                  <MoreMenu label={`More for ${s.name}`} testId={`more-site-${s.name}`} items={[
                    { label: 'Rename', onClick: () => setRenaming({ kind: 'site', id: s.id }), testId: `rename-site-${s.name}` },
                    { label: s.address ? 'Change address' : 'Add address', onClick: () => setEditing({ kind: 'address', id: s.id, value: s.address ?? '' }), testId: `address-${s.name}` },
                    { label: 'Delete site', danger: true, onClick: () => onDeleteSite(s), testId: `delete-site-${s.name}` },
                  ]} />
                </span>
              </li>
            ))}
          </ul>
          {adding ? (
            <form className="inline-form admin-add-site" onSubmit={(e) => { e.preventDefault(); const a = adding; setAdding(null);
              void act(() => supabase!.rpc('add_contract_site', { p_company: c.id, p_name: a.name, p_address: a.address.trim() || null }), `${a.name.trim()} added to ${c.name}.`); }}>
              <input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Site Name" maxLength={120} aria-label="Site name" />
              <input value={adding.address} onChange={(e) => setAdding({ ...adding, address: e.target.value })} placeholder="Street, city, state" maxLength={300} aria-label="Site address" />
              <button className="btn small primary" disabled={!adding.name.trim()}>Add site</button>
              <button type="button" className="btn small" onClick={() => setAdding(null)}>Cancel</button>
            </form>
          ) : (
            <button className="btn small" onClick={() => setAdding({ name: '', address: '' })} disabled={full}
              title={full ? 'Every contracted site is set up. Raise the site limit first.' : undefined}>
              Add contracted site
            </button>
          )}
        </div>

        <div className="panel-card">
          <h4>People</h4>
          {c.people.length === 0 ? <p className="muted small">Nobody yet.</p> : (
            <ul className="people" ref={lists(`${c.id}-people`)}>
              {c.people.map((p) => (
                <li key={p.email}>
                  <span>
                    <strong>{p.email}</strong>
                    <span className="muted small">{accessText(p, c.sites)}</span>
                  </span>
                  <span className="site-actions">
                    <span className="muted small">{p.pending ? 'Hasn’t signed in yet' : p.last_sign_in ? `Last signed in ${when(p.last_sign_in)}` : ''}</span>
                    <MoreMenu label={`More for ${p.email}`} testId={`more-${c.name}-${p.email}`} items={p.email.toLowerCase() === email.toLowerCase() ? [] : [
                      { label: 'Remove access', danger: true, onClick: () => onRemovePerson(p), testId: `remove-${c.name}-${p.email}` },
                    ]} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="admin-danger">
        <span className="muted small">Erases the company, its sites and maps, and everyone’s access to it.</span>
        <button className="btn small danger-text" onClick={onDeleteCompany} data-testid={`delete-company-${c.name}`}>Delete company</button>
      </div>
    </section>
  );
}
