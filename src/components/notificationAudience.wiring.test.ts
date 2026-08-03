// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./NotificationCenter.tsx', import.meta.url), 'utf8');

describe('notification centre', () => {
  it('offers a Buying and a Selling tab', () => {
    expect(src).toMatch(/'buying'/);
    expect(src).toMatch(/'selling'/);
    expect(src).toMatch(/شرائي/);
    expect(src).toMatch(/مبيعاتي/);
  });

  it('counts a chip with the SAME rule that filters the rows', () => {
    // The drift that makes a badge lie: filtering rows through
    // notificationAudience while counting chips with `n.type === filter` would
    // show "Selling 0" above a list of selling notifications. Both paths must
    // call the same function.
    const calls = src.match(/notificationAudience\(/g) ?? [];
    expect(calls.length, 'row filter + chip count').toBeGreaterThanOrEqual(2);
  });

  it('resolves the audience against orders, not against the type alone', () => {
    // A seller's payout and a buyer's win are both type 'win'.
    expect(src).toMatch(/notificationAudience\(n,\s*currentUser\?\.id,\s*orders\)/);
    expect(src).toMatch(/\borders\b/);
  });

  it('keeps the admin stream on types, unsplit', () => {
    // Admins are doing ops, not shopping; the audience split would only hide
    // half the queue from them.
    expect(src).toMatch(/ADMIN_FILTER_CHIPS[^=]*=\s*\[[^\]]*'admin'/);
    expect(src).not.toMatch(/ADMIN_FILTER_CHIPS[^=]*=\s*\[[^\]]*'selling'/);
  });
});
