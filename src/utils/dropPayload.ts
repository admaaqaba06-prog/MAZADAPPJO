/*
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

import { channelToCategory, type DropChannel } from './dropChannel';
import type { ViewingMode } from './viewing';

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
  // No schedule = open now. The opener cron only flips auctions that HAVE a
  // scheduledStartAt, so falling back to null here (instead of `now`) would
  // leave the lot sitting in `upcoming` forever.
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
    // E3 Slice A — start mode. `endTime` above is computed unconditionally, even
    // for first_bid, because createListing is what drops it: for first_bid it
    // omits endTime/endsAt and forces scheduledStartAt = now (the lot goes live
    // on the next opener run and the clock only starts on the first bid). For
    // 'scheduled' both fields pass through untouched. Don't make endTime
    // conditional here — that would change what createListing receives.
    startMode: input.startMode,
    // E3 Slice B — seller opt-in auto-relist (up to MAX_AUTO_RELISTS server-side).
    autoRelist: input.autoRelist,
    scheduledStartAt: startAt,
    // Mazad's own inventory: every drop built here sells as the MazadJo store,
    // not as the individual admin who happened to build it. createListing turns
    // this into the buyer-facing sellerName/sellerLogo (gated on isAdminUser);
    // sellerId/createdById stay the real uid so orders, payouts and the ownership
    // rules are untouched. Vendor-sourced drops included — vendorName is internal.
    soldByMazad: true,
    // Conditional spreads below, NOT `key: value || undefined`: Firestore's setDoc
    // rejects an explicit `undefined` value (ignoreUndefinedProperties is off) and
    // throws at write time. A blank field must OMIT the key entirely. No test can
    // catch a regression here — it only surfaces against a real Firestore write.
    ...(input.viewing ? { viewing: input.viewing } : {}),
    ...(input.viewing === 'store' && input.viewingPlace.trim()
      ? { viewingPlace: input.viewingPlace.trim() }
      : {}),
    ...(input.extraPhotoUrls.length > 0 ? { mediaUrls: input.extraPhotoUrls } : {}),
    ...(Number(input.marketPrice) > 0 ? { marketPrice: Number(input.marketPrice) } : {}),
    // Reserve is admin-only: createListing strips it from the auction doc and
    // writes it to auctionSecrets. It isn't in createListing's param type, which
    // is why the call site casts this payload with `as any`.
    ...(Number(input.reservePrice) > 0 ? { reservePrice: Number(input.reservePrice) } : {}),
    ...(input.vendorName.trim()
      ? { vendorName: input.vendorName.trim(), vendorId: slugifyVendor(input.vendorName) || null }
      : {}),
  };
}
