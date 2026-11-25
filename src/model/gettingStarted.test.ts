import { describe, expect, it } from 'vitest';
import { FIRST_SITE_NAME, gettingStartedSteps, showGettingStarted } from './gettingStarted';

describe('getting started', () => {
  it('starts with nothing done for a fresh paid account', () => {
    const steps = gettingStartedSteps([FIRST_SITE_NAME], []);
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false]);
    expect(showGettingStarted(steps, false)).toBe(true);
  });
  it('ticks steps off as the account lead works', () => {
    const steps = gettingStartedSteps(['North Garage'], [{ publishedAt: null }]);
    expect(steps.map((s) => s.done)).toEqual([true, true, false, false]);
  });
  it('goes away once a map is live, or when hidden', () => {
    const live = gettingStartedSteps(['North Garage'], [{ publishedAt: '2026-11-24T00:00:00Z' }]);
    expect(showGettingStarted(live, false)).toBe(false);
    expect(showGettingStarted(gettingStartedSteps([FIRST_SITE_NAME], []), true)).toBe(false);
  });
});
