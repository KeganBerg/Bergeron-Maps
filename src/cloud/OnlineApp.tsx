import { useEffect, useMemo, useState } from 'react';
import { EditorPage } from '../editor/EditorPage';
import { AppHeader, HomePage } from '../home/HomePage';
import { navigate, useRoute } from '../router';
import { ViewerPage } from '../viewer/ViewerPage';
import { AccountMenu } from './AccountMenu';
import { AdminPage } from './AdminPage';
import { supabase } from './client';
import { MyLocationsPage } from './MyLocationsPage';
import { canEdit, canManageCompany, useSession } from './session';
import { SignInPage, takeReturnRoute } from './SignInPage';
import { SupabaseRepository } from './supabaseRepository';
import { TeamPage } from './TeamPage';

const COMPANY_KEY = 'bm.company';
const RESERVED = new Set(['edit', 'view', 'team', 'site', 'admin', 'locations']);
const readCompany = () => { try { return localStorage.getItem(COMPANY_KEY); } catch { return null; } };

/**
 * Online mode. Every screen is driven by the signed-in person's memberships:
 * a site link (#/site/:id) only narrows what they see, it never grants access.
 */
export function OnlineApp() {
  const s = useSession();
  const { parts, query } = useRoute();
  const [companyId, setCompanyId] = useState(readCompany);

  // After the email link brings someone back, return them to where they started (e.g. their site link).
  useEffect(() => {
    if (!s.session) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('code')) {
      url.searchParams.delete('code');
      window.history.replaceState(null, '', url.toString());
    }
    const back = takeReturnRoute();
    if (back && back !== '/') navigate(back);
  }, [!!s.session]);

  // Site links: #/harbor-hotel (custom name) or #/site/<id>. Either way the
  // site is looked up through row-level security, so it only resolves for
  // people who were given access.
  const linkKey = parts[0] === 'site' ? parts[1] : parts[0] && !RESERVED.has(parts[0]) ? parts[0] : undefined;
  const [site, setSite] = useState<{ key: string; id: string | null; companyId?: string } | null>(null);
  useEffect(() => {
    if (!linkKey || !s.session || s.loading) return;
    let alive = true;
    const byId = parts[0] === 'site';
    supabase!.from('facilities').select('id, company_id').eq(byId ? 'id' : 'slug', byId ? linkKey : linkKey.toLowerCase()).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const row = data as { id: string; company_id: string } | null;
        setSite({ key: linkKey, id: row?.id ?? null, companyId: row?.company_id });
      });
    return () => { alive = false; };
  }, [linkKey, !!s.session, s.loading]);
  const resolving = !!linkKey && site?.key !== linkKey;
  const siteParam = linkKey && site?.key === linkKey ? site.id ?? undefined : undefined;
  const membership = useMemo(() => {
    if (!s.memberships.length) return undefined;
    if (siteParam && site?.companyId) {
      const bySite = s.memberships.find((m) => m.companyId === site.companyId);
      if (bySite) return bySite;
    }
    return s.memberships.find((m) => m.companyId === companyId) ?? s.memberships[0];
  }, [s.memberships, companyId, siteParam, site]);
  const repo = useMemo(() => (membership ? new SupabaseRepository(supabase!, membership.companyId, siteParam) : null), [membership, siteParam]);

  // Open manager requests, shown on the Sites & people tab for the people who can answer them.
  const [requests, setRequests] = useState(0);
  const answersRequests = !!membership && canManageCompany(membership);
  useEffect(() => {
    if (!answersRequests || !membership) return setRequests(0);
    let alive = true;
    supabase!.from('manager_requests').select('id', { count: 'exact', head: true }).eq('company_id', membership.companyId).eq('status', 'pending')
      .then(({ count }) => { if (alive) setRequests(count ?? 0); });
    return () => { alive = false; };
  }, [answersRequests, membership?.companyId, parts[0]]);

  if (!s.loading && !s.session) return <SignInPage siteLink={!!linkKey} />;
  if (s.loading || (resolving && s.memberships.length)) return <div className="page-message"><p>Loading…</p></div>;
  // A failed lookup must not look like "you have no access".
  if (s.error && !s.memberships.length)
    return (
      <div className="page-message" role="alert">
        <p>Your sites couldn’t be loaded. Check your connection and try again.</p>
        <button className="btn" onClick={s.reload}>Try again</button>
      </div>
    );
  const switchCompany = (id: string, to = '/') => {
    try { localStorage.setItem(COMPANY_KEY, id); } catch { /* stays for this visit */ }
    setCompanyId(id);
    navigate(to);
  };
  const accountMenu = <AccountMenu email={s.email ?? ''} memberships={s.memberships} current={membership} onSwitch={switchCompany} />;
  const editor = !!membership && canEdit(membership);
  const section = parts[0] === 'admin' ? 'admin' : parts[0] === 'team' ? 'team' : 'maps';
  const tabs: [string, string, string][] = [
    ...(membership && editor ? [['maps', '/', 'Maps'], ['team', '/team', 'Sites & people']] as [string, string, string][] : []),
    ...(s.isAdmin ? [['admin', '/admin', 'All accounts']] as [string, string, string][] : []),
  ];
  const nav = tabs.length > 1 ? (
    <>
      {tabs.map(([key, to, label]) => (
        <a key={key} href={`#${to}`} className={`nav-tab${section === key ? ' on' : ''}`} aria-current={section === key ? 'page' : undefined} data-testid={`nav-${key}`}>
          {label}
          {key === 'team' && requests > 0 && <span className="nav-count" aria-label={`${requests} manager ${requests === 1 ? 'request' : 'requests'} waiting`}>{requests}</span>}
        </a>
      ))}
    </>
  ) : undefined;

  if (s.isAdmin && (parts[0] === 'admin' || !membership)) return <AdminPage nav={nav} account={accountMenu} email={s.email ?? ''} onOpen={switchCompany} onCreated={s.refresh} />;
  const locations = <MyLocationsPage email={s.email ?? ''} account={accountMenu} onChanged={s.refresh} />;
  if (!membership || !repo) return locations;

  if (parts[0] === 'view' && parts[1])
    return <ViewerPage key={parts[1]} mapId={parts[1]} repo={repo} preview={editor && query.get('preview') === '1'} />;
  if (parts[0] === 'edit' && parts[1] && editor) return <EditorPage key={parts[1]} mapId={parts[1]} repo={repo} />;
  if (parts[0] === 'team' && editor) return <TeamPage membership={membership} nav={nav} account={accountMenu} />;

  if (linkKey && !siteParam)
    return (
      <div className="home">
        <AppHeader nav={nav}>{accountMenu}</AppHeader>
        <main className="signin"><div className="signin-card">
          <h2>This site link isn’t available to you</h2>
          <p>You’re signed in as <strong>{s.email}</strong>. Check the link, or ask your admin to add this email to the site and then open the link again.</p>
          <button className="btn" onClick={() => navigate('/')}>Go to my sites</button>
        </div></main>
      </div>
    );

  if (!editor) return locations;
  return (
    <HomePage key={`${membership.companyId}:${siteParam ?? ''}`} repo={repo} nav={nav} headerExtra={accountMenu} banner={null}
      title={siteParam ? 'Your site' : `${membership.companyName} sites`} canAddSite={canManageCompany(membership) && !siteParam} />
  );
}
