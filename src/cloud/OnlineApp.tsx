import { useEffect, useMemo, useState } from 'react';
import { EditorPage } from '../editor/EditorPage';
import { AppHeader, HomePage } from '../home/HomePage';
import { navigate, useRoute } from '../router';
import { ViewerPage } from '../viewer/ViewerPage';
import { AccountMenu } from './AccountMenu';
import { supabase } from './client';
import { EmployeeHome } from './EmployeeHome';
import { NoAccessPage } from './NoAccessPage';
import { canEdit, canManageCompany, useSession } from './session';
import { SignInPage, takeReturnRoute } from './SignInPage';
import { SupabaseRepository } from './supabaseRepository';
import { TeamPage } from './TeamPage';

const COMPANY_KEY = 'bm.company';
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

  const siteParam = parts[0] === 'site' ? parts[1] : undefined;
  const membership = useMemo(() => {
    if (!s.memberships.length) return undefined;
    if (siteParam) {
      const bySite = s.memberships.find((m) => m.siteIds === null || m.siteIds.includes(siteParam));
      if (bySite) return bySite;
    }
    return s.memberships.find((m) => m.companyId === companyId) ?? s.memberships[0];
  }, [s.memberships, companyId, siteParam]);
  const repo = useMemo(() => (membership ? new SupabaseRepository(supabase!, membership.companyId, siteParam) : null), [membership, siteParam]);

  if (s.loading) return <div className="page-message"><p>Loading…</p></div>;
  if (!s.session) return <SignInPage siteLink={!!siteParam} />;
  if (!membership || !repo) return <NoAccessPage email={s.email ?? ''} isAdmin={s.isAdmin} onJoined={s.reload} />;

  const switchCompany = (id: string) => {
    try { localStorage.setItem(COMPANY_KEY, id); } catch { /* stays for this visit */ }
    setCompanyId(id);
    navigate('/');
  };
  const editor = canEdit(membership);
  const header = (
    <>
      {editor && parts[0] !== 'team' && <button className="btn" onClick={() => navigate('/team')} data-testid="team">Sites &amp; people</button>}
      <AccountMenu email={s.email ?? ''} memberships={s.memberships} current={membership} onSwitch={switchCompany} />
    </>
  );

  if (parts[0] === 'view' && parts[1])
    return <ViewerPage key={parts[1]} mapId={parts[1]} repo={repo} preview={editor && query.get('preview') === '1'} />;
  if (parts[0] === 'edit' && parts[1] && editor) return <EditorPage key={parts[1]} mapId={parts[1]} repo={repo} />;
  if (parts[0] === 'team' && editor) return <TeamPage membership={membership} header={header} />;

  if (siteParam && membership.siteIds !== null && !membership.siteIds.includes(siteParam))
    return (
      <div className="home">
        <AppHeader>{header}</AppHeader>
        <main className="signin"><div className="signin-card">
          <h2>You don’t have access to this site</h2>
          <p>You’re signed in as <strong>{s.email}</strong>. Ask your admin to add this email to the site, then open the link again.</p>
          <button className="btn" onClick={() => navigate('/')}>Go to my sites</button>
        </div></main>
      </div>
    );

  if (!editor) return <EmployeeHome repo={repo} header={header} />;
  return (
    <HomePage key={`${membership.companyId}:${siteParam ?? ''}`} repo={repo} headerExtra={header} banner={null}
      title={siteParam ? 'Your site' : `${membership.companyName} sites`} canAddSite={canManageCompany(membership) && !siteParam} />
  );
}
