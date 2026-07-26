import { describe, expect, it } from 'vitest';
import { mapAuctionDocFull, PLACEHOLDER_MEDIA } from './auctionDocMap';

// A representative "fully populated" doc as the broad listener would see it.
const fullDoc = {
  title: 'Rolex Submariner',
  description: 'Mint condition, box + papers',
  category: 'Luxury',
  condition: 'used',
  startingPriceFils: 500000, // 500 JOD
  currentPriceFils: 750000, // 750 JOD
  minIncrementFils: 25000, // 25 JOD
  currentBidderId: 'bidder-9',
  currentBidderName: 'Sami',
  videoUrl: 'https://cdn.example.com/lot.mp4',
  thumbnailUrl: 'https://cdn.example.com/lot.jpg',
  mediaUrls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  duration: 7200,
  sellerId: 'seller-42',
  sellerName: 'Amman Watches',
  sellerLogo: 'https://cdn.example.com/logo.png',
  status: 'live',
  isFeatured: true,
  totalBids: 12,
  viewersCount: 88,
  reserveMet: true,
  marketPrice: 900,
  endsAt: 2000000000000,
  createdAt: 1700000000000,
};

describe('mapAuctionDocFull — full doc', () => {
  const item = mapAuctionDocFull('auction-abc', fullDoc);

  it('applies the passed id', () => {
    expect(item.id).toBe('auction-abc');
  });

  it('maps the static string fields verbatim', () => {
    expect(item.title).toBe('Rolex Submariner');
    expect(item.description).toBe('Mint condition, box + papers');
    expect(item.category).toBe('Luxury');
    expect(item.condition).toBe('used');
    expect(item.sellerId).toBe('seller-42');
    expect(item.sellerName).toBe('Amman Watches');
    expect(item.sellerLogo).toBe('https://cdn.example.com/logo.png');
    expect(item.status).toBe('live');
  });

  it('maps live/bidding fields', () => {
    expect(item.currentBidderId).toBe('bidder-9');
    expect(item.currentBidderName).toBe('Sami');
    expect(item.totalBids).toBe(12);
    expect(item.viewersCount).toBe(88);
    expect(item.reserveMet).toBe(true);
    expect(item.isFeatured).toBe(true);
    expect(item.duration).toBe(7200);
  });

  it('converts *Fils price fields to units (÷1000)', () => {
    expect(item.startingPrice).toBe(500);
    expect(item.currentPrice).toBe(750);
    expect(item.minIncrement).toBe(25);
  });

  it('resolves endTime from endsAt', () => {
    expect(item.endTime).toBe(2000000000000);
  });

  it('keeps a direct network videoUrl', () => {
    expect(item.videoUrl).toBe('https://cdn.example.com/lot.mp4');
  });

  it('uses the doc thumbnail for both thumbnailUrl and imageUrl', () => {
    expect(item.thumbnailUrl).toBe('https://cdn.example.com/lot.jpg');
    expect((item as any).imageUrl).toBe('https://cdn.example.com/lot.jpg');
  });

  it('passes through extra doc fields via the spread', () => {
    expect(item.mediaUrls).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ]);
    expect(item.marketPrice).toBe(900);
    expect((item as any).createdAt).toBe(1700000000000);
  });
});

describe('mapAuctionDocFull — sparse doc (defaults/fallbacks)', () => {
  const before = Date.now();
  const item = mapAuctionDocFull('lot-1', {});
  const after = Date.now();

  it('falls back missing strings to their defaults', () => {
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.category).toBe('Luxury');
    expect(item.sellerId).toBe('seller-system');
    expect(item.sellerName).toBe('Seller JO');
    expect(item.status).toBe('live');
  });

  it('falls back missing prices to 0 / default increment', () => {
    expect(item.startingPrice).toBe(0);
    expect(item.currentPrice).toBe(0);
    expect(item.minIncrement).toBe(10);
  });

  it('falls back missing bidder + count fields', () => {
    expect(item.currentBidderId).toBeNull();
    expect(item.currentBidderName).toBeNull();
    expect(item.totalBids).toBe(0);
    expect(item.viewersCount).toBe(0);
    expect(item.isFeatured).toBe(false);
    expect(item.duration).toBe(3600);
  });

  it('falls back missing media to the bundled placeholder', () => {
    expect(item.thumbnailUrl).toBe(PLACEHOLDER_MEDIA);
    expect((item as any).imageUrl).toBe(PLACEHOLDER_MEDIA);
    expect(item.sellerLogo).toBe(PLACEHOLDER_MEDIA);
    expect(item.videoUrl).toBe('');
  });

  it('defaults a missing endTime to ~1h out', () => {
    expect(item.endTime).toBeGreaterThanOrEqual(before + 3600000);
    expect(item.endTime).toBeLessThanOrEqual(after + 3600000);
  });
});

describe('mapAuctionDocFull — price resolution nuances', () => {
  it('converts the *Fils field (÷1000) when no plain field is present', () => {
    const item = mapAuctionDocFull('x', { startingPriceFils: 120000 });
    expect(item.startingPrice).toBe(120);
  });

  it('uses the plain field when no *Fils field exists', () => {
    const item = mapAuctionDocFull('x', { currentPrice: 42 });
    expect(item.currentPrice).toBe(42);
  });

  it('the raw doc currentPrice overrides the computed value via the trailing spread', () => {
    // Parity note: `...data` spreads AFTER the computed fields, so a doc that
    // carries both currentPriceFils AND a plain currentPrice ends up with the
    // RAW plain value — this mirrors mapAuctionDoc exactly.
    const item = mapAuctionDocFull('x', {
      currentPriceFils: 750000,
      currentPrice: 700,
    });
    expect(item.currentPrice).toBe(700);
  });
});

describe('mapAuctionDocFull — endTime precedence', () => {
  it('resolves endTime from endsAt when the doc has no endTime key', () => {
    const item = mapAuctionDocFull('x', { endsAt: 1900000000000 });
    expect(item.endTime).toBe(1900000000000);
  });

  it('lets a raw endTime field win via the trailing spread when both keys exist', () => {
    // Parity note: resolveEndTime prefers endsAt, but the computed value is set
    // BEFORE `...data`, so a doc carrying a raw `endTime` field overrides it —
    // identical to mapAuctionDoc. endsAt-precedence only applies when the doc has
    // no `endTime` key of its own.
    const item = mapAuctionDocFull('x', {
      endsAt: 1900000000000,
      endTime: 1800000000000,
    });
    expect(item.endTime).toBe(1800000000000);
  });

  it('uses endTime when endsAt is absent', () => {
    const item = mapAuctionDocFull('x', { endTime: 1850000000000 });
    expect(item.endTime).toBe(1850000000000);
  });

  it('parses a Firestore Timestamp-like {seconds} endsAt', () => {
    const item = mapAuctionDocFull('x', { endsAt: { seconds: 1900000000 } });
    expect(item.endTime).toBe(1900000000 * 1000);
  });
});

describe('mapAuctionDocFull — media edge cases', () => {
  it('replaces a blob: thumbnail with the placeholder (wins over the spread)', () => {
    const item = mapAuctionDocFull('x', { thumbnailUrl: 'blob:abc-123' });
    expect(item.thumbnailUrl).toBe(PLACEHOLDER_MEDIA);
    expect((item as any).imageUrl).toBe(PLACEHOLDER_MEDIA);
  });

  it('falls back to imageUrl when thumbnailUrl is absent', () => {
    const item = mapAuctionDocFull('x', { imageUrl: 'https://cdn.example.com/i.jpg' });
    expect(item.thumbnailUrl).toBe('https://cdn.example.com/i.jpg');
    expect((item as any).imageUrl).toBe('https://cdn.example.com/i.jpg');
  });

  it('produces an empty videoUrl when the doc has no videoUrl key', () => {
    // The pre-resolution '' fallback only surfaces when the doc carries no
    // videoUrl key (nothing for the trailing `...data` spread to override with).
    const item = mapAuctionDocFull('x', {});
    expect(item.videoUrl).toBe('');
  });

  it('keeps a raw blob: videoUrl (the trailing spread overrides the "" fallback)', () => {
    // Parity note: the computed fallback for a blob: URL is '', but `...data`
    // spreads AFTER and re-applies the raw data.videoUrl — mirroring
    // mapAuctionDoc, whose synchronous output was likewise the raw value. The
    // async blob→object-URL resolution then patches this in the caller.
    const item = mapAuctionDocFull('x', { videoUrl: 'blob:abc-123' });
    expect(item.videoUrl).toBe('blob:abc-123');
  });

  it('falls back to createdByName for sellerName when sellerName is absent', () => {
    const item = mapAuctionDocFull('x', { createdByName: 'Concierge Team' });
    expect(item.sellerName).toBe('Concierge Team');
  });
});
