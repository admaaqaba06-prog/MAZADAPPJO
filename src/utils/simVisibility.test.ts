import { describe, expect, it } from 'vitest';
import { canSeeSimulated, filterSimulated } from './simVisibility';

const admin = { id: 'a1', role: 'admin' } as const;
const adminByFlag = { id: 'a2', isAdmin: true } as const;
const buyer = { id: 'u1', role: 'user' } as const;
const seller = { id: 's1', role: 'seller', isSeller: true } as const;

const simLot = { id: 'sim-1', isSimulated: true };
const realLot = { id: 'real-1', isSimulated: false };
const unflaggedLot = { id: 'real-2' }; // pre-simulator docs have no flag at all

describe('canSeeSimulated', () => {
  it('is true ONLY for an admin with the simulator toggle ON', () => {
    expect(canSeeSimulated(admin, true)).toBe(true);
    expect(canSeeSimulated(adminByFlag, true)).toBe(true);
  });

  it('is false for an admin when the toggle is OFF', () => {
    expect(canSeeSimulated(admin, false)).toBe(false);
    expect(canSeeSimulated(adminByFlag, false)).toBe(false);
  });

  it('is false for non-admins regardless of the toggle', () => {
    expect(canSeeSimulated(buyer, true)).toBe(false);
    expect(canSeeSimulated(buyer, false)).toBe(false);
    expect(canSeeSimulated(seller, true)).toBe(false);
    expect(canSeeSimulated(seller, false)).toBe(false);
  });

  it('is false for null/undefined/garbage users', () => {
    expect(canSeeSimulated(null, true)).toBe(false);
    expect(canSeeSimulated(undefined, true)).toBe(false);
    expect(canSeeSimulated('admin', true)).toBe(false);
    expect(canSeeSimulated({ email: 'admin@mazad.jo' }, true)).toBe(false);
  });
});

describe('filterSimulated', () => {
  const items = [simLot, realLot, unflaggedLot];

  it('drops isSimulated items for non-admins with the toggle ON', () => {
    expect(filterSimulated(items, buyer, true)).toEqual([realLot, unflaggedLot]);
  });

  it('drops isSimulated items for non-admins with the toggle OFF', () => {
    expect(filterSimulated(items, buyer, false)).toEqual([realLot, unflaggedLot]);
  });

  it('drops isSimulated items for an admin with the toggle OFF', () => {
    expect(filterSimulated(items, admin, false)).toEqual([realLot, unflaggedLot]);
  });

  it('returns the array UNCHANGED (same reference) for admin + toggle ON', () => {
    const result = filterSimulated(items, admin, true);
    expect(result).toBe(items); // identity — avoids re-render churn
  });

  it('always passes items without the flag', () => {
    expect(filterSimulated([unflaggedLot, realLot], buyer, false)).toEqual([unflaggedLot, realLot]);
  });

  it('handles an empty array', () => {
    expect(filterSimulated([], buyer, false)).toEqual([]);
    expect(filterSimulated([], admin, true)).toEqual([]);
  });

  it('returns the same reference when nothing was dropped (memo-friendly)', () => {
    const clean = [realLot, unflaggedLot];
    expect(filterSimulated(clean, buyer, false)).toBe(clean);
  });
});
