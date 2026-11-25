/**
 * The people table on Sites and people: what each column says about a
 * person, and the filters above it. Pure functions, so they're unit tested.
 */
export type PersonAccess = 'lead' | 'regional' | 'site-manager' | 'employee';

export interface Person { email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean }
export interface NamedSite { id: string; name: string }

export const ACCESS_NAME: Record<PersonAccess, string> = {
  lead: 'Account lead',
  regional: 'Regional manager',
  'site-manager': 'Site manager',
  employee: 'Employee',
};

export function personAccess(p: Person): PersonAccess {
  if (p.role === 'owner') return 'lead';
  if (p.role === 'manager') return p.facility_ids === null ? 'regional' : 'site-manager';
  return 'employee';
}

/** The sites column. A site manager only sees their own sites; the person's others are counted, not named. */
export function personSites(p: Person, sites: NamedSite[]): string {
  if (p.facility_ids === null) return 'All sites';
  const known = p.facility_ids.map((id) => sites.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
  const others = p.facility_ids.length - known.length;
  return [...known, ...(others ? [`${others} other ${others === 1 ? 'site' : 'sites'}`] : [])].join(', ') || 'No sites';
}

export interface PeopleFilter {
  /** Typed search, already lower case: matches email, access or site names. */
  text: string;
  /** '' for everyone. */
  access: PersonAccess | '';
  /** '' for every site. People with all sites count as being at each one. */
  siteId: string;
}

export function filterPeople<P extends Person>(people: P[], f: PeopleFilter, sites: NamedSite[]): P[] {
  return people.filter((p) => {
    if (f.access && personAccess(p) !== f.access) return false;
    if (f.siteId && p.facility_ids !== null && !p.facility_ids.includes(f.siteId)) return false;
    if (!f.text) return true;
    return [p.email, ACCESS_NAME[personAccess(p)], personSites(p, sites)].some((t) => t.toLowerCase().includes(f.text));
  });
}
