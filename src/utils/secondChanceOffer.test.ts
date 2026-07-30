import { describe, it, expect } from 'vitest';
import { formatMoney } from './formatMoney';
import {
  offerMillis,
  secondChanceAcceptLabel,
  secondChanceAcceptNote,
  secondChanceSellerNet,
  secondChanceBidderLabel,
  secondChanceOfferIsLive,
  secondChanceSellerNetNote,
  secondChanceTimeLeftLabel,
  secondChanceTotalDue,
  secondChanceViewState,
  SECOND_CHANCE_PENDING_STATUSES,
  SecondChanceOffer,
  SecondChanceStatus,
} from './secondChanceOffer';

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;

const SELLER = 'seller-1';
const BIDDER = 'bidder-9';
const STRANGER = 'nobody-3';

const offerOf = (over: Partial<SecondChanceOffer> = {}): SecondChanceOffer => ({
  status: 'pending_buyer',
  bidderId: BIDDER,
  bidderName: 'أحمد',
  amount: 100,
  defaultedOrderId: 'auction-1',
  expiresAt: { toMillis: () => NOW + 12 * HOUR },
  ...over,
});

const auctionOf = (offer: SecondChanceOffer | null | undefined) => ({
  sellerId: SELLER,
  secondChanceOffer: offer,
});

const ALL_STATUSES: SecondChanceStatus[] = [
  'pending_seller', 'pending_buyer', 'confirmed', 'declined', 'expired',
];

describe('SECOND_CHANCE_PENDING_STATUSES', () => {
  /**
   * This constant IS the hook's Firestore `in` filter. If it stops matching the
   * statuses `secondChanceOfferIsLive` accepts, live offers stop being queried
   * and the card silently never appears.
   */
  it('is exactly the statuses that can still be acted on', () => {
    expect(SECOND_CHANCE_PENDING_STATUSES).toEqual(['pending_seller', 'pending_buyer']);
  });

  it('is frozen — it is passed by reference into a Firestore `in` filter', () => {
    expect(Object.isFrozen(SECOND_CHANCE_PENDING_STATUSES)).toBe(true);
    expect(() => (SECOND_CHANCE_PENDING_STATUSES as any).push('confirmed')).toThrow();
    expect(SECOND_CHANCE_PENDING_STATUSES).toEqual(['pending_seller', 'pending_buyer']);
  });

  it('agrees with secondChanceOfferIsLive across the whole vocabulary', () => {
    for (const status of ALL_STATUSES) {
      const live = secondChanceOfferIsLive(offerOf({ status }), NOW);
      expect(live).toBe(SECOND_CHANCE_PENDING_STATUSES.includes(status));
    }
  });
});

describe('offerMillis', () => {
  it('decodes every timestamp shape the doc can carry', () => {
    expect(offerMillis(NOW)).toBe(NOW);
    expect(offerMillis({ toMillis: () => NOW })).toBe(NOW);
    expect(offerMillis({ seconds: NOW / 1000, nanoseconds: 0 })).toBe(NOW);
    expect(offerMillis({ _seconds: NOW / 1000 })).toBe(NOW);
    expect(offerMillis('2027-01-15T00:00:00.000Z')).toBe(Date.parse('2027-01-15T00:00:00.000Z'));
  });

  it('returns NaN for absent or undecodable values', () => {
    expect(Number.isNaN(offerMillis(null))).toBe(true);
    expect(Number.isNaN(offerMillis(undefined))).toBe(true);
    expect(Number.isNaN(offerMillis('not a date'))).toBe(true);
    expect(Number.isNaN(offerMillis({}))).toBe(true);
  });
});

describe('secondChanceOfferIsLive', () => {
  it('is live only while pending and unexpired', () => {
    expect(secondChanceOfferIsLive(offerOf({ status: 'pending_seller' }), NOW)).toBe(true);
    expect(secondChanceOfferIsLive(offerOf({ status: 'pending_buyer' }), NOW)).toBe(true);
    expect(secondChanceOfferIsLive(offerOf({ status: 'confirmed' }), NOW)).toBe(false);
    expect(secondChanceOfferIsLive(offerOf({ status: 'declined' }), NOW)).toBe(false);
    // Written by a relist reclaiming a lot whose offer was still pending.
    expect(secondChanceOfferIsLive(offerOf({ status: 'expired' }), NOW)).toBe(false);
  });

  it('is dead once now has passed expiresAt (inclusive, like the server)', () => {
    const expiresAt = { toMillis: () => NOW };
    expect(secondChanceOfferIsLive(offerOf({ expiresAt }), NOW)).toBe(false);
    expect(secondChanceOfferIsLive(offerOf({ expiresAt }), NOW + 1)).toBe(false);
    expect(secondChanceOfferIsLive(offerOf({ expiresAt }), NOW - 1)).toBe(true);
  });

  it('fails OPEN on a malformed expiresAt — the server would still accept it', () => {
    expect(secondChanceOfferIsLive(offerOf({ expiresAt: undefined }), NOW)).toBe(true);
    expect(secondChanceOfferIsLive(offerOf({ expiresAt: 'garbage' }), NOW)).toBe(true);
  });

  it('handles a missing offer', () => {
    expect(secondChanceOfferIsLive(null, NOW)).toBe(false);
    expect(secondChanceOfferIsLive(undefined, NOW)).toBe(false);
  });
});

describe('secondChanceViewState — nothing to show', () => {
  it('hides when there is no offer at all', () => {
    expect(secondChanceViewState(auctionOf(null), SELLER, NOW).visible).toBe(false);
    expect(secondChanceViewState({ sellerId: SELLER }, SELLER, NOW).visible).toBe(false);
    expect(secondChanceViewState(null, SELLER, NOW).visible).toBe(false);
    expect(secondChanceViewState(undefined, SELLER, NOW).visible).toBe(false);
  });

  it('hides a decided offer from both parties', () => {
    for (const status of ['confirmed', 'declined', 'expired'] as SecondChanceStatus[]) {
      for (const viewer of [SELLER, BIDDER]) {
        expect(secondChanceViewState(auctionOf(offerOf({ status })), viewer, NOW).visible).toBe(false);
      }
    }
  });

  it('hides an expired offer from both parties', () => {
    const expired = offerOf({ expiresAt: { toMillis: () => NOW - 1 } });
    for (const status of ['pending_seller', 'pending_buyer'] as SecondChanceStatus[]) {
      for (const viewer of [SELLER, BIDDER]) {
        const state = secondChanceViewState(auctionOf({ ...expired, status }), viewer, NOW);
        expect(state.visible).toBe(false);
      }
    }
  });

  it('hides a live offer from everyone who is neither party', () => {
    for (const status of ['pending_seller', 'pending_buyer'] as SecondChanceStatus[]) {
      for (const viewer of [STRANGER, null, undefined, '']) {
        const state = secondChanceViewState(auctionOf(offerOf({ status })), viewer, NOW);
        expect(state.visible).toBe(false);
        expect(state.canAccept).toBe(false);
        expect(state.canDecline).toBe(false);
      }
    }
  });

  it('never matches a party on empty ids — a signed-out viewer is not the seller', () => {
    const anon = { sellerId: '', secondChanceOffer: offerOf({ bidderId: '' }) };
    expect(secondChanceViewState(anon, '', NOW).visible).toBe(false);
    expect(secondChanceViewState(anon, undefined, NOW).visible).toBe(false);
  });
});

describe('secondChanceViewState — pending_seller (bid under the reserve)', () => {
  const auction = auctionOf(offerOf({ status: 'pending_seller' }));

  it('lets the SELLER accept and decline', () => {
    const state = secondChanceViewState(auction, SELLER, NOW);
    expect(state).toEqual({
      visible: true,
      role: 'seller',
      canAccept: true,
      canDecline: true,
      acceptAction: 'seller_accept',
      awaitingOther: false,
    });
  });

  it('lets the RUNNER-UP withdraw but not accept — the seller has not agreed yet', () => {
    const state = secondChanceViewState(auction, BIDDER, NOW);
    expect(state).toEqual({
      visible: true,
      role: 'bidder',
      canAccept: false,
      canDecline: true,
      acceptAction: null,
      awaitingOther: true,
    });
  });
});

describe('secondChanceViewState — pending_buyer (bid cleared the reserve)', () => {
  const auction = auctionOf(offerOf({ status: 'pending_buyer' }));

  it('lets the RUNNER-UP accept and decline', () => {
    const state = secondChanceViewState(auction, BIDDER, NOW);
    expect(state).toEqual({
      visible: true,
      role: 'bidder',
      canAccept: true,
      canDecline: true,
      acceptAction: 'buyer_accept',
      awaitingOther: false,
    });
  });

  /**
   * THE RULING. Above reserve the seller already consented, so a decline here
   * would let them renege on their own price or undo their own acceptance.
   * The server answers `permission-denied`; the UI must not offer it at all.
   */
  it('gives the SELLER no buttons whatsoever — accept AND decline are both off', () => {
    const state = secondChanceViewState(auction, SELLER, NOW);
    expect(state).toEqual({
      visible: true,
      role: 'seller',
      canAccept: false,
      canDecline: false, // the ruling: no decline for the seller above reserve
      acceptAction: null,
      awaitingOther: true,
    });
  });

  it('still hides it once it expires, seller and bidder alike', () => {
    const dead = auctionOf(offerOf({ status: 'pending_buyer', expiresAt: { toMillis: () => NOW - 1 } }));
    expect(secondChanceViewState(dead, SELLER, NOW).visible).toBe(false);
    expect(secondChanceViewState(dead, BIDDER, NOW).visible).toBe(false);
  });
});

describe('secondChanceViewState — exhaustive status x viewer matrix', () => {
  type Want = {
    visible: boolean;
    canAccept: boolean;
    canDecline: boolean;
    acceptAction: 'seller_accept' | 'buyer_accept' | null;
  };
  const DEAD: Want = { visible: false, canAccept: false, canDecline: false, acceptAction: null };

  // Every cell is a LITERAL expectation — never derived from the state under
  // test, so a mutant that is merely self-consistent still fails.
  const expected: Record<string, Want> = {
    'pending_seller|seller': { visible: true, canAccept: true, canDecline: true, acceptAction: 'seller_accept' },
    'pending_seller|bidder': { visible: true, canAccept: false, canDecline: true, acceptAction: null },
    'pending_seller|stranger': DEAD,
    'pending_buyer|seller': { visible: true, canAccept: false, canDecline: false, acceptAction: null },
    'pending_buyer|bidder': { visible: true, canAccept: true, canDecline: true, acceptAction: 'buyer_accept' },
    'pending_buyer|stranger': DEAD,
    'confirmed|seller': DEAD,
    'confirmed|bidder': DEAD,
    'confirmed|stranger': DEAD,
    'declined|seller': DEAD,
    'declined|bidder': DEAD,
    'declined|stranger': DEAD,
    'expired|seller': DEAD,
    'expired|bidder': DEAD,
    'expired|stranger': DEAD,
  };

  for (const status of ALL_STATUSES) {
    for (const [who, id] of [['seller', SELLER], ['bidder', BIDDER], ['stranger', STRANGER]] as const) {
      it(`${status} / ${who}`, () => {
        const state = secondChanceViewState(auctionOf(offerOf({ status })), id, NOW);
        expect({
          visible: state.visible,
          canAccept: state.canAccept,
          canDecline: state.canDecline,
          acceptAction: state.acceptAction,
        }).toEqual(expected[`${status}|${who}`]);
      });
    }
  }

  it('an accept action, when present, matches the status the server expects', () => {
    expect(secondChanceViewState(auctionOf(offerOf({ status: 'pending_seller' })), SELLER, NOW).acceptAction)
      .toBe('seller_accept');
    expect(secondChanceViewState(auctionOf(offerOf({ status: 'pending_buyer' })), BIDDER, NOW).acceptAction)
      .toBe('buyer_accept');
  });
});

describe('secondChanceBidderLabel', () => {
  it('uses the real name when there is one', () => {
    expect(secondChanceBidderLabel('أحمد', true)).toBe('أحمد');
    expect(secondChanceBidderLabel('Ahmad', false)).toBe('Ahmad');
    expect(secondChanceBidderLabel('  Ahmad  ', false)).toBe('Ahmad');
  });

  it('falls back in ARABIC for the empty string the backend deliberately sends', () => {
    expect(secondChanceBidderLabel('', true)).toBe('مزايد');
    expect(secondChanceBidderLabel('   ', true)).toBe('مزايد');
    expect(secondChanceBidderLabel(undefined, true)).toBe('مزايد');
    expect(secondChanceBidderLabel(null, true)).toBe('مزايد');
  });

  it('falls back in English only on the English surface', () => {
    expect(secondChanceBidderLabel('', false)).toBe('Bidder');
  });
});

describe('secondChanceTotalDue', () => {
  it('adds the 5% buyer premium, matching secondChanceOrderMoney', () => {
    expect(secondChanceTotalDue(100)).toBe(105);
    expect(secondChanceTotalDue(250)).toBe(262.5);
    expect(secondChanceTotalDue(1)).toBe(1.05);
    // Fils-level rounding, not a floating-point tail.
    expect(secondChanceTotalDue(33.333)).toBe(35);
  });

  it('returns 0 rather than NaN for a corrupt amount', () => {
    expect(secondChanceTotalDue(0)).toBe(0);
    expect(secondChanceTotalDue(-5)).toBe(0);
    expect(secondChanceTotalDue(undefined)).toBe(0);
    expect(secondChanceTotalDue(null)).toBe(0);
    expect(secondChanceTotalDue(Number.NaN)).toBe(0);
  });
});

describe('secondChanceAcceptNote', () => {
  it('renders the mandated Arabic sentence with the total, and exactly one currency label', () => {
    const note = secondChanceAcceptNote('buyer_accept', 105, true);
    expect(note).toBe('سيتم إنشاء طلب بقيمة 105 د.أ (شامل عمولة المشتري) وتبدأ مهلة الدفع.');
    // No «د.أ د.أ» — formatMoney owns the label, the sentence must not add one.
    expect(note.match(/د\.أ/g)).toHaveLength(1);
  });

  it('uses WESTERN digits in Arabic, never Arabic-Indic', () => {
    const note = secondChanceAcceptNote('buyer_accept', 1234.5, true);
    expect(note).toContain('1,234.5');
    expect(note).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('does NOT claim seller_accept creates an order — the server creates none', () => {
    const note = secondChanceAcceptNote('seller_accept', 105, true);
    expect(note).toBe('سيُعرض على المزايد لتأكيد الشراء بقيمة 105 د.أ. لا يُنشأ طلب قبل تأكيده.');
    // The false claim the reviewer caught: an order being created on accept.
    expect(note).not.toContain('سيتم إنشاء طلب');
  });

  it('keeps the amount in the seller sentence', () => {
    expect(secondChanceAcceptNote('seller_accept', 262.5, true)).toContain('262.5 د.أ');
    expect(secondChanceAcceptNote('seller_accept', 262.5, false)).toContain('262.5 JOD');
  });

  it('labels the currency per language', () => {
    expect(secondChanceAcceptNote('buyer_accept', 105, false)).toContain('105 JOD');
    expect(secondChanceAcceptNote('buyer_accept', 105, false)).not.toContain('د.أ');
  });
});

describe('secondChanceSellerNetNote', () => {
  it('shows the seller what THEY receive — hammer minus 5%, not the buyer total', () => {
    const note = secondChanceSellerNetNote(100, true);
    expect(note).toBe('صافي ما تستلمه: 95 د.أ (بعد عمولة البيع 5%).');
    // 100 is the hammer and 105 is the BUYER's total; neither is the payout.
    expect(note).not.toContain('105');
    expect(note).not.toContain('100 د.أ');
  });

  it('is bilingual', () => {
    expect(secondChanceSellerNetNote(100, false)).toBe('You receive: 95 JOD (after the 5% seller commission).');
  });

  it('uses Western digits in Arabic', () => {
    expect(secondChanceSellerNetNote(2000, true)).toContain('1,900');
    expect(secondChanceSellerNetNote(2000, true)).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('degrades to zero rather than NaN on a corrupt amount', () => {
    expect(secondChanceSellerNetNote(0, true)).toContain('0 د.أ');
    expect(secondChanceSellerNetNote(-5, true)).toContain('0 د.أ');
    expect(secondChanceSellerNetNote(undefined, false)).toContain('0 JOD');
    expect(secondChanceSellerNetNote(Number.NaN, false)).toContain('0 JOD');
  });
});

describe('secondChanceAcceptLabel', () => {
  /**
   * The button is the last thing read before committing. If it carried the
   * buyer's total, the seller would read «صافي ما تستلمه: 95 د.أ» and then tap
   * «اقبل — 105 د.أ» — two numbers contradicting each other at the tap.
   */
  it("the seller's button and the seller's net note carry the SAME number", () => {
    for (const hammer of [100, 250, 33.333, 1]) {
      const label = secondChanceAcceptLabel('seller_accept', hammer, true);
      const note = secondChanceSellerNetNote(hammer, true);
      const net = formatMoney(secondChanceSellerNet(hammer), 'ar');
      expect(label).toContain(net);
      expect(note).toContain(net);
    }
  });

  it("the seller's button never shows the buyer's total", () => {
    const label = secondChanceAcceptLabel('seller_accept', 100, true);
    expect(label).toBe('اقبل — تستلم 95 د.أ');
    expect(label).not.toContain('105');
  });

  it("the buyer's button shows what the buyer pays, unchanged", () => {
    expect(secondChanceAcceptLabel('buyer_accept', 100, true)).toBe('اقبل — 105 د.أ');
    expect(secondChanceAcceptLabel('buyer_accept', 100, false)).toBe('Accept — 105 JOD');
    // Never the seller's net.
    expect(secondChanceAcceptLabel('buyer_accept', 100, true)).not.toContain('95');
  });

  it('is bilingual and uses Western digits in Arabic', () => {
    expect(secondChanceAcceptLabel('seller_accept', 100, false)).toBe('Accept — you receive 95 JOD');
    expect(secondChanceAcceptLabel('seller_accept', 2000, true)).toContain('1,900');
    expect(secondChanceAcceptLabel('seller_accept', 2000, true)).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('degrades to zero rather than NaN on a corrupt amount', () => {
    expect(secondChanceAcceptLabel('seller_accept', undefined, false)).toContain('0 JOD');
    expect(secondChanceAcceptLabel('buyer_accept', Number.NaN, false)).toContain('0 JOD');
  });
});

describe('secondChanceTimeLeftLabel', () => {
  it('renders hh:mm remaining', () => {
    expect(secondChanceTimeLeftLabel(23 * HOUR + 59 * 60 * 1000, true)).toBe('متبقي 23:59');
    expect(secondChanceTimeLeftLabel(23 * HOUR + 59 * 60 * 1000, false)).toBe('23:59 left');
    expect(secondChanceTimeLeftLabel(5 * 60 * 1000, false)).toBe('00:05 left');
  });

  it('says expired at or below zero, and on garbage', () => {
    expect(secondChanceTimeLeftLabel(0, true)).toBe('انتهت مهلة العرض');
    expect(secondChanceTimeLeftLabel(-1, false)).toBe('Offer window expired');
    expect(secondChanceTimeLeftLabel(Number.NaN, false)).toBe('Offer window expired');
  });
});
