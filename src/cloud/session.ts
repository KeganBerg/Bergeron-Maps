import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './client';

export type Role = 'owner' | 'manager' | 'employee';

export interface Membership {
  companyId: string;
  companyName: string;
  role: Role;
  /** null = every site in the company (owners, regional managers). */
  siteIds: string[] | null;
  /** Reached as a Bergeron Maps admin rather than as a member of the company. */
  viaAdmin?: boolean;
}

export interface SessionState {
  loading: boolean;
  session: Session | null;
  email: string | null;
  memberships: Membership[];
  isAdmin: boolean;
  error: string | null;
  /** Reloads access behind a loading screen. */
  reload: () => void;
  /** Checks access again quietly; the screen only changes if access did. */
  refresh: () => void;
}

export const canEdit = (m: Membership) => m.role !== 'employee';
export const canManageCompany = (m: Membership) => m.role === 'owner' || (m.role === 'manager' && m.siteIds === null);

/**
 * Who is signed in and where they have access. Access always comes from the
 * database (memberships), never from the link someone opened, so there is no
 * role to pick and nothing a person can change about their own access.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadedFor, setLoadedFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const [nudge, setNudge] = useState(0);
  const refresh = useCallback(() => setNudge((n) => n + 1), []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || !userId) {
      setMemberships([]);
      setIsAdmin(false);
      return;
    }
    let alive = true;
    setError(null);
    loadAccess(userId).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setMemberships(r.list);
      setIsAdmin(r.admin);
      setLoadedFor(`${userId}:${tick}`);
    });
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  // Access can be taken away while someone has the app open (removed, moved
  // to another site). Check again every minute and whenever the tab comes
  // back, and update quietly, without a loading screen, only if it changed.
  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void loadAccess(userId).then((r) => {
        if (!alive || r.error) return;
        setMemberships((cur) => (accessKey(cur) === accessKey(r.list) ? cur : r.list));
        setIsAdmin(r.admin);
      });
    };
    if (nudge) check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [userId, nudge]);

  return {
    loading: !ready || (!!userId && loadedFor !== `${userId}:${tick}`),
    session,
    email: session?.user.email ?? null,
    memberships,
    isAdmin,
    error,
    reload,
    refresh,
  };
}

const accessKey = (list: Membership[]) => JSON.stringify(list.map((m) => [m.companyId, m.role, m.siteIds, m.viaAdmin ?? false]));

/** The signed-in person's memberships, plus every company when they are a Bergeron Maps admin. */
async function loadAccess(userId: string): Promise<{ list: Membership[]; admin: boolean; error: string | null }> {
  const db = supabase!;
  const [m, a] = await Promise.all([
    db.from('memberships').select('company_id, role, facility_ids, companies(name)').eq('user_id', userId),
    db.rpc('is_platform_admin'),
  ]);
  const error = (m.error ?? a.error)?.message ?? null;
  const rows = (m.data ?? []) as unknown as { company_id: string; role: Role; facility_ids: string[] | null; companies: { name: string } | null }[];
  const list: Membership[] = rows.map((r) => ({ companyId: r.company_id, companyName: r.companies?.name ?? 'Company', role: r.role, siteIds: r.facility_ids }));
  const admin = a.data === true;
  if (admin) {
    // Admins can open every company, as if they were its owner.
    const all = await db.from('companies').select('id, name');
    for (const c of (all.data ?? []) as { id: string; name: string }[]) {
      if (!list.some((x) => x.companyId === c.id)) list.push({ companyId: c.id, companyName: c.name, role: 'owner', siteIds: null, viaAdmin: true });
    }
  }
  return { list: list.sort((x, y) => x.companyName.localeCompare(y.companyName)), admin, error };
}
