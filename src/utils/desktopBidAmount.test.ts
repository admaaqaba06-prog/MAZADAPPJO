// Which amount the DESKTOP bid CTA will send.
//
// This is a money path. The rule that matters most here: when the field holds
// something invalid, the CTA must NOT quietly fall back to the minimum. Typing
// 5 and having the button bid 145 is a real financial surprise, and the confirm
// dialog would show the right number too late to be a warning.
import { describe, it, expect } from 'vitest';
import { chooseBidAmount } from './desktopBidAmount';

const MIN = 145;

describe('chooseBidAmount — empty field', () => {
  it('falls back to the minimum next bid and can bid', () => {
    for (const empty of ['', '   ', '\t']) {
      const r = chooseBidAmount(empty, MIN);
      expect(r.amount, JSON.stringify(empty)).toBe(MIN);
      expect(r.isCustom).toBe(false);
      expect(r.canBid).toBe(true);
      expect(r.error).toBeNull();
    }
  });
});

describe('chooseBidAmount — a valid custom amount', () => {
  it('takes the typed amount', () => {
    const r = chooseBidAmount('200', MIN);
    expect(r.amount).toBe(200);
    expect(r.isCustom).toBe(true);
    expect(r.canBid).toBe(true);
    expect(r.error).toBeNull();
  });

  it('accepts exactly the minimum', () => {
    const r = chooseBidAmount(String(MIN), MIN);
    expect(r.amount).toBe(MIN);
    expect(r.canBid).toBe(true);
    expect(r.error).toBeNull();
    // Typed, even though it equals the default — the label must not imply
    // otherwise.
    expect(r.isCustom).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(chooseBidAmount('  200  ', MIN).amount).toBe(200);
  });
});

describe('chooseBidAmount — invalid entries never bid', () => {
  it('BLOCKS a below-minimum amount instead of silently bidding the minimum', () => {
    // The whole point. A silent fallback here bids 145 when the user asked for 5.
    const r = chooseBidAmount('5', MIN);
    expect(r.canBid).toBe(false);
    expect(r.error).toBe('too_low');
  });

  it('blocks junk, zero and negatives', () => {
    for (const bad of ['abc', '0', '-10', '1e', '--5', 'NaN', '.']) {
      const r = chooseBidAmount(bad, MIN);
      expect(r.canBid, bad).toBe(false);
      expect(r.error, bad).toBe('invalid');
    }
  });

  it('blocks a non-finite value', () => {
    expect(chooseBidAmount('Infinity', MIN).canBid).toBe(false);
  });

  it('never reports an amount above what was typed when blocked', () => {
    // Defence in depth: even the label must not advertise an amount the user
    // did not ask for while the entry is invalid.
    const r = chooseBidAmount('5', MIN);
    expect(r.isCustom).toBe(false);
  });
});

describe('chooseBidAmount — the minimum moving underneath it', () => {
  it('re-blocks a previously valid amount when the minimum rises past it', () => {
    // A rival bids while the field sits typed. The CTA must stop offering it.
    expect(chooseBidAmount('150', 145).canBid).toBe(true);
    expect(chooseBidAmount('150', 160).canBid).toBe(false);
    expect(chooseBidAmount('150', 160).error).toBe('too_low');
  });
});

describe('chooseBidAmount — decimals', () => {
  it('accepts a decimal at or above the minimum', () => {
    expect(chooseBidAmount('145.5', MIN).canBid).toBe(true);
    expect(chooseBidAmount('145.5', MIN).amount).toBe(145.5);
  });

  it('blocks a decimal below the minimum', () => {
    expect(chooseBidAmount('144.99', MIN).canBid).toBe(false);
  });
});
