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
}

export interface SessionState {
  loading: boolean;
  session: Session | null;
  email: string | null;
  memberships: Membership[];
  isAdmin: boolean;
  error: string | null;
  reload: () => void;
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
    Promise.all([
      supabase.from('memberships').select('company_id, role, facility_ids, companies(name)').eq('user_id', userId),
      supabase.rpc('is_platform_admin'),
    ]).then(([m, a]) => {
      if (!alive) return;
      if (m.error) setError(m.error.message);
      const rows = (m.data ?? []) as unknown as { company_id: string; role: Role; facility_ids: string[] | null; companies: { name: string } | null }[];
      setMemberships(
        rows
          .map((r) => ({ companyId: r.company_id, companyName: r.companies?.name ?? 'Company', role: r.role, siteIds: r.facility_ids }))
          .sort((x, y) => x.companyName.localeCompare(y.companyName)),
      );
      setIsAdmin(a.data === true);
      setLoadedFor(`${userId}:${tick}`);
    });
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  return {
    loading: !ready || (!!userId && loadedFor !== `${userId}:${tick}`),
    session,
    email: session?.user.email ?? null,
    memberships,
    isAdmin,
    error,
    reload,
  };
}
