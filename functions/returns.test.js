import { describe, it, expect } from 'vitest';
const { buildReturnClaim, canRequestReturn, RETURN_REASONS } = require('./returns');

describe('buildReturnClaim', () => {
  const ok = { reason: 'damaged', description: 'Screen cracked', photoUrls: ['u1'] };
  it('normalizes a valid claim', () => {
    const c = buildReturnClaim(ok, 1000);
    expect(c).toMatchObject({
      reason: 'damaged', description: 'Screen cracked', photoUrls: ['u1'],
      sellerPaysReturnShipping: true, status: 'open', createdAt: 1000,
    });
  });
  it('rejects a bad reason', () => {
    expect(() => buildReturnClaim({ ...ok, reason: 'changed_mind' }, 1)).toThrow(/reason/i);
  });
  it('rejects empty description', () => {
    expect(() => buildReturnClaim({ ...ok, description: '   ' }, 1)).toThrow(/description/i);
  });
  it('requires at least one photo', () => {
    expect(() => buildReturnClaim({ ...ok, photoUrls: [] }, 1)).toThrow(/photo/i);
  });
  it('rejects more than 6 photos', () => {
    expect(() => buildReturnClaim({ ...ok, photoUrls: Array(7).fill('u') }, 1)).toThrow(/photo/i);
  });
  it('exposes the two reasons', () => {
    expect(RETURN_REASONS).toEqual(['not_as_described', 'damaged']);
  });
});

describe('canRequestReturn', () => {
  it('true only for shipped with no existing claim', () => {
    expect(canRequestReturn({ status: 'shipped' })).toBe(true);
  });
  it('false when not shipped', () => {
    expect(canRequestReturn({ status: 'completed' })).toBe(false);
    expect(canRequestReturn({ status: 'paid' })).toBe(false);
  });
  it('false when a claim already exists', () => {
    expect(canRequestReturn({ status: 'shipped', returnClaim: { status: 'open' } })).toBe(false);
  });
  it('false on null', () => { expect(canRequestReturn(null)).toBe(false); });
});

describe('Wave 3 — the dispute gate is reachable from out_for_delivery', () => {
  it('allows a claim while the item is out for delivery', () => {
    expect(canRequestReturn({ status: 'out_for_delivery' })).toBe(true);
  });

  it('still allows the legacy shipped path', () => {
    expect(canRequestReturn({ status: 'shipped' })).toBe(true);
  });

  it('still refuses states with nothing to claim against', () => {
    expect(canRequestReturn({ status: 'paid' })).toBe(false);
    expect(canRequestReturn({ status: 'preparing_shipment' })).toBe(false);
    expect(canRequestReturn({ status: 'completed' })).toBe(false);
    expect(canRequestReturn({ status: 'delivered' })).toBe(false);
  });

  it('still refuses a second claim on the same order', () => {
    expect(canRequestReturn({ status: 'out_for_delivery', returnClaim: { status: 'open' } })).toBe(false);
  });
});
