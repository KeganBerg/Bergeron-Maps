import { useEffect, useState } from 'react';
import { AppHeader } from '../home/HomePage';
import { navigate } from '../router';
import { ConfirmDialog } from '../ui/Dialog';
import { Icon } from '../ui/icons';
import { friendly, supabase } from './client';
import { canManageCompany, type Membership, type Role } from './session';

interface Site { id: string; name: string; slug: string }
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
  if (m.role === 'owner') return 'Owner (all sites)';
  const where = m.facility_ids === null ? 'all sites' : m.facility_ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'a site').join(', ');
  return `${m.role === 'manager' ? 'Manager' : 'Employee'} · ${where}`;
}

/**
 * Sites and people for one company. Access is given by email to specific
 * sites; each site has a link for its managers and a code for employees.
 */
export function TeamPage({ membership, header }: { membership: Membership; header: React.ReactNode }) {
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
    const s = await db.from('facilities').select('id, name, slug').eq('company_id', company).order('name');
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
      <AppHeader>{header}</AppHeader>
      <main className="home-main team">
        <button className="link back-link" onClick={() => navigate('/')}><Icon name="back" size={14} /> Back to maps</button>
        <h2>Sites and people · {membership.companyName}</h2>
        {error && <p className="error-text" role="alert">{error}</p>}
        {note && <p className="ok-text" role="status">{note}</p>}

        <section className="panel-card">
          <h3>Sites</h3>
          <p className="muted small">
            Send managers their site link. It only works for emails you’ve added below. Employees join a single site with its code and can only view
            published maps.
          </p>
          <ul className="site-list">
            {sites.map((s) => (
              <li key={s.id} data-testid={`team-site-${s.name}`}>
                <span className="site-name">
                  <strong>{s.name}</strong>
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
          {full && (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void addSite(); }}>
              <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="Site Name" maxLength={120} />
              <button className="btn" disabled={!newSite.trim()}><Icon name="plus" size={14} /> Add site</button>
            </form>
          )}
        </section>

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
          {members === null ? <p className="muted">Loading…</p> : (
            <ul className="people">
              {members.map((m) => (
                <li key={m.email}>
                  <span>
                    <strong>{m.email}</strong>
                    <span className="muted small">{describe(m, sites)}{m.pending ? ' · hasn’t signed in yet' : ''}</span>
                  </span>
                  {m.role !== 'owner' && (
                    <button className="btn small danger-text" onClick={() => setRemoving(m)}>Remove</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {removing && (
        <ConfirmDialog title={`Remove ${removing.email}?`} confirmLabel="Remove access" danger onCancel={() => setRemoving(null)} onConfirm={() => void remove(removing)}
          message={<p>They lose access right away, including on any device where they’re signed in.</p>} />
      )}
      {rotating && (
        <ConfirmDialog title={`New code for ${rotating.name}?`} confirmLabel="Make new code" onCancel={() => setRotating(null)} onConfirm={() => void rotate(rotating)}
          message={<p>The old code stops working. People who already joined keep their access.</p>} />
      )}
    </div>
  );
}
