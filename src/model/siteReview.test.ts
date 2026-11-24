import { describe, expect, it } from 'vitest';
import { siteReview } from './siteReview';

const maps = [
  { name: 'Garage', facility_id: 's1', deleted_at: null },
  { name: 'Old', facility_id: 's1', deleted_at: '2026-11-01' },
  { name: 'Other site map', facility_id: 's2', deleted_at: null },
];

describe('siteReview', () => {
  it('lists the site’s own maps, leaving out deleted ones and other sites', () => {
    expect(siteReview({ id: 's1', published: 1 }, maps).mapNames).toEqual(['Garage']);
  });
  it('flags a site with two live maps only', () => {
    expect(siteReview({ id: 's1', published: 1 }, maps).flag).toBeNull();
    expect(siteReview({ id: 's1', published: 2 }, maps).flag).toMatch(/same location/);
  });
});
