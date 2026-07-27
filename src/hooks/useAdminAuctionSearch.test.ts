import { describe, expect, it } from 'vitest';
import { isAdminSearchActive, normalizeStatusFilter } from './useAdminAuctionSearch';

describe('isAdminSearchActive', () => {
  it('is false for an empty or whitespace-only term (no flag gate)', () => {
    expect(isAdminSearchActive('')).toBe(false);
    expect(isAdminSearchActive('   ')).toBe(false);
    expect(isAdminSearchActive('\t\n')).toBe(false);
  });

  it('is true for any non-empty trimmed term — admin UI has no feature flag', () => {
    expect(isAdminSearchActive('iphone')).toBe(true);
    expect(isAdminSearchActive('  #137  ')).toBe(true);
  });
});

describe('normalizeStatusFilter', () => {
  it('maps null/undefined/empty to undefined (ALL statuses — no facet)', () => {
    expect(normalizeStatusFilter(null)).toBeUndefined();
    expect(normalizeStatusFilter(undefined)).toBeUndefined();
    expect(normalizeStatusFilter([])).toBeUndefined();
  });

  it('passes a specific status set through unchanged (narrowed lookup)', () => {
    expect(normalizeStatusFilter(['completed', 'ended', 'reserve_not_met'])).toEqual([
      'completed',
      'ended',
      'reserve_not_met',
    ]);
    expect(normalizeStatusFilter(['live', 'upcoming'])).toEqual(['live', 'upcoming']);
  });
});
