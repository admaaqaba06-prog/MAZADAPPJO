import { describe, it, expect } from 'vitest';
import { restoreLocalAuction } from './localAuctionRollback';

const lot = (id: string, extra: Record<string, any> = {}) => ({ id, status: 'processing', ...extra });

describe('restoreLocalAuction', () => {
  it('puts the captured object back, by reference, at the same index', () => {
    const before = lot('b');
    const prev = [lot('a'), { ...before, status: 'live', isApproved: true }, lot('c')];
    const next = restoreLocalAuction(prev, 'b', before);

    expect(next).toHaveLength(3);
    expect(next[1]).toBe(before);          // the same object, not a copy
    expect(next[1].status).toBe('processing');
    expect((next[1] as any).isApproved).toBeUndefined();
  });

  it('leaves every other entry untouched, by reference', () => {
    const a = lot('a');
    const c = lot('c');
    const before = lot('b');
    const next = restoreLocalAuction([a, { ...before, status: 'live' }, c], 'b', before);
    expect(next[0]).toBe(a);
    expect(next[2]).toBe(c);
  });

  it('matches the target id — not everything else (an inverted match is caught here)', () => {
    const before = lot('b');
    const a = lot('a');
    const next = restoreLocalAuction([a, { ...before, status: 'live' }], 'b', before);
    expect(next[0].id).toBe('a');
    expect(next[1].id).toBe('b');
    expect(next[1]).toBe(before);
    // An inverted predicate would have written `before` over 'a' and left the
    // flipped 'b' in place.
    expect(next[0]).not.toBe(before);
  });

  it('actually restores — a no-op map is caught here', () => {
    const before = lot('b', { title: 'original' });
    const flipped = { ...before, status: 'live', title: 'original' };
    const next = restoreLocalAuction([flipped], 'b', before);
    expect(next[0]).not.toBe(flipped);
    expect(next[0].status).toBe('processing');
  });

  it('is a no-op when nothing was captured', () => {
    const prev = [lot('a')];
    expect(restoreLocalAuction(prev, 'a', undefined)).toBe(prev);
    expect(restoreLocalAuction(prev, 'a', null)).toBe(prev);
  });

  it('returns the SAME array when the id matches no row', () => {
    // e.g. a lot the admin surface never had locally. Allocating here would
    // re-render the whole panel for nothing.
    const prev = [lot('a'), lot('c')];
    expect(restoreLocalAuction(prev, 'b', lot('b'))).toBe(prev);
  });

  it('survives a null entry', () => {
    const before = lot('b');
    const prev = [null as any, { ...before, status: 'live' }];
    const next = restoreLocalAuction(prev, 'b', before);
    expect(next[0]).toBeNull();
    expect(next[1]).toBe(before);
  });

  it('restores only its own slot, so two rollbacks in flight do not clobber', () => {
    const beforeB = lot('b');
    const beforeC = lot('c');
    const flipped = [lot('a'), { ...beforeB, status: 'live' }, { ...beforeC, status: 'live' }];
    // Each rollback runs as a functional updater against whatever `prev` is
    // current, so applying them in sequence must leave both restored.
    const next = restoreLocalAuction(restoreLocalAuction(flipped, 'b', beforeB), 'c', beforeC);
    expect(next[1]).toBe(beforeB);
    expect(next[2]).toBe(beforeC);
  });
});
