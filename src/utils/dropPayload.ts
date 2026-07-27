import { channelToCategory, type DropChannel } from './dropChannel';
import type { ViewingMode } from './viewing';

/**
 * The exact payload the admin drop builder sends to createListing.
 *
 * Extracted verbatim from AuctionDropBuilderView.handleCreate so the UI
 * rebuild around it can be proven not to change what publishes. `now` is
 * injected rather than read from Date.now() so the shape is testable.
 *
 * Note: `condition` and `specs` are deliberately absent. The current form
 * collects both but uses them only for the WhatsApp caption — they have
 * never reached the auction document. Preserved as-is; changing it is a
 * product decision, not a refactor.
 */

/** Internal vendor slug: lowercase, dashes, keeps Arabic/Latin letters + digits. */
export const slugifyVendor = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export interface DropPayloadInput {
  productName: string;
  startingPrice: string;
  channel: DropChannel;
  durationSeconds: number;
  paymentWindowHours: number;
  antiSnipeSec: number;
  startMode: 'scheduled' | 'first_bid';
  scheduledStartAtMs: number | null;
  autoRelist: boolean;
  viewing: ViewingMode | '';
  viewingPlace: string;
  marketPrice: string;
  reservePrice: string;
  vendorName: string;
  extraPhotoUrls: string[];
}

export function buildDropPayload(
  input: DropPayloadInput,
  now: number,
): Record<string, unknown> {
  const priceNum = Number(input.startingPrice);
  const startAt = input.scheduledStartAtMs ?? now;

  return {
    title: input.productName.trim(),
    description: input.productName.trim(),
    category: channelToCategory(input.channel),
    startingPrice: priceNum,
    minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
    currentBidderId: null,
    currentBidderName: null,
    videoUrl: '',
    thumbnailUrl: '',
    endTime: startAt + input.durationSeconds * 1000,
    duration: input.durationSeconds,
    paymentWindowHours: input.paymentWindowHours,
    antiSnipeWindowSec: input.antiSnipeSec,
    antiSnipeExtendSec: input.antiSnipeSec,
    channel: input.channel,
    startMode: input.startMode,
    autoRelist: input.autoRelist,
    scheduledStartAt: startAt,
    soldByMazad: true,
    ...(input.viewing ? { viewing: input.viewing } : {}),
    ...(input.viewing === 'store' && input.viewingPlace.trim()
      ? { viewingPlace: input.viewingPlace.trim() }
      : {}),
    ...(input.extraPhotoUrls.length > 0 ? { mediaUrls: input.extraPhotoUrls } : {}),
    ...(Number(input.marketPrice) > 0 ? { marketPrice: Number(input.marketPrice) } : {}),
    ...(Number(input.reservePrice) > 0 ? { reservePrice: Number(input.reservePrice) } : {}),
    ...(input.vendorName.trim()
      ? { vendorName: input.vendorName.trim(), vendorId: slugifyVendor(input.vendorName) || null }
      : {}),
  };
}
