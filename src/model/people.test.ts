import { describe, expect, it } from 'vitest';
import { filterPeople, personAccess, personSites, type Person } from './people';

const sites = [{ id: 'a', name: 'Site Name' }, { id: 'b', name: 'North Garage' }];
const lead: Person = { email: 'lead@company.com', role: 'owner', facility_ids: null, pending: false };
const regional: Person = { email: 'reg@company.com', role: 'manager', facility_ids: null, pending: false };
const manager: Person = { email: 'sam@company.com', role: 'manager', facility_ids: ['b'], pending: true };
const employee: Person = { email: 'pat@company.com', role: 'employee', facility_ids: ['a', 'x'], pending: false };
const all = [lead, regional, manager, employee];
const none = { text: '', access: '' as const, siteId: '' };

describe('people columns', () => {
  it('names the access and the sites', () => {
    expect(all.map(personAccess)).toEqual(['lead', 'regional', 'site-manager', 'employee']);
    expect(personSites(lead, sites)).toBe('All sites');
    expect(personSites(manager, sites)).toBe('North Garage');
    expect(personSites(employee, sites)).toBe('Site Name, 1 other site');
    expect(personSites({ ...employee, facility_ids: [] }, sites)).toBe('No sites');
  });
});

describe('filterPeople', () => {
  it('filters by access, by site (all-site people count everywhere) and by text', () => {
    expect(filterPeople(all, none, sites)).toHaveLength(4);
    expect(filterPeople(all, { ...none, access: 'site-manager' }, sites)).toEqual([manager]);
    expect(filterPeople(all, { ...none, siteId: 'a' }, sites)).toEqual([lead, regional, employee]);
    expect(filterPeople(all, { ...none, text: 'north' }, sites)).toEqual([manager]);
    expect(filterPeople(all, { ...none, text: 'employee' }, sites)).toEqual([employee]);
    expect(filterPeople(all, { text: 'company', access: 'employee', siteId: 'b' }, sites)).toEqual([]);
  });
});
