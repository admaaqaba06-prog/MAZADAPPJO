import { describe, it, expect, vi } from 'vitest';
import {
  bidCountOf,
  canEditDrop,
  canCancelDrop,
  cancelWarnsAboutBids,
  cancelConfirmMessage,
  stripNonEditableKeys,
  isFirstBidPayload,
  NON_EDITABLE_KEYS,
  FIRST_BID_NON_EDITABLE_KEYS,
} from './dropEditability';
import { buildDropPayload, type DropPayloadInput } from './dropPayload';

describe('bidCountOf — fails closed to "has bids" only on real numbers', () => {
  it('reads a numeric count', () => {
    expect(bidCountOf({ totalBids: 3 })).toBe(3);
  });
  it('treats missing, null and non-numeric as zero', () => {
    expect(bidCountOf({})).toBe(0);
    expect(bidCountOf({ totalBids: null })).toBe(0);
    expect(bidCountOf({ totalBids: undefined })).toBe(0);
    expect(bidCountOf({ totalBids: NaN })).toBe(0);
  });
  // Firestore documents are not type-checked at the boundary: a count that
  // arrives as a string must not coerce into "this lot has bids".
  it('does not coerce non-number types that look numeric', () => {
    expect(bidCountOf({ totalBids: '3' as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: true as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: [2] as unknown as number })).toBe(0);
    expect(bidCountOf({ totalBids: {} as unknown as number })).toBe(0);
  });
  it('reads a negative count as zero rather than passing it through', () => {
    expect(bidCountOf({ totalBids: -2 })).toBe(0);
  });
  it('reads a non-finite count as zero', () => {
    expect(bidCountOf({ totalBids: Infinity })).toBe(0);
    expect(bidCountOf({ totalBids: -Infinity })).toBe(0);
  });
});

describe('canEditDrop', () => {
  it('allows editing an upcoming lot with no bids', () => {
    expect(canEditDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
  });
  it('allows editing a live lot that nobody has bid on yet', () => {
    expect(canEditDrop({ status: 'live', totalBids: 0 })).toBe(true);
  });
  it('refuses once a single bid lands', () => {
    expect(canEditDrop({ status: 'live', totalBids: 1 })).toBe(false);
  });
  it('refuses on a finished lot regardless of bids', () => {
    expect(canEditDrop({ status: 'completed', totalBids: 0 })).toBe(false);
    expect(canEditDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
  // settlement.js writes three closing statuses, not two: a lot with real bids
  // and a winner but under reserve closes as 'reserve_not_met'. It has been
  // through settlement, so it is no more editable than a sold one.
  it('refuses on a lot that closed under reserve', () => {
    expect(canEditDrop({ status: 'reserve_not_met', totalBids: 0 })).toBe(false);
    expect(canEditDrop({ status: 'reserve_not_met', totalBids: 4 })).toBe(false);
  });
  // Pre-live review states are not settlement outcomes and stay editable.
  it('still allows editing a lot awaiting or refused review', () => {
    expect(canEditDrop({ status: 'processing', totalBids: 0 })).toBe(true);
    expect(canEditDrop({ status: 'rejected', totalBids: 0 })).toBe(true);
  });
  // Locking an admin out of a lot nobody has bid on is the worse failure, so a
  // junk count must not read as "has bids".
  it('still allows editing when the count is junk rather than a real bid', () => {
    expect(canEditDrop({ status: 'live', totalBids: -1 })).toBe(true);
    expect(canEditDrop({ status: 'live', totalBids: NaN })).toBe(true);
    expect(canEditDrop({ status: 'live' })).toBe(true);
  });
  it('allows editing a lot whose status is missing or unrecognised', () => {
    expect(canEditDrop({ totalBids: 0 })).toBe(true);
    expect(canEditDrop({ status: null, totalBids: 0 })).toBe(true);
    expect(canEditDrop({ status: 'scheduled', totalBids: 0 })).toBe(true);
  });
});

describe('canCancelDrop', () => {
  it('allows cancelling before and during bidding', () => {
    expect(canCancelDrop({ status: 'upcoming', totalBids: 0 })).toBe(true);
    expect(canCancelDrop({ status: 'live', totalBids: 4 })).toBe(true);
  });
  it('refuses on a finished lot — settlement already ran', () => {
    expect(canCancelDrop({ status: 'completed', totalBids: 4 })).toBe(false);
    expect(canCancelDrop({ status: 'ended', totalBids: 0 })).toBe(false);
  });
  it('refuses on a lot that closed under reserve — settlement already ran', () => {
    expect(canCancelDrop({ status: 'reserve_not_met', totalBids: 4 })).toBe(false);
    expect(canCancelDrop({ status: 'reserve_not_met', totalBids: 0 })).toBe(false);
  });
});

describe('cancelWarnsAboutBids', () => {
  it('stays quiet when nobody has bid', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 0 })).toBe(false);
  });
  it('warns as soon as there is a bid to destroy', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: 1 })).toBe(true);
  });
  it('stays quiet on a junk count — no bid to destroy', () => {
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: -1 })).toBe(false);
    expect(cancelWarnsAboutBids({ status: 'live', totalBids: NaN })).toBe(false);
    expect(cancelWarnsAboutBids({ status: 'live' })).toBe(false);
  });
});

describe('cancelConfirmMessage', () => {
  it('asks plainly when there are no bids to destroy', () => {
    expect(cancelConfirmMessage({ status: 'live', totalBids: 0 }, false)).toBe(
      'Cancel this drop and delete it?',
    );
    expect(cancelConfirmMessage({ status: 'live', totalBids: 0 }, true)).toBe(
      'هل تريد إلغاء هذا المزاد وحذفه؟',
    );
  });

  // The count is the whole point of the sentence: an admin about to destroy
  // four people's bids must read the number before they click.
  //
  // The Arabic assertion here previously pinned '4 شخص زايد' — the singular
  // noun with a singular verb, which is wrong for 4. Four falls in Arabic's
  // 3–10 range and takes the plural of paucity with a plural verb. This is a
  // deliberate correction of an existing assertion, not a new expectation
  // bolted onto working behaviour.
  it('states the bid count and what cancelling destroys', () => {
    expect(cancelConfirmMessage({ status: 'live', totalBids: 4 }, false)).toBe(
      '4 people have bid on this. Cancelling removes the auction and their bids. Are you sure?',
    );
    expect(cancelConfirmMessage({ status: 'live', totalBids: 4 }, true)).toBe(
      '4 أشخاص زايدوا على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم. هل أنت متأكد؟',
    );
  });

  it('says "person has" for exactly one bid and "people have" for more', () => {
    expect(cancelConfirmMessage({ totalBids: 1 }, false)).toContain('1 person has bid on this.');
    expect(cancelConfirmMessage({ totalBids: 2 }, false)).toContain('2 people have bid on this.');
  });

  // --- Arabic counted-noun agreement: four ranges, not two -------------------
  // English needs one branch (1 vs many). Arabic needs four, and the verb and
  // the possessive pronoun in the second clause have to agree with each.

  it('uses the singular for exactly one bidder', () => {
    // "واحد" carries the count, so the numeral is NOT repeated in front of it.
    expect(cancelConfirmMessage({ totalBids: 1 }, true)).toBe(
      'شخص واحد زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداته. هل أنت متأكد؟',
    );
  });

  it('uses the dual — not the plural — for exactly two bidders', () => {
    // Arabic's dual is its own grammatical number: شخصان with the dual verb
    // زايدا and the dual possessive هما. "2 أشخاص" would be wrong.
    expect(cancelConfirmMessage({ totalBids: 2 }, true)).toBe(
      'شخصان زايدا على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهما. هل أنت متأكد؟',
    );
  });

  it('uses the plural of paucity and the plural verb for three to ten', () => {
    expect(cancelConfirmMessage({ totalBids: 5 }, true)).toBe(
      '5 أشخاص زايدوا على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم. هل أنت متأكد؟',
    );
  });

  it('returns to the singular accusative from eleven up', () => {
    // The form that looks wrong to an English reader and is what MSA requires:
    // 15 takes شخصاً (singular, accusative تمييز) with a singular verb.
    expect(cancelConfirmMessage({ totalBids: 15 }, true)).toBe(
      '15 شخصاً زايد على هذا المزاد. الإلغاء سيحذف المزاد ومزايداتهم. هل أنت متأكد؟',
    );
  });

  it('switches form at every boundary of the four ranges', () => {
    // Pins WHERE the branches change, which the per-count assertions above
    // cannot: an off-by-one in any bound leaves them all passing.
    expect(cancelConfirmMessage({ totalBids: 3 }, true)).toContain('3 أشخاص زايدوا');
    expect(cancelConfirmMessage({ totalBids: 10 }, true)).toContain('10 أشخاص زايدوا');
    expect(cancelConfirmMessage({ totalBids: 11 }, true)).toContain('11 شخصاً زايد ');
    expect(cancelConfirmMessage({ totalBids: 100 }, true)).toContain('100 شخصاً زايد ');
  });

  it('names the count in every Arabic branch that does not spell it out', () => {
    for (const bids of [3, 4, 9, 12, 40]) {
      expect(cancelConfirmMessage({ totalBids: bids }, true)).toContain(String(bids));
    }
  });

  it('keeps Arabic numerals Western, matching the rest of the builder', () => {
    for (const bids of [1, 2, 5, 15, 100]) {
      expect(cancelConfirmMessage({ totalBids: bids }, true)).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  // Western-in-Arabic makes formatNumeral and `${n}` identical today, so the
  // exact-string assertions above cannot tell whether the count still routes
  // through the shared formatter. This pins the wiring, not the output.
  it('formats the count with the shared numeral formatter', async () => {
    vi.resetModules();
    vi.doMock('./arabicNumerals', () => ({
      formatNumeral: (value: number | string) => `«${value}»`,
    }));
    try {
      const mod = await import('./dropEditability');
      expect(mod.cancelConfirmMessage({ totalBids: 5 }, true)).toContain('«5» أشخاص زايدوا');
      expect(mod.cancelConfirmMessage({ totalBids: 15 }, true)).toContain('«15» شخصاً زايد ');
      expect(mod.cancelConfirmMessage({ totalBids: 5 }, false)).toContain('«5» people have bid');
    } finally {
      vi.doUnmock('./arabicNumerals');
      vi.resetModules();
    }
  });

  it('ships both languages for every branch — neither is a fallback', () => {
    for (const bids of [0, 1, 5]) {
      const en = cancelConfirmMessage({ totalBids: bids }, false);
      const ar = cancelConfirmMessage({ totalBids: bids }, true);
      expect(ar).not.toBe(en);
      expect(ar).toMatch(/[؀-ۿ]/);
      expect(en).not.toMatch(/[؀-ۿ]/);
    }
  });

  // A junk count is not a bid, so it must not produce "NaN people have bid".
  it('falls back to the plain question on a junk count', () => {
    expect(cancelConfirmMessage({ totalBids: NaN }, false)).toBe('Cancel this drop and delete it?');
    expect(cancelConfirmMessage({ totalBids: -3 }, false)).toBe('Cancel this drop and delete it?');
    expect(cancelConfirmMessage({}, false)).toBe('Cancel this drop and delete it?');
  });
});

describe('stripNonEditableKeys', () => {
  // Built from the REAL creation payload rather than a hand-written object, so
  // a new dangerous key appearing in buildDropPayload shows up here.
  const created = (overrides: Partial<DropPayloadInput> = {}) =>
    buildDropPayload(
      {
        productName: 'iPhone 15 Pro',
        startingPrice: '250',
        channel: 'misc',
        durationSeconds: 1800,
        paymentWindowHours: 24,
        antiSnipeSec: 30,
        startMode: 'scheduled',
        scheduledStartAtMs: 1_700_000_000_000,
        autoRelist: true,
        viewing: 'store',
        viewingPlace: 'Abdoun',
        marketPrice: '400',
        reservePrice: '300',
        vendorName: 'Acme',
        extraPhotoUrls: ['https://example.com/a.jpg'],
        ...overrides,
      },
      1_700_000_000_000,
    );

  it('removes every key an edit may not carry', () => {
    const out = stripNonEditableKeys(created());
    for (const key of NON_EDITABLE_KEYS) {
      // Key ABSENT, not undefined: updateDoc merges by key, and an explicit
      // undefined throws at write time rather than leaving the field alone.
      expect(Object.prototype.hasOwnProperty.call(out, key)).toBe(false);
    }
  });

  // Each of these was in the creation payload with a value that would do real
  // damage if it reached updateDoc.
  it('drops the media keys that a form holding no uploaded URLs would blank', () => {
    const before = created();
    expect(before.videoUrl).toBe('');
    expect(before.thumbnailUrl).toBe('');
    expect(before.mediaUrls).toEqual(['https://example.com/a.jpg']);
    const out = stripNonEditableKeys(before);
    expect('videoUrl' in out).toBe(false);
    expect('thumbnailUrl' in out).toBe(false);
    expect('mediaUrls' in out).toBe(false);
  });

  it('drops the reserve, which lives in auctionSecrets and can never be rehydrated here', () => {
    expect(created().reservePrice).toBe(300);
    expect('reservePrice' in stripNonEditableKeys(created())).toBe(false);
  });

  it('drops the creation-time bidder nulls that would wipe a live leader', () => {
    const before = created();
    expect(before.currentBidderId).toBeNull();
    expect(before.currentBidderName).toBeNull();
    const out = stripNonEditableKeys(before);
    expect('currentBidderId' in out).toBe(false);
    expect('currentBidderName' in out).toBe(false);
  });

  it('keeps everything an edit is FOR', () => {
    const out = stripNonEditableKeys(created());
    expect(out.title).toBe('iPhone 15 Pro');
    expect(out.startingPrice).toBe(250);
    expect(out.minIncrement).toBe(13);
    expect(out.duration).toBe(1800);
    expect(out.paymentWindowHours).toBe(24);
    expect(out.antiSnipeWindowSec).toBe(30);
    expect(out.channel).toBe('misc');
    expect(out.startMode).toBe('scheduled');
    expect(out.autoRelist).toBe(true);
    expect(out.scheduledStartAt).toBe(1_700_000_000_000);
    expect(out.endTime).toBe(1_700_000_000_000 + 1800 * 1000);
    expect(out.marketPrice).toBe(400);
    expect(out.vendorName).toBe('Acme');
    expect(out.viewing).toBe('store');
    expect(out.viewingPlace).toBe('Abdoun');
  });

  it('leaves the caller\'s payload untouched', () => {
    const before = created();
    stripNonEditableKeys(before);
    expect(before.videoUrl).toBe('');
    expect(before.reservePrice).toBe(300);
    expect(Object.prototype.hasOwnProperty.call(before, 'currentBidderId')).toBe(true);
  });

  it('is a no-op on a payload that never had the keys', () => {
    expect(stripNonEditableKeys({ title: 'x' })).toEqual({ title: 'x' });
  });

  // --- the clock, first_bid only ---------------------------------------------
  // The create path never had this bug: buildDropPayload always computes an
  // endTime, and createListing deletes endTime + endsAt when
  // `listingData.startMode === 'first_bid'`. An EDIT goes straight to updateDoc
  // and never passes through createListing, so the strip has to happen here or
  // editing a first_bid lot stamps a deadline on a lot that is supposed to have
  // none — and the closer cron ends it unsold.

  it('strips the clock from a first_bid edit', () => {
    const before = created({ startMode: 'first_bid' });
    // The builder really does emit it — otherwise this test would pass on a
    // payload that never had the key and prove nothing.
    expect(before.endTime).toBe(1_700_000_000_000 + 1800 * 1000);
    const out = stripNonEditableKeys(before);
    expect(Object.prototype.hasOwnProperty.call(out, 'endTime')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'endsAt')).toBe(false);
  });

  it('KEEPS the clock on a scheduled edit — that lot legitimately has a deadline', () => {
    const out = stripNonEditableKeys(created({ startMode: 'scheduled' }));
    expect(out.endTime).toBe(1_700_000_000_000 + 1800 * 1000);
  });

  // buildDropPayload does not emit endsAt today; createListing deletes both, so
  // the mirror deletes both. Fed in by hand because the builder cannot produce it.
  it('strips an endsAt that reaches it, for first_bid only', () => {
    const endsAt = { seconds: 1 };
    expect('endsAt' in stripNonEditableKeys({ startMode: 'first_bid', endsAt })).toBe(false);
    expect(stripNonEditableKeys({ startMode: 'scheduled', endsAt }).endsAt).toBe(endsAt);
  });

  // Fails OPEN to writing the clock, exactly as createListing does: its check is
  // a strict === against the string, so anything else takes the scheduled path.
  it('keeps the clock when startMode is absent or unrecognised', () => {
    expect(stripNonEditableKeys({ endTime: 7 }).endTime).toBe(7);
    expect(stripNonEditableKeys({ startMode: undefined, endTime: 7 }).endTime).toBe(7);
    expect(stripNonEditableKeys({ startMode: 'firstBid', endTime: 7 }).endTime).toBe(7);
    expect(stripNonEditableKeys({ startMode: 'first bid', endTime: 7 }).endTime).toBe(7);
    expect(stripNonEditableKeys({ startMode: 'FIRST_BID', endTime: 7 }).endTime).toBe(7);
  });

  it('still strips the always-forbidden keys from a first_bid edit', () => {
    const out = stripNonEditableKeys(created({ startMode: 'first_bid' }));
    for (const key of NON_EDITABLE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(out, key)).toBe(false);
    }
  });

  it('keeps everything an edit is FOR on a first_bid lot', () => {
    const out = stripNonEditableKeys(created({ startMode: 'first_bid' }));
    expect(out.title).toBe('iPhone 15 Pro');
    expect(out.startingPrice).toBe(250);
    expect(out.duration).toBe(1800);
    expect(out.startMode).toBe('first_bid');
    expect(out.scheduledStartAt).toBe(1_700_000_000_000);
  });

  it('leaves the caller\'s first_bid payload untouched', () => {
    const before = created({ startMode: 'first_bid' });
    stripNonEditableKeys(before);
    expect(before.endTime).toBe(1_700_000_000_000 + 1800 * 1000);
  });
});

describe('isFirstBidPayload — the same strict test createListing applies', () => {
  it('is true only for the exact string', () => {
    expect(isFirstBidPayload({ startMode: 'first_bid' })).toBe(true);
  });
  it('is false for scheduled, missing and near-miss values', () => {
    expect(isFirstBidPayload({ startMode: 'scheduled' })).toBe(false);
    expect(isFirstBidPayload({})).toBe(false);
    expect(isFirstBidPayload({ startMode: null })).toBe(false);
    expect(isFirstBidPayload({ startMode: 'FIRST_BID' })).toBe(false);
    expect(isFirstBidPayload({ startMode: ' first_bid' })).toBe(false);
  });
});

describe('FIRST_BID_NON_EDITABLE_KEYS', () => {
  // Pins the pair createListing deletes. A key added here without the
  // corresponding delete in AppContext (or vice versa) is the drift this catches.
  it('is exactly the two clock keys', () => {
    expect([...FIRST_BID_NON_EDITABLE_KEYS]).toEqual(['endTime', 'endsAt']);
  });
  it('does not overlap the always-forbidden list', () => {
    for (const key of FIRST_BID_NON_EDITABLE_KEYS) {
      expect(NON_EDITABLE_KEYS).not.toContain(key);
    }
  });
});
