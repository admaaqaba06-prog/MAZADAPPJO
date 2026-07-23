import type { AuctionItem } from '../types';
import type { DropCaptionInput } from './dropCaption';
import { buildAuctionUrl } from './deepLink';
import { formatAmmanClock } from './ammanTime';

/**
 * Reconstruct WhatsApp-caption input from a STORED auction, so the drops list
 * can re-post a past drop. This is lossy by design: the auction doc does not
 * persist the free-text spec list, so `specs` is empty here — the caption is
 * still valid and complete, just without the bullet spec block. Only reads
 * fields present on the world-readable auction doc; never touches the reserve.
 */
export function captionInputFromAuction(a: AuctionItem, origin: string): DropCaptionInput {
  const minutes = Math.round((a.duration || 0) / 60);
  return {
    auctionNumber: a.auctionNumber ?? '—',
    startTime: a.scheduledStartAt != null ? formatAmmanClock(a.scheduledStartAt) : '—',
    durationLabel: `${minutes} دقيقة`,
    startingPriceJod: a.startingPrice ?? 0,
    productName: a.title ?? '—',
    specs: [],
    condition: a.condition ?? '',
    deepLink: buildAuctionUrl(a.id, origin),
  };
}
