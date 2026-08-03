// The app used to INVENT a product photo. createListing picked a stock Unsplash
// image by category keyword when no thumbnail was uploaded, and its else-branch
// was a photo of red Nike sneakers — which is what a Skyworth TV got, because a
// TV was the 'misc' channel, stored 'Fashion', matching none of the keyword
// branches. The discovery card's onError handler independently swapped in a
// stock wristwatch.
//
// Neither was a broken image LINK. The rule now: the app never displays a
// photograph it did not receive for that lot.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('listing images are never fabricated', () => {
  it('has no stock-photo fallback in createListing', () => {
    const src = read('context/AppContext.tsx');
    expect(src).not.toMatch(/photo-1542291026-7eec264c27ff/); // the Nike sneakers
    expect(src).not.toMatch(/if \(!finalThumbnailUrl\)/);
  });

  it('has no stock photo on the discovery card, src or onError', () => {
    const src = read('components/DiscoveryFeedView.tsx');
    expect(src).not.toMatch(/images\.unsplash\.com/);
  });

  it('routes the card through ListingImage', () => {
    expect(read('components/DiscoveryFeedView.tsx')).toMatch(/<ListingImage/);
  });

  it('gives the placeholder a bilingual label rather than a bare box', () => {
    const src = read('components/ui/ListingImage.tsx');
    expect(src).toMatch(/isAr/);
  });

  it('falls back to the placeholder on error, never to another product', () => {
    const src = read('components/ui/ListingImage.tsx');
    // The old handler reassigned currentTarget.src to a stock photo.
    expect(src).not.toMatch(/currentTarget\.src\s*=/);
    expect(src).toMatch(/onError/);
  });

  it('has no stock-photo fallback on ANY lot or order image', () => {
    // The Discovery card and createListing were the two reported symptoms, but
    // the same `|| '<unsplash url>'` pattern was in ten more places: the drop
    // builder's lot pickers, the seller's listing rows, and six order surfaces
    // where it showed the buyer a stock photo of a product they had not won.
    const surfaces = [
      'components/DiscoveryFeedView.tsx',
      'components/DropBuilderView.tsx',
      'components/SellerCenterView.tsx',
      'components/MyOrdersView.tsx',
      'components/MyOrdersList.tsx',
      'components/SoldOrdersList.tsx',
      'components/OrderDetailsView.tsx',
      'components/ProfileView.tsx',
      'components/admin/OrdersLedgerSection.tsx',
      'components/feedback/ReviewPrompt.tsx',
    ];
    for (const f of surfaces) {
      expect(read(f), f).not.toMatch(/(thumbnailUrl|auctionImage)\s*\|\|\s*'https:/);
    }
  });
});
