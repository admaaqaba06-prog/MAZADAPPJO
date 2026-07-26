// Shared PURE full-doc mapper for a raw Firestore auction doc → AuctionItem.
//
// This is the synchronous, side-effect-free core of AppContext's `mapAuctionDoc`.
// The broad `auctions` listener (AppContext) builds its base object by calling
// this, then layers on the ASYNC storage video-URL resolution (cache + queue +
// setState) that lives in the AppContext wrapper. The upcoming `useAuctionDoc`
// hook maps a single auction doc through the SAME function so a lot in the
// bidding room resolves field-for-field identically to the broad feed.
//
// PARITY CONTRACT: the object this returns must match the synchronous output of
// `mapAuctionDoc` exactly — same field names, same fallbacks, same `...data`
// override ordering, same post-spread `thumbnailUrl`/`imageUrl` assignment. The
// only field the wrapper resolves further is `videoUrl` (async blob resolution);
// see the note on `videoUrl` below.

import { AuctionItem } from '../types';
import { resolveEndTime, filsToUnits } from './liveAuctionFields';

// Local, bundled "media unavailable" poster. Single source of truth for the
// thumbnail/seller-logo fallback (AppContext re-imports this).
export const PLACEHOLDER_MEDIA = '/placeholder-media.svg';

/**
 * Map a raw Firestore auction doc's data → a full `AuctionItem`, PURELY and
 * SYNCHRONOUSLY. No caching, no async video resolution, no setState — pure
 * input→output. Mirrors AppContext `mapAuctionDoc`'s synchronous object exactly.
 *
 * Field resolution notes (must stay identical to `mapAuctionDoc`):
 * - `thumbnailUrl`/`imageUrl`: `thumbnailUrl || imageUrl || ''`, and any blob:/
 *   empty value falls back to the bundled placeholder. Assigned AFTER the
 *   `...data` spread so they always win.
 * - Every other explicit field is a FALLBACK only: the trailing `...data` spread
 *   overrides it with the raw doc value whenever that key exists on the doc.
 * - `videoUrl`: a direct network URL is kept; a `blob:`/empty URL resolves to ''.
 *   Because `...data` overrides this with the raw `data.videoUrl` when present,
 *   this explicit value only surfaces when the doc has no `videoUrl` key (→ '').
 *   The async blob→object-URL resolution is intentionally NOT here — it is a
 *   side effect owned by the AppContext wrapper / `useAuctionDoc`.
 */
export function mapAuctionDocFull(id: string, data: any): AuctionItem {
  // endTime/price mapping delegates to the shared `liveAuctionFields` helpers so
  // the per-card live-on-visible subscription resolves these identically.
  const endTimeNum = resolveEndTime(data);

  const rawThumbnail = data.thumbnailUrl || data.imageUrl || '';
  let finalThumbnail = rawThumbnail;
  if (!rawThumbnail || rawThumbnail === '' || rawThumbnail.startsWith('blob:')) {
    // Local bundled poster instead of per-category third-party (Unsplash) images.
    finalThumbnail = PLACEHOLDER_MEDIA;
  }

  const startingPrice = filsToUnits(data.startingPriceFils, data.startingPrice, 0);
  const currentPrice = filsToUnits(data.currentPriceFils, data.currentPrice, startingPrice);
  const minIncrement = filsToUnits(data.minIncrementFils, data.minIncrement, 10);

  // Pure synchronous videoUrl: direct network URL kept, blob:/empty → ''.
  const rawVideoUrl = data.videoUrl || '';
  const finalVideoUrl = rawVideoUrl && !rawVideoUrl.startsWith('blob:') ? rawVideoUrl : '';

  const itemWithFallback = {
    id,
    title: data.title || '',
    description: data.description || '',
    category: data.category || 'Luxury',
    startingPrice,
    currentPrice,
    minIncrement,
    currentBidderId: data.currentBidderId || null,
    currentBidderName: data.currentBidderName || null,
    videoUrl: finalVideoUrl,
    endTime: endTimeNum,
    duration: data.duration ?? 3600,
    sellerId: data.sellerId || 'seller-system',
    sellerName: data.sellerName || data.createdByName || 'Seller JO',
    sellerLogo: data.sellerLogo || PLACEHOLDER_MEDIA,
    status: data.status || 'live',
    isFeatured: data.isFeatured ?? false,
    totalBids: data.totalBids ?? 0,
    viewersCount: data.viewersCount ?? 0,
    ...data,
  } as any;

  itemWithFallback.thumbnailUrl = finalThumbnail;
  itemWithFallback.imageUrl = finalThumbnail;
  return itemWithFallback as AuctionItem;
}
