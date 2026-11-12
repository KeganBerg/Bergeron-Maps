import { useEffect, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { useRoute } from '../router';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { Icon } from '../ui/icons';
import { friendly, supabase } from './client';
import { publicSiteLink } from './PublicSitePage';
import { canManageCompany, type Membership, type Role } from './session';

interface Site { id: string; name: string; slug: string; address: string | null }
interface ManagerRequest { id: string; email: string; facility_id: string; note: string | null; created_at: string }
interface Member { user_id: string | null; email: string; role: Role; facility_ids: string[] | null; pending: boolean }

/** What each kind of access means, in words a manager would use. */
type Access = 'regional' | 'site-manager' | 'employee';
const ACCESS_LABEL: Record<Access, string> = {
  regional: 'Regional manager (all sites)',
  'site-manager': 'Site manager',
  employee: 'Employee (view only)',
};

/** Built from the current address, so links follow the app to any domain it's served from. */
export const siteLink = (slug: string) => `${window.location.origin}${window.location.pathname}#/${slug}`;
const cleanSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

function describe(m: Member, sites: Site[]): string {
  if (m.role === 'owner') return 'Account lead (all sites)';
  const where = m.facility_ids === null ? 'all sites' : m.facility_ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'a site').join(', ');
  if (m.role === 'manager' && m.facility_ids === null) return 'Regional manager (all sites)';
  return `${m.role === 'manager' ? 'Site manager' : 'Employee'} · ${where}`;
}

/**
 * Sites and people for one company. Access is given by email to specific
 * sites; each site has a link for its managers and a code for employees.
 */
export function TeamPage({ membership, nav, account }: { membership: Membership; nav: React.ReactNode; account: React.ReactNode }) {
  const company = membership.companyId;
  const full = canManageCompany(membership);
  const [sites, setSites] = useState<Site[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<Access>('site-manager');
  const [siteId, setSiteId] = useState('');
  const [newSite, setNewSite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [rotating, setRotating] = useState<Site | null>(null);
  const [editingLink, setEditingLink] = useState<{ id: string; value: string } | null>(null);
  const [maxSites, setMaxSites] = useState<number | null>(null);
  const [requests, setRequests] = useState<ManagerRequest[]>([]);
  const [moving, setMoving] = useState<{ member: Member; from: string; to: string } | null>(null);
  const { query } = useRoute();
  const [find, setFind] = useState(() => query.get('q') ?? '');
  const f = find.trim().toLowerCase();
  const shownSites = f ? sites.filter((x) => x.name.toLowerCase().includes(f) || x.slug.includes(f) || codes[x.id]?.toLowerCase() === f) : sites;
  const shownMembers = members && f ? members.filter((m) => m.email.includes(f) || describe(m, sites).toLowerCase().includes(f)) : members;

  const saveLink = async () => {
    if (!editingLink) return;
    const slug = cleanSlug(editingLink.value);
    if (!slug) return setError('Use letters and numbers in the link name.');
    const r = await supabase!.from('facilities').update({ slug }).eq('id', editingLink.id).select('slug');
    if (r.error) {
      return setError(/duplicate key/i.test(r.error.message) ? `“${slug}” is already taken by another site. Try adding the city, e.g. ${slug}-miami.`
        : /check constraint/i.test(r.error.message) ? `“${slug}” can’t be used as a link name. Try another.` : friendly(r.error));
    }
    if (!r.data?.length) return setError('Only owners and regional managers can change site links.');
    setEditingLink(null);
    setNote(`Site link changed. The old link no longer works.`);
    await load();
  };

  const load = async () => {
    const db = supabase!;
    const s = await db.from('facilities').select('id, name, slug, address').eq('company_id', company).order('name');
    if (s.error) return setError(friendly(s.error));
    const list = (s.data ?? []) as Site[];
    const mine = membership.siteIds === null ? list : list.filter((x) => membership.siteIds!.includes(x.id));
    setSites(mine);
    setSiteId((cur) => cur || mine[0]?.id || '');
    const c: Record<string, string> = {};
    await Promise.all(mine.map(async (x) => {
      const r = await db.rpc('get_join_code', { p_facility: x.id });
      if (!r.error) c[x.id] = r.data as string;
    }));
    setCodes(c);
    if (full) {
      const [c, q] = await Promise.all([
        db.from('companies').select('max_sites').eq('id', company).maybeSingle(),
        db.from('manager_requests').select('id, email, facility_id, note, created_at').eq('company_id', company).eq('status', 'pending').order('created_at'),
      ]);
      setMaxSites((c.data as { max_sites: number | null } | null)?.max_sites ?? null);
      setRequests((q.data ?? []) as ManagerRequest[]);
    }
    const m = await db.rpc('list_members', { p_company: company });
    if (m.error) setError(friendly(m.error));
    else setMembers(m.data as Member[]);
  };
  useEffect(() => { void load(); }, [company]);

  const add = async () => {
    setError(null);
    setNote(null);
    const role: Role = access === 'employee' ? 'employee' : 'manager';
    const scope = access === 'regional' ? null : [siteId];
    const r = await supabase!.rpc('add_member', { p_company: company, p_email: email, p_role: role, p_facility_ids: scope });
    if (r.error) return setError(friendly(r.error));
    const who = email.trim().toLowerCase();
    setNote(r.data === 'added'
      ? `${who} now has access. Send them the site link.`
      : `${who} will get access as soon as they sign in with that email. Send them the site link.`);
    setEmail('');
    await load();
  };

  const remove = async (m: Member) => {
    const r = m.pending || !m.user_id
      ? await supabase!.rpc('cancel_invitation', { p_company: company, p_email: m.email })
      : await supabase!.rpc('remove_member', { p_company: company, p_user: m.user_id });
    setRemoving(null);
    if (r.error) return setError(friendly(r.error));
    await load();
  };

  const decide = async (q: ManagerRequest, approve: boolean) => {
    setError(null);
    setNote(null);
    const r = await supabase!.rpc('decide_manager_request', { p_request: q.id, p_approve: approve });
    if (r.error) return setError(friendly(r.error));
    const where = sites.find((x) => x.id === q.facility_id)?.name ?? 'the site';
    setNote(approve ? `${q.email} is now the site manager of ${where}.` : `Request from ${q.email} denied. Their access didn’t change.`);
    await load();
  };

  const move = async () => {
    if (!moving) return;
    const { member, from, to } = moving;
    setMoving(null);
    const r = await supabase!.rpc('move_member', { p_company: company, p_email: member.email, p_from: from, p_to: to });
    if (r.error) return setError(friendly(r.error));
    const name = (id: string) => sites.find((x) => x.id === id)?.name ?? 'a site';
    setNote(`${member.email} moved from ${name(from)} to ${name(to)}. Their next visit opens ${name(to)}.`);
    await load();
  };

  const atLimit = maxSites !== null && sites.length >= maxSites;

  const addSite = async () => {
    const r = await supabase!.from('facilities').insert({ company_id: company, name: newSite.trim() });
    if (r.error) return setError(friendly(r.error));
    setNewSite('');
    await load();
  };

  const rotate = async (s: Site) => {
    setRotating(null);
    const r = await supabase!.rpc('rotate_join_code', { p_facility: s.id });
    if (r.error) return setError(friendly(r.error));
    setCodes((c) => ({ ...c, [s.id]: r.data as string }));
  };

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => setNote(`${what} copied.`), () => setNote(text));
  };

  return (
    <div className="home">
      <AppHeader nav={nav}>{account}</AppHeader>
      <main className="home-main team">
        <div className="page-head">
          <h2>Sites and people <span className="page-sub">{membership.companyName}</span></h2>
          <input type="search" className="page-search" value={find} onChange={(e) => setFind(e.target.value)}
            placeholder="Search sites, people or a join code" aria-label="Search sites and people" data-testid="team-search" />
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {note && <p className="ok-text" role="status">{note}</p>}

        <section className="panel-card">
          <h3>Sites</h3>
          <p className="muted small">
            Send managers their site link. It only works for emails you’ve added below. Employees join a single site with its code and can only view
            published maps.
          </p>
          <ul className="site-list">
            {f && shownSites.length === 0 && <li className="muted small">No site matches “{find.trim()}”.</li>}
            {shownSites.map((s) => (
              <li key={s.id} data-testid={`team-site-${s.name}`}>
                <span className="site-name">
                  <strong>{s.name}</strong>
                  {s.address && <span className="muted small">{s.address}</span>}
                  {editingLink?.id === s.id ? (
                    <form className="link-edit" onSubmit={(e) => { e.preventDefault(); void saveLink(); }}>
                      <span className="muted small">…/#/</span>
                      <input autoFocus value={editingLink.value} maxLength={50} aria-label="Link name" data-testid="slug-input"
                        onChange={(e) => setEditingLink({ id: s.id, value: e.target.value })} />
                      <button className="btn small primary">Save</button>
                      <button type="button" className="btn small" onClick={() => setEditingLink(null)}>Cancel</button>
                    </form>
                  ) : (
                    <span className="muted small site-url">{siteLink(s.slug)}</span>
                  )}
                </span>
                <span className="site-actions">
                  <button className="btn small" onClick={() => copy(siteLink(s.slug), 'Site link')}>Copy link</button>
                  <button className="btn small" onClick={() => copy(publicSiteLink(s.slug), 'Public link')}
                    title="Opens this site’s public maps without signing in. Make a map public from the Maps page.">Copy public link</button>
                  {full && editingLink?.id !== s.id && (
                    <button className="btn small" onClick={() => setEditingLink({ id: s.id, value: s.slug })}>Edit link</button>
                  )}
                  {codes[s.id] && (
                    <>
                      <span className="code-chip" title="Employee join code">{codes[s.id]}</span>
                      <button className="btn small" onClick={() => setRotating(s)}>New code</button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {full && maxSites !== null && (
            <p className="muted small" data-testid="site-limit">
              {sites.length} of {maxSites} contracted {maxSites === 1 ? 'site' : 'sites'}.
              {atLimit && ' To add a site, contact Bergeron Maps to update your contract.'}
            </p>
          )}
          {full && !atLimit && (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void addSite(); }}>
              <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="Site Name" maxLength={120} />
              <button className="btn" disabled={!newSite.trim()}><Icon name="plus" size={14} /> Add site</button>
            </form>
          )}
        </section>

        {full && requests.length > 0 && (
          <section className="panel-card requests" data-testid="manager-requests">
            <h3>Manager requests</h3>
            <p className="muted small">These people joined a site with its code and asked to manage it. Approve makes them site manager of that site only.</p>
            <ul className="people">
              {requests.map((q) => (
                <li key={q.id} data-testid={`request-${q.email}`}>
                  <span>
                    <strong>{q.email}</strong>
                    <span className="muted small">
                      {sites.find((x) => x.id === q.facility_id)?.name ?? 'A site'} · asked {new Date(q.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {q.note ? ` · “${q.note}”` : ''}
                    </span>
                  </span>
                  <span className="site-actions">
                    <button className="btn small primary" onClick={() => void decide(q, true)} data-testid={`approve-${q.email}`}>Approve</button>
                    <button className="btn small" onClick={() => void decide(q, false)}>Deny</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel-card">
          <h3>Give someone access</h3>
          <form className="add-person" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <label className="stack">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required /></label>
            <label className="stack">Access
              <select value={access} onChange={(e) => setAccess(e.target.value as Access)}>
                {(Object.keys(ACCESS_LABEL) as Access[]).filter((a) => full || a !== 'regional').map((a) => <option key={a} value={a}>{ACCESS_LABEL[a]}</option>)}
              </select>
            </label>
            {access !== 'regional' && (
              <label className="stack">Site
                <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <button className="btn primary" disabled={!email.trim() || (access !== 'regional' && !siteId)}>Give access</button>
          </form>
        </section>

        <section className="panel-card">
          <h3>People</h3>
          {shownMembers === null ? <p className="muted">Loading…</p> : (
            <ul className="people">
              {f && shownMembers.length === 0 && <li className="muted small">Nobody matches “{find.trim()}”.</li>}
              {shownMembers.map((m) => (
                <li key={m.email}>
                  <span>
                    <strong>{m.email}</strong>
                    <span className="muted small">{describe(m, sites)}{m.pending ? ' · hasn’t signed in yet' : ''}</span>
                  </span>
                  {m.role !== 'owner' && (
                    <span className="site-actions">
                      {full && m.facility_ids !== null && sites.length > 1 && (
                        <button className="btn small" onClick={() => setMoving({ member: m, from: m.facility_ids![0], to: sites.find((x) => !m.facility_ids!.includes(x.id))?.id ?? '' })}
                          data-testid={`move-${m.email}`}>Move</button>
                      )}
                      <button className="btn small danger-text" onClick={() => setRemoving(m)}>Remove</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {removing && (
        <ConfirmDialog title={`Remove ${removing.email}?`} confirmLabel="Remove access" danger onCancel={() => setRemoving(null)} onConfirm={() => void remove(removing)}
          message={<p>They lose access right away and are signed out on every device. Maps, site codes and links stay with the site.</p>} />
      )}
      {moving && (
        <Dialog title={`Move ${moving.member.email}`} onClose={() => setMoving(null)}
          footer={<>
            <button className="btn" onClick={() => setMoving(null)}>Cancel</button>
            <button className="btn primary" disabled={!moving.to || moving.to === moving.from} onClick={() => void move()} data-testid="move-confirm">Move</button>
          </>}>
          <p>They keep the same role. Maps stay with each site.</p>
          {moving.member.facility_ids!.length > 1 && (
            <label className="stack">From
              <select value={moving.from} onChange={(e) => setMoving({ ...moving, from: e.target.value })}>
                {moving.member.facility_ids!.map((id) => <option key={id} value={id}>{sites.find((x) => x.id === id)?.name ?? 'A site'}</option>)}
              </select>
            </label>
          )}
          <label className="stack">To
            <select value={moving.to} onChange={(e) => setMoving({ ...moving, to: e.target.value })} data-testid="move-to">
              {sites.filter((x) => !moving.member.facility_ids!.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </Dialog>
      )}
      {rotating && (
        <ConfirmDialog title={`New code for ${rotating.name}?`} confirmLabel="Make new code" onCancel={() => setRotating(null)} onConfirm={() => void rotate(rotating)}
          message={<p>The old code stops working. People who already joined keep their access.</p>} />
      )}
    </div>
  );
}
