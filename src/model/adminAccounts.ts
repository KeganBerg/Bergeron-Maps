/**
 * The All accounts page's data (from the admin_overview database function and
 * the maps table) and the rules that turn it into what the page shows:
 * search, totals, who has what access, a map's publish state, and which pane
 * is open. No React here, so it can be unit tested.
 */

export interface AdminSite {
  id: string; name: string; slug: string; address: string | null; maps: number; trashed?: number; published: number; public?: number;
}
export interface AdminPerson {
  user_id?: string | null; email: string; role: 'owner' | 'manager' | 'employee'; facility_ids: string[] | null; pending: boolean; last_sign_in: string | null;
}
export interface AdminRequest { id: string; email: string; facility_id: string; note: string | null; created_at: string }
export interface AdminCompany {
  id: string; name: string; created_at: string; max_sites?: number | null; sites: AdminSite[]; people: AdminPerson[]; requests?: AdminRequest[];
}
export interface AdminMap {
  id: string; name: string; company_id: string; facility_id: string; updated_at: string; deleted_at: string | null; revision: number;
  published_maps: { revision: number } | null;
}

export type Hit =
  | { kind: 'company'; key: string; company: AdminCompany }
  | { kind: 'site'; key: string; company: AdminCompany; site: AdminSite }
  | { kind: 'person'; key: string; company: AdminCompany; person: AdminPerson }
  | { kind: 'map'; key: string; company: AdminCompany; site?: AdminSite; map: AdminMap };

export const KIND_LABEL: Record<Hit['kind'], string> = { company: 'Company', site: 'Site', person: 'Person', map: 'Map' };

/** Everything matching the query (already lower case), across every company: names, link names, emails and map ids. */
export function searchAccounts(q: string, companies: AdminCompany[], maps: AdminMap[]): Hit[] {
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
  const hits: Hit[] = [];
  const byId = new Map(companies.map((c) => [c.id, c]));
  for (const c of companies) {
    if (has(c.name)) hits.push({ kind: 'company', key: `c${c.id}`, company: c });
    for (const site of c.sites) if (has(site.name) || has(site.slug)) hits.push({ kind: 'site', key: `s${site.id}`, company: c, site });
    for (const person of c.people) if (has(person.email)) hits.push({ kind: 'person', key: `p${c.id}${person.email}`, company: c, person });
  }
  for (const map of maps) {
    const company = byId.get(map.company_id);
    if (!company || !(has(map.name) || (q.length >= 6 && map.id.startsWith(q)))) continue;
    hits.push({ kind: 'map', key: `m${map.id}`, company, site: company.sites.find((s) => s.id === map.facility_id), map });
  }
  return hits;
}

export function mapState(m: AdminMap): string {
  if (m.deleted_at) return 'In Recently deleted';
  if (!m.published_maps) return 'Draft, not published';
  return m.published_maps.revision === m.revision ? 'Published' : 'Unpublished changes';
}

/** "Site manager, Site Name": a person's role and the sites it covers. */
export function accessText(p: AdminPerson, sites: AdminSite[]): string {
  const role = p.role === 'owner' ? 'Account lead' : p.role === 'manager' ? (p.facility_ids === null ? 'Regional manager' : 'Site manager') : 'Employee';
  const where = p.facility_ids === null ? 'all sites' : p.facility_ids.map((id) => sites.find((s) => s.id === id)?.name ?? 'a site').join(', ');
  return `${role}, ${where}`;
}

export function accountTotals(companies: AdminCompany[]) {
  return {
    companies: companies.length,
    sites: companies.reduce((n, c) => n + c.sites.length, 0),
    people: companies.reduce((n, c) => n + c.people.length, 0),
    maps: companies.reduce((n, c) => n + c.sites.reduce((m, s) => m + s.maps, 0), 0),
  };
}

/** The admin tools that open in the detail pane instead of a company. */
export const ADMIN_TOOLS = ['setup', 'backups', 'pictures'] as const;
export type AdminTool = (typeof ADMIN_TOOLS)[number];

/**
 * What the detail pane shows, from the page link (#/admin?company=<id> or
 * #/admin?tool=backups). `chosen` is false when the link names nothing that
 * exists: wide screens then show the first company, and phones show the list.
 */
export type AdminPane = { kind: 'company'; company: AdminCompany; chosen: boolean } | { kind: 'tool'; tool: AdminTool; chosen: boolean } | null;

export function adminPane(companies: AdminCompany[], query: URLSearchParams): AdminPane {
  const tool = query.get('tool');
  if (tool && (ADMIN_TOOLS as readonly string[]).includes(tool)) return { kind: 'tool', tool: tool as AdminTool, chosen: true };
  const picked = companies.find((c) => c.id === query.get('company'));
  if (picked) return { kind: 'company', company: picked, chosen: true };
  if (companies.length) return { kind: 'company', company: companies[0], chosen: false };
  return { kind: 'tool', tool: 'setup', chosen: false };
}

/** The list pane's one-line summary of a company. */
export function companySummary(c: AdminCompany): string {
  const sites = `${c.sites.length} ${c.sites.length === 1 ? 'site' : 'sites'}`;
  const people = `${c.people.length} ${c.people.length === 1 ? 'person' : 'people'}`;
  return `${sites}, ${people}`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** A search hit's name: the company, site, email or map it found. */
export function hitTitle(h: Hit): string {
  if (h.kind === 'company') return h.company.name;
  if (h.kind === 'site') return h.site.name;
  if (h.kind === 'person') return h.person.email;
  return h.map.name;
}

/** The line under a search hit that says where it is. */
export function describeHit(h: Hit): string {
  if (h.kind === 'company') return companySummary(h.company);
  if (h.kind === 'site') return `${h.company.name}, ${h.site.maps} ${h.site.maps === 1 ? 'map' : 'maps'}`;
  if (h.kind === 'person') return `${h.company.name}, ${accessText(h.person, h.company.sites)}${h.person.pending ? ' (hasn’t signed in yet)' : ''}`;
  return `${h.company.name}, ${h.site?.name ?? 'a site'}, ${mapState(h.map)}, edited ${shortDate(h.map.updated_at)}`;
}
