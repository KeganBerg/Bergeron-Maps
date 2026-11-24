/**
 * What the All accounts page shows an admin about one site so that a paid site holding a second,
 * separate location stands out. A company pays per location, and the database caps sites, maps
 * per site and live maps per site, but it can't tell one big site from two small ones: a person
 * has to look. Two live maps is the usual sign, so that gets a flag; the map names sit next to it.
 */
export interface ReviewMap { name: string; facility_id: string; deleted_at: string | null }

export interface SiteReview { mapNames: string[]; flag: string | null }

export function siteReview(site: { id: string; published: number }, maps: ReviewMap[]): SiteReview {
  const mapNames = maps.filter((m) => m.facility_id === site.id && !m.deleted_at).map((m) => m.name);
  const flag = site.published >= 2 ? 'Two live maps: check they show the same location' : null;
  return { mapNames, flag };
}
