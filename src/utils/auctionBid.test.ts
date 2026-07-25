import { describe, it, expect } from 'vitest';
import { validateCustomBid, resolveActiveAuctionId } from './auctionBid';
describe('validateCustomBid', () => {
  it('accepts amount >= minNext', () => { expect(validateCustomBid(2200, 2200)).toEqual({ ok: true, amount: 2200 }); expect(validateCustomBid(2500, 2200)).toEqual({ ok: true, amount: 2500 }); });
  it('rejects below minNext', () => { expect(validateCustomBid(2100, 2200)).toEqual({ ok: false, reason: 'too_low' }); });
  it('rejects NaN / non-positive', () => { expect(validateCustomBid(NaN, 2200)).toEqual({ ok: false, reason: 'invalid' }); expect(validateCustomBid(0, 100)).toEqual({ ok: false, reason: 'invalid' }); });
});
describe('resolveActiveAuctionId', () => {
  const lots = [{ id: 'a' }, { id: 'b' }];
  it('keeps a matching id', () => expect(resolveActiveAuctionId('b', lots)).toBe('b'));
  it('falls back to first live lot when id does not match (e.g. placeholder)', () => expect(resolveActiveAuctionId('auction-rolex', lots)).toBe('a'));
  it('handles empty', () => { expect(resolveActiveAuctionId('auction-rolex', [])).toBe(null); expect(resolveActiveAuctionId(null, lots)).toBe('a'); });
});
