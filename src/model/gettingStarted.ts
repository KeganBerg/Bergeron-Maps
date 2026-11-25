/**
 * The account lead's first steps after buying online (worker/accounts.js opens the account with
 * one site called FIRST_SITE_NAME). Shown on the home page until the first map is live, so a new
 * client can set everything up without a call.
 */
export const FIRST_SITE_NAME = 'First location';

export type StartStep = { key: 'name' | 'map' | 'publish' | 'team'; label: string; hint: string; done: boolean };

export function gettingStartedSteps(sites: string[], maps: { publishedAt?: string | null }[]): StartStep[] {
  const named = sites.length > 0 && !sites.includes(FIRST_SITE_NAME);
  return [
    { key: 'name', label: 'Name your site', hint: 'Rename "First location" on Sites & people, and add your other locations.', done: named },
    { key: 'map', label: 'Build your first map', hint: 'Trace a photo of your sketch, or answer four questions and the builder lays out the rows.', done: maps.length > 0 },
    { key: 'publish', label: 'Publish it', hint: 'Edits stay in draft until you publish. Preview first if you like.', done: maps.some((m) => !!m.publishedAt) },
    { key: 'team', label: 'Give your team access', hint: 'Hand out the site code, or add managers by email on Sites & people.', done: false },
  ];
}

/** The checklist shows until a map is live, unless the account lead hides it. */
export function showGettingStarted(steps: StartStep[], hidden: boolean): boolean {
  return !hidden && !steps.find((s) => s.key === 'publish')?.done;
}
