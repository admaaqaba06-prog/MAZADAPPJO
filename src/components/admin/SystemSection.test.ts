/**
 * `isBidLocked` — the client-side mirror of `adminEditBlocked()` in
 * firestore.rules.
 *
 * Why this file exists rather than trusting the comment above the function:
 * both bulk tools in SystemSection write `endTime`/`endsAt` to every auction in
 * the collection, and a Firestore batch is atomic. If this predicate disagrees
 * with the rule in the "keep" direction, ONE bid-carrying lot re-enters a
 * 400-doc chunk, the server rejects it, and the whole chunk dies — taking every
 * innocent lot with it. That is precisely the failure the predicate was written
 * to prevent, so "someone later simplifies it" has to be a test failure, not a
 * code review that might not happen.
 *
 * Every expectation below EXCEPT the two noted next was confirmed against the
 * REAL rule, by running the same document through Google's rules evaluator
 * (`firebaserules.googleapis.com` `projects.test`) with the actual REACTIVATE
 * batch payload (`{status, endsAt, endTime}`). `locked: true` means the
 * evaluator returned DENY for that document; `locked: false` means ALLOW. Those
 * are recorded verdicts, not guesses. If you change this predicate, re-run that
 * comparison; do not just edit numbers until the suite goes green.
 *
 * The two exceptions are `Infinity` and `NaN`, which could NOT be verified:
 * neither is expressible in JSON, so the evaluator API rejects any document
 * carrying one ("Number exceeds the range of double"). Their expectations here
 * are therefore chosen on the SAFE side rather than a known verdict, which the
 * asymmetry licenses: wrongly skipping a lot costs one unprocessed lot and a
 * line in the summary, while wrongly keeping a lot the server refuses fails the
 * whole atomic chunk. `Infinity` is expected locked (skip) and `NaN` unlocked
 * only because `NaN > 0` is false in both languages — the one non-finite value
 * where both sides provably agree.
 *
 * The rule being mirrored:
 *   auctionBidCount() > 0
 *     && resource.data.get('isSimulated', false) != true
 *     && <write touches a money/timing key>
 * where auctionBidCount() reads a non-number totalBids as 0 (fails OPEN).
 */

import { describe, it, expect } from 'vitest';
import { isBidLocked } from './SystemSection';
import { bidCountOf } from '../../utils/dropEditability';

describe('isBidLocked — totalBids shapes', () => {
  // [name, doc, locked?] — `locked` is the rules evaluator's recorded verdict.
  const cases: Array<[string, any, boolean]> = [
    ['absent', { status: 'ended' }, false],
    ['null', { totalBids: null }, false],
    ['a string "3"', { totalBids: '3' }, false],
    ['a boolean true', { totalBids: true }, false],
    ['zero', { totalBids: 0 }, false],
    ['negative', { totalBids: -1 }, false],
    ['NaN', { totalBids: NaN }, false],
    ['a positive integer', { totalBids: 3 }, true],
    ['exactly one', { totalBids: 1 }, true],
    ['a float above one', { totalBids: 2.5 }, true],
    ['a float below one', { totalBids: 0.5 }, true],
    ['Infinity', { totalBids: Infinity }, true],
  ];

  it.each(cases)('totalBids %s -> locked=%o', (_name, doc, locked) => {
    expect(isBidLocked(doc)).toBe(locked);
  });

  it('treats a missing document as unlocked rather than throwing', () => {
    // getDocs never yields this, but a predicate that throws inside a
    // .filter() would take the whole tool down, which is the failure mode
    // this module is here to avoid.
    expect(isBidLocked(undefined)).toBe(false);
    expect(isBidLocked(null)).toBe(false);
    expect(isBidLocked({})).toBe(false);
  });

  /**
   * The reason this file cannot be simplified to `bidCountOf(...) > 0`.
   *
   * `bidCountOf` (utils/dropEditability) guards with `Number.isFinite`, so it
   * reports an Infinity count as ZERO bids — "not locked", keep it in the
   * batch. This predicate skips it instead.
   *
   * Note what is and isn't being claimed. The rule's verdict on an Infinity
   * count is UNVERIFIED (see the header — the evaluator API cannot carry the
   * value). The argument is not "the rule denies it" but that the two errors
   * cost different amounts: skipping costs one unprocessed lot, keeping a doc
   * the server refuses costs the entire chunk. Under that asymmetry the
   * unverifiable value belongs on the skip side, and bidCountOf puts it on the
   * other one.
   */
  it('locks an Infinity count, where bidCountOf() would report zero bids', () => {
    const doc = { totalBids: Infinity };

    expect(isBidLocked(doc)).toBe(true);

    // Pin the divergence itself, so this stops being a claim in a comment.
    expect(bidCountOf(doc)).toBe(0);
    expect(bidCountOf(doc) > 0).toBe(false);
    expect(isBidLocked(doc)).not.toBe(bidCountOf(doc) > 0);
  });

  it('agrees with bidCountOf on every finite count, which is what makes the swap tempting', () => {
    for (const n of [0, 1, 3, 2.5, -1]) {
      expect(isBidLocked({ totalBids: n })).toBe(bidCountOf({ totalBids: n }) > 0);
    }
  });
});

describe('isBidLocked — the isSimulated exemption', () => {
  /**
   * Simulated lots are EXEMPT from the rule, so they must stay IN the batch
   * even with bot bids on them. Getting this backwards breaks the simulator
   * cleanup path, which is the main thing these two buttons are for.
   */
  it('does NOT lock a simulated lot that has bids (it stays in the batch)', () => {
    expect(isBidLocked({ totalBids: 3, isSimulated: true })).toBe(false);
    expect(isBidLocked({ totalBids: Infinity, isSimulated: true })).toBe(false);
  });

  const cases: Array<[string, any, boolean]> = [
    ['true (the only exempting value)', { totalBids: 3, isSimulated: true }, false],
    ['false', { totalBids: 3, isSimulated: false }, true],
    ['absent', { totalBids: 3 }, true],
    ['null', { totalBids: 3, isSimulated: null }, true],
    // The rule compares `!= true` against a real boolean, so the STRING 'true'
    // is not the boolean true and does not exempt. Evaluator confirmed DENY.
    ["the string 'true'", { totalBids: 3, isSimulated: 'true' }, true],
    ['1 (truthy but not true)', { totalBids: 3, isSimulated: 1 }, true],
  ];

  it.each(cases)('isSimulated %s -> locked=%o', (_name, doc, locked) => {
    expect(isBidLocked(doc)).toBe(locked);
  });

  it('is irrelevant when there are no bids — nothing is locked either way', () => {
    expect(isBidLocked({ totalBids: 0, isSimulated: true })).toBe(false);
    expect(isBidLocked({ totalBids: 0, isSimulated: false })).toBe(false);
  });
});
