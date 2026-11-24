import { describe, expect, it } from 'vitest';
import { cleanName, NAME_MAX, nameProblem } from './names';

describe('company and site names', () => {
  it('tidies spaces', () => {
    expect(cleanName('  Harbor   Garage \n')).toBe('Harbor Garage');
  });

  it('refuses blank and too-long names', () => {
    expect(nameProblem('   ', 'company')).toBe('Enter a company name.');
    expect(nameProblem('', 'site')).toBe('Enter a site name.');
    expect(nameProblem('x'.repeat(NAME_MAX), 'site')).toBeNull();
    expect(nameProblem('x'.repeat(NAME_MAX + 1), 'site')).toMatch(/120 characters/);
  });

  it('refuses a site name another site in the company already has, ignoring case and spacing', () => {
    expect(nameProblem('stadium  lot', 'site', ['Harbor Garage', 'Stadium Lot'])).toMatch(/already called “stadium lot”/);
    expect(nameProblem('North Lot', 'site', ['Harbor Garage', 'Stadium Lot'])).toBeNull();
  });
});
