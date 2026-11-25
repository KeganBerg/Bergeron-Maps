import { describe, expect, it } from 'vitest';
import { accessText, accountTotals, adminPane, companySummary, describeHit, hitTitle, mapState, searchAccounts, type AdminCompany, type AdminMap } from './adminAccounts';

const site = (id: string, name: string, maps = 0) => ({ id, name, slug: name.toLowerCase().replace(/ /g, '-'), address: null, maps, published: 0 });
const A: AdminCompany = {
  id: 'a', name: 'Company', created_at: '2026-11-01T00:00:00Z',
  sites: [site('s1', 'Site Name', 2), site('s2', 'North Garage', 1)],
  people: [
    { email: 'lead@company.com', role: 'owner', facility_ids: null, pending: false, last_sign_in: null },
    { email: 'sam@company.com', role: 'manager', facility_ids: ['s2'], pending: true, last_sign_in: null },
  ],
};
const B: AdminCompany = { id: 'b', name: 'Other Company', created_at: '2026-11-02T00:00:00Z', sites: [site('s3', 'Lot')], people: [] };
const map = (over: Partial<AdminMap>): AdminMap => ({
  id: 'abcdef12-0000', name: 'Main lot', company_id: 'a', facility_id: 's1', updated_at: '2026-11-03T00:00:00Z', deleted_at: null, revision: 2, published_maps: null, ...over,
});

describe('searchAccounts', () => {
  it('finds companies, sites (by name or link), people and maps', () => {
    expect(searchAccounts('company', [A, B], []).map((h) => h.key)).toEqual(['ca', 'palead@company.com', 'pasam@company.com', 'cb']);
    expect(searchAccounts('north-garage', [A, B], []).map((h) => h.kind)).toEqual(['site']);
    expect(searchAccounts('main', [A, B], [map({})])[0]).toMatchObject({ kind: 'map', site: { name: 'Site Name' } });
  });
  it('matches a map id only from six characters, so short queries stay readable', () => {
    expect(searchAccounts('abcde', [A], [map({ name: 'X' })])).toEqual([]);
    expect(searchAccounts('abcdef', [A], [map({ name: 'X' })])).toHaveLength(1);
  });
  it('skips maps of companies that are gone', () => {
    expect(searchAccounts('main', [B], [map({})])).toEqual([]);
  });
});

describe('labels', () => {
  it('describes access and publish state in plain words', () => {
    expect(accessText(A.people[0], A.sites)).toBe('Account lead, all sites');
    expect(accessText(A.people[1], A.sites)).toBe('Site manager, North Garage');
    expect(mapState(map({}))).toBe('Draft, not published');
    expect(mapState(map({ published_maps: { revision: 2 } }))).toBe('Published');
    expect(mapState(map({ published_maps: { revision: 1 } }))).toBe('Unpublished changes');
    expect(mapState(map({ deleted_at: '2026-11-04T00:00:00Z' }))).toBe('In Recently deleted');
    expect(companySummary(A)).toBe('2 sites, 2 people');
    expect(companySummary(B)).toBe('1 site, 0 people');
  });
  it('adds up every company', () => {
    expect(accountTotals([A, B])).toEqual({ companies: 2, sites: 3, people: 2, maps: 3 });
  });
});

describe('adminPane', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('opens the company or tool the link names', () => {
    expect(adminPane([A, B], q('company=b'))).toMatchObject({ kind: 'company', company: { id: 'b' }, chosen: true });
    expect(adminPane([A, B], q('tool=backups'))).toEqual({ kind: 'tool', tool: 'backups', chosen: true });
  });
  it('falls back to the first company, or to setup when there are none', () => {
    expect(adminPane([A, B], q('company=gone'))).toMatchObject({ kind: 'company', company: { id: 'a' }, chosen: false });
    expect(adminPane([A, B], q('tool=nonsense'))).toMatchObject({ kind: 'company', chosen: false });
    expect(adminPane([], q(''))).toEqual({ kind: 'tool', tool: 'setup', chosen: false });
  });
});

describe('search hit text', () => {
  it('names the hit and says where it is', () => {
    const [company, lead] = searchAccounts('company', [A], []);
    expect([hitTitle(company), describeHit(company)]).toEqual(['Company', '2 sites, 2 people']);
    expect([hitTitle(lead), describeHit(lead)]).toEqual(['lead@company.com', 'Company, Account lead, all sites']);
    const [m] = searchAccounts('main', [A], [map({})]);
    expect(hitTitle(m)).toBe('Main lot');
    expect(describeHit(m)).toMatch(/^Company, Site Name, Draft, not published, edited /);
  });
});
