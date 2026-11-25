import { describe, expect, it } from 'vitest';
import { needsSetup, setupProblem, setupRows } from './companySetup';

describe('company setup after buying online', () => {
  it('is due while the placeholder site has no address', () => {
    expect(needsSetup([{ name: 'First location', address: null }])).toBe(true);
    expect(needsSetup([{ name: 'First location', address: '1 Main St' }])).toBe(false);
    expect(needsSetup([{ name: 'North Garage', address: null }])).toBe(false);
  });
  it('gives one row per paid location, blanking the placeholder name', () => {
    const rows = setupRows([{ id: 'a', name: 'First location', address: null }], 3);
    expect(rows).toEqual([{ id: 'a', name: '', address: '' }, { name: '', address: '' }, { name: '', address: '' }]);
    expect(setupRows([{ id: 'a', name: 'A', address: 'x' }], null)).toHaveLength(1);
  });
  it('needs the company and the first location; later rows only once started', () => {
    const empty = { name: '', address: '' };
    expect(setupProblem('', [empty])).toMatch(/company name/);
    expect(setupProblem('Company', [{ id: 'a', ...empty }, empty])).toMatch(/Location 1: add its name/);
    expect(setupProblem('Company', [{ id: 'a', name: 'North', address: '' }])).toMatch(/street address/);
    expect(setupProblem('Company', [{ id: 'a', name: 'North', address: '1 Main St' }, empty])).toBeNull();
    expect(setupProblem('Company', [{ id: 'a', name: 'North', address: '1 Main St' }, { name: 'South', address: '' }])).toMatch(/Location 2: add its street address/);
    expect(setupProblem('Company', [{ id: 'a', name: 'North', address: '1' }, { name: 'north', address: '2' }])).toMatch(/Two locations/);
    expect(setupProblem('Company', [{ id: 'a', name: 'First location', address: '1' }])).toMatch(/real name/);
  });
});
