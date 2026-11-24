import { FIRST_SITE_NAME } from './gettingStarted';

/**
 * The setup screen a buyer sees right after paying online (src/cloud/CompanySetupPage.tsx). The
 * order opens the company with a placeholder site, FIRST_SITE_NAME, and no address; here the account
 * lead names the company and gives each paid location its name and address. An address is set once,
 * then only Bergeron Maps can change it (the database enforces that).
 */
export interface SetupSite { id?: string; name: string; address: string }

/** Setup is due while the placeholder site is still there without an address. */
export function needsSetup(sites: { name: string; address: string | null }[]): boolean {
  return sites.some((s) => s.name === FIRST_SITE_NAME && !s.address);
}

/** One row per paid location: the sites that exist, then empty rows up to the number bought. */
export function setupRows(sites: { id: string; name: string; address: string | null }[], maxSites: number | null): SetupSite[] {
  const rows: SetupSite[] = sites.map((s) => ({ id: s.id, name: s.name === FIRST_SITE_NAME ? '' : s.name, address: s.address ?? '' }));
  const want = Math.max(rows.length, maxSites ?? 1);
  while (rows.length < want) rows.push({ name: '', address: '' });
  return rows;
}

/**
 * The first problem with the form, or null. The company and the first location are required;
 * other locations can wait, but a row that's started needs both its name and address.
 */
export function setupProblem(company: string, rows: SetupSite[]): string | null {
  if (!company.trim()) return 'Add your company name.';
  const names = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const name = r.name.trim(), address = r.address.trim();
    const label = `Location ${i + 1}`;
    if (i === 0 || r.id || name || address) {
      if (!name) return `${label}: add its name.`;
      if (name === FIRST_SITE_NAME) return `${label}: give it its real name.`;
      if (!address) return `${label}: add its street address.`;
    }
    if (name && names.has(name.toLowerCase())) return `Two locations are called “${name}”. Give each its own name.`;
    if (name) names.add(name.toLowerCase());
  }
  return null;
}
