import { useState } from 'react';
import { ACCESS_NAME, filterPeople, personAccess, personSites, type NamedSite, type Person, type PersonAccess } from '../model/people';
import { useMotion } from '../ui/motion';
import { MoreMenu, type MoreItem } from '../ui/MoreMenu';

/**
 * Sites and people: everyone with access as a table (person, access, sites),
 * with filters by access and site. Each row's actions are in its More menu.
 * Narrow screens show each row as a small stacked block (styles.css).
 */
export function PeopleTable<P extends Person>({ people, sites, find, actions }: {
  people: P[] | null;
  sites: NamedSite[];
  /** The page's search box, already lower case. */
  find: string;
  /** What the signed-in person may do to this row. */
  actions: (p: P) => MoreItem[];
}) {
  const [access, setAccess] = useState<PersonAccess | ''>('');
  const [siteId, setSiteId] = useState('');
  const motion = useMotion();
  if (people === null) return <p className="muted">Loading…</p>;
  const shown = filterPeople(people, { text: find, access, siteId }, sites);
  const filtered = !!(find || access || siteId);

  return (
    <>
      <div className="table-filters">
        <select value={access} onChange={(e) => setAccess(e.target.value as PersonAccess | '')} aria-label="Filter by access" data-testid="people-filter-access">
          <option value="">All access</option>
          {(Object.keys(ACCESS_NAME) as PersonAccess[]).map((a) => <option key={a} value={a}>{ACCESS_NAME[a]}</option>)}
        </select>
        {sites.length > 1 && (
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Filter by site" data-testid="people-filter-site">
            <option value="">All sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <span className="muted small" data-testid="people-count">
          {filtered ? `${shown.length} of ${people.length}` : people.length} {people.length === 1 ? 'person' : 'people'}
        </span>
      </div>
      <table className="data-table people-table" data-testid="people-table">
        <thead>
          <tr><th scope="col">Person</th><th scope="col">Access</th><th scope="col">Sites</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody ref={motion}>
          {shown.length === 0 && (
            <tr><td colSpan={4} className="muted small">{filtered ? 'Nobody matches these filters.' : 'Nobody has access yet.'}</td></tr>
          )}
          {shown.map((p) => (
            <tr key={p.email} data-testid={`person-${p.email}`}>
              <td className="cell-person">
                <span className="cell-stack">
                  <strong>{p.email}</strong>
                  {p.pending && <span className="status-tag">Hasn’t signed in yet</span>}
                </span>
              </td>
              <td data-label="Access">{ACCESS_NAME[personAccess(p)]}</td>
              <td data-label="Sites">{personSites(p, sites)}</td>
              <td className="cell-actions"><MoreMenu label={`More for ${p.email}`} testId={`more-${p.email}`} items={actions(p)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
