/**
 * Executes the auction card and the showcase's four states.
 *
 * `renderToStaticMarkup` — vitest here is `environment: 'node'`, no jsdom. So
 * these prove what the markup SAYS, which for this section is the whole point:
 * the old marketplace strip could render an "ينتهي قريباً" badge on a lot with
 * no clock and a "كن أول مزايد" badge on a lot with twenty-five bids, because
 * nothing tied either badge to the data behind it.
 *
 * The invariant worth stating once: NO card, in ANY state, may render a `MM:SS`
 * countdown. A landing card is drawn once and never ticks, so a frozen
 * `00:47` is a lie within a minute of paint. Coarse remaining time ("6h 02m")
 * and a categorical "ending soon" both stay approximately true without a timer,
 * and neither costs a per-second re-render of eight cards.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LandingAuction, LandingAuctionsState } from '../useLandingAuctions';
import { landingContent } from '../landingContent';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { LandingAuctionCard } from './LandingAuctionCard';
import { LandingAuctionShowcase } from './LandingAuctionShowcase';
import { LandingHero } from './LandingHero';

const NOW = 1_800_000_000_000;
const AR = landingContent.ar;
const EN = landingContent.en;

/** A `first_bid` lot: no bids, no clock. The launch catalogue's normal shape. */
const lot: LandingAuction = {
  id: 'lot-1',
  title: 'iPhone 13 Pro 256GB',
  category: 'Electronics',
  currentPrice: 120,
  totalBids: 0,
  endTime: undefined,
  createdAt: NOW - 60_000,
  featuredRank: 1,
  imageUrl: 'https://firebasestorage.googleapis.com/lot-1.jpg',
  isFeatured: true,
  isVerified: true,
};

function card(auction: Partial<LandingAuction> = {}, lang: 'ar' | 'en' = 'ar') {
  const copy = lang === 'ar' ? AR.marketplace : EN.marketplace;
  return renderToStaticMarkup(
    <LandingAuctionCard
      auction={{ ...lot, ...auction }}
      lang={lang}
      copy={copy}
      now={NOW}
      onView={() => {}}
    />
  );
}

function state(over: Partial<LandingAuctionsState> = {}): LandingAuctionsState {
  return { auctions: [], isLoading: false, isEmpty: false, isError: false, ...over };
}

function showcase(over: Partial<LandingAuctionsState> = {}, lang: 'ar' | 'en' = 'ar') {
  const copy = lang === 'ar' ? AR.marketplace : EN.marketplace;
  return renderToStaticMarkup(
    <LandingAuctionShowcase
      state={state(over)}
      lang={lang}
      copy={copy}
      now={NOW}
      onView={() => {}}
      onSell={() => {}}
    />
  );
}

describe('LandingAuctionCard — the real lot', () => {
  it('renders the lot’s own title, category and price', () => {
    const html = card();
    expect(html).toContain('iPhone 13 Pro 256GB');
    expect(html).toContain('إلكترونيات'); // categoryLabel('Electronics', ar)
    expect(html).toContain('120');
    expect(html).toContain('د.أ');
  });

  it('gives the photo the lot’s title as alt text', () => {
    expect(card()).toContain('alt="iPhone 13 Pro 256GB"');
  });

  it('binds its action to its own id, never to a fixed or fallback one', () => {
    expect(card()).toContain('data-auction-id="lot-1"');
    expect(card({ id: 'lot-99' })).toContain('data-auction-id="lot-99"');
  });

  it('names its action for a screen reader', () => {
    expect(card()).toContain(`aria-label="${AR.marketplace.viewCta}: iPhone 13 Pro 256GB"`);
  });

  it('renders English copy with no Arabic leaking through', () => {
    const html = card({}, 'en');
    expect(html).toContain('Electronics');
    expect(html).toContain('JOD');
    expect(html).toContain(EN.marketplace.firstBidLabel);
    expect(html).not.toMatch(/[؀-ۿ]/);
  });
});

describe('LandingAuctionCard — the first-bid state', () => {
  it('labels a clockless, bid-less lot and explains why there is no timer', () => {
    const html = card({ totalBids: 0, endTime: undefined });
    expect(html).toContain(AR.marketplace.firstBidLabel);
    expect(html).toContain(AR.marketplace.firstBidHint);
    expect(html).not.toMatch(/\d\d:\d\d/);
    expect(html).not.toContain(AR.marketplace.endingSoonLabel);
  });

  it('renders no countdown for the endTime shapes a clockless doc can carry', () => {
    for (const endTime of [undefined, null, 0, NaN, -1, Infinity] as any[]) {
      const html = card({ totalBids: 0, endTime });
      expect(html, `endTime=${String(endTime)} must not render a clock`)
        .not.toContain('data-card-clock');
      expect(html).toContain(AR.marketplace.firstBidLabel);
    }
  });

  it('stops claiming a first bid the moment one lands', () => {
    const html = card({ totalBids: 1, endTime: undefined });
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
    expect(html).not.toContain(AR.marketplace.firstBidHint);
  });

  it('makes no time claim for a bidded lot whose clock it cannot see', () => {
    // A started `first_bid` lot is stamped with `endsAt`, which this shape does
    // not carry. Silence is correct; inventing "ending soon" is not.
    const html = card({ totalBids: 4, endTime: undefined });
    expect(html).not.toContain('data-card-clock');
    expect(html).not.toContain(AR.marketplace.endingSoonLabel);
  });

  it('shows the current-bid framing once bidding has started', () => {
    // `priceLabel` from utils/bidLabels — the same words the auction room uses.
    const html = card({ totalBids: 4, endTime: undefined });
    expect(html).toContain('المزايدة الحالية');
  });
});

describe('LandingAuctionCard — the clocked state', () => {
  // `data-card-clock` marks the one element allowed to make a time claim.
  // Asserting on it beats searching the markup for digits, which collides with
  // every Tailwind class that ends in a number.
  it('shows coarse remaining time for a lot ending in hours, never MM:SS', () => {
    const html = card({ totalBids: 2, endTime: NOW + 6 * 3600_000 + 120_000 });
    expect(html).toContain('data-card-clock');
    // Western digits with Arabic unit letters: the price beside it reads `120
    // د.أ`, and `utils/arabicNumerals.ts` fixes ARABIC_UI_DIGITS at 'western'
    // so a number does not change shape with the language.
    expect(html).toContain('6س 02د');
    expect(html).not.toMatch(/\d\d:\d\d/);
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
  });

  it('formats the same lot in English units', () => {
    expect(card({ totalBids: 2, endTime: NOW + 6 * 3600_000 + 120_000 }, 'en'))
      .toContain('6h 02m');
  });

  it('shows the ending-soon badge instead of a stale second-by-second clock', () => {
    const html = card({ totalBids: 2, endTime: NOW + 45_000 });
    expect(html).toContain(AR.marketplace.endingSoonLabel);
    expect(html).toContain('data-card-clock');
    expect(html).not.toMatch(/\d\d:\d\d/);
  });

  it('never renders a countdown for a clock that has already passed', () => {
    // Curation drops expired lots, but a card must not depend on that: the page
    // can outlive its fetch by minutes, and `now` advances while it sits open.
    const html = card({ totalBids: 2, endTime: NOW - 60_000 });
    expect(html).not.toContain('data-card-clock');
    expect(html).not.toContain(AR.marketplace.endingSoonLabel);
    expect(html).not.toMatch(/\d\d:\d\d/);
  });

  it('makes no time claim at the exact instant the clock expires', () => {
    expect(card({ totalBids: 2, endTime: NOW })).not.toContain('data-card-clock');
  });
});

describe('LandingAuctionCard — truthfulness of the badges', () => {
  it('shows the reviewed-listing badge only when the flag is set', () => {
    expect(card({ isVerified: true })).toContain(AR.marketplace.verifiedLabel);
    expect(card({ isVerified: false })).not.toContain(AR.marketplace.verifiedLabel);
  });

  it('renders a stable placeholder for a lot with no photo', () => {
    const html = card({ imageUrl: '' });
    expect(html).not.toContain('src=""');
    expect(html).toContain('data-card-image-fallback');
    expect(html).toContain('iPhone 13 Pro 256GB');
  });

  it('renders no bidder counts, watcher counts, or invented activity', () => {
    const html = card({ totalBids: 4, endTime: NOW + 6 * 3600_000 }).toLowerCase();
    for (const ghost of ['watching', 'watcher', 'bidder', 'unsplash', 'rolex']) {
      expect(html, `card must not render "${ghost}"`).not.toContain(ghost);
    }
  });
});

describe('LandingAuctionShowcase — states', () => {
  it('renders exactly four stable skeletons while loading, with no product data', () => {
    const html = showcase({ isLoading: true });
    expect((html.match(/data-card-skeleton/g) ?? [])).toHaveLength(4);
    expect(html).not.toContain('iPhone 13 Pro 256GB');
    expect(html).not.toContain(AR.marketplace.firstBidLabel);
    expect(html).not.toContain(AR.marketplace.emptyTitle);
  });

  it('renders one card per real lot, in the order curation supplied', () => {
    const html = showcase({
      auctions: [lot, { ...lot, id: 'lot-2', title: 'Samsung TV 55"' }],
    });
    expect((html.match(/data-auction-id="/g) ?? [])).toHaveLength(2);
    expect(html.indexOf('data-auction-id="lot-1"'))
      .toBeLessThan(html.indexOf('data-auction-id="lot-2"'));
    expect(html).not.toContain('data-card-skeleton');
  });

  it('invites selling when the catalogue is genuinely empty, and shows no cards', () => {
    const html = showcase({ isEmpty: true });
    expect(html).toContain(AR.marketplace.emptyTitle);
    expect(html).toContain(AR.marketplace.emptyBody);
    expect(html).toContain(AR.marketplace.emptyCta);
    expect(html).not.toContain('data-auction-id');
    expect(html).not.toContain('data-card-skeleton');
  });

  it('explains a load failure without blanking the section or faking stock', () => {
    const html = showcase({ isError: true });
    expect(html).toContain(AR.marketplace.errorTitle);
    expect(html).toContain(AR.marketplace.errorBody);
    expect(html).not.toContain('data-auction-id');
    expect(html).not.toContain('data-card-skeleton');
    // An error is not an empty catalogue, and must not be dressed as one.
    expect(html).not.toContain(AR.marketplace.emptyTitle);
  });

  it('keeps the section heading in every state, so the page never loses its shape', () => {
    for (const s of [{ isLoading: true }, { isEmpty: true }, { isError: true }, { auctions: [lot] }]) {
      expect(showcase(s), JSON.stringify(s)).toContain(AR.marketplace.title);
    }
  });

  it('anchors the section at the id the header links to', () => {
    expect(showcase({ auctions: [lot] })).toContain('id="auctions"');
  });

  it('groups the cards as a list, so a screen reader can count them', () => {
    const html = showcase({ auctions: [lot, { ...lot, id: 'lot-2' }] });
    expect(html).toContain('<ul');
    expect((html.match(/<li/g) ?? [])).toHaveLength(2);
  });

  it('renders English copy with no Arabic leaking through', () => {
    const html = showcase({ auctions: [lot] }, 'en');
    expect(html).toContain(EN.marketplace.title);
    expect(html).not.toMatch(/[؀-ۿ]/);
  });
});

// ---------------------------------------------------------------------------
// The hero and the cards must agree about the same lot.
//
// Both surfaces answer "is this lot still waiting for its first bid?", and for
// one commit each carried its own copy of the rule. Two copies do not fail
// loudly: they fail as a hero panel saying "Be the first" beside a card for the
// same lot showing a clock, which no test of either component alone can see.
// Both now read `isAwaitingFirstLandingBid`, and this is what holds them there.
// ---------------------------------------------------------------------------
describe('the hero and the auction card never disagree about a lot', () => {
  const heroFor = (over: Partial<LandingAuction>) =>
    renderToStaticMarkup(
      <LandingHero
        lang="ar"
        copy={AR.hero}
        firstBidLabel={AR.marketplace.firstBidLabel}
        firstBidHint={AR.marketplace.firstBidHint}
        auction={{ ...lot, ...over }}
        isLoading={false}
        onBrowse={() => {}}
        onSell={() => {}}
        onAuctionView={() => {}}
      />
    );

  // Every endTime a doc can carry, crossed with bidded and un-bidded.
  const shapes: Array<Partial<LandingAuction>> = [];
  for (const endTime of [undefined, null, 0, NaN, -1, Infinity, NOW + 60_000, NOW - 60_000] as any[]) {
    for (const totalBids of [0, 3]) shapes.push({ endTime, totalBids });
  }

  for (const shape of shapes) {
    const name = `endTime=${String(shape.endTime)} totalBids=${shape.totalBids}`;
    it(`agrees on the first-bid state for ${name}`, () => {
      const inHero = heroFor(shape).includes(AR.marketplace.firstBidLabel);
      const inCard = card(shape).includes(AR.marketplace.firstBidLabel);
      expect(inHero, `hero and card disagree for ${name}`).toBe(inCard);
    });
  }

  it('covers both answers, so the agreement is not vacuous', () => {
    // Without this, a hero and a card that BOTH always hid the badge would pass
    // every assertion above.
    expect(heroFor({ endTime: undefined, totalBids: 0 })).toContain(AR.marketplace.firstBidLabel);
    expect(heroFor({ endTime: NOW + 60_000, totalBids: 3 })).not.toContain(AR.marketplace.firstBidLabel);
  });
});
