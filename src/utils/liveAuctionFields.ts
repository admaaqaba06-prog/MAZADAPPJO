// Shared field-mapping for auction docs — the SINGLE source of truth for how a
// raw Firestore auction doc's fast-changing "live" fields (price/bids/bidder/
// reserve/status/end time) and timestamps/prices are normalised.
//
// Both the broad `mapAuctionDoc` listener in AppContext and the per-card
// live-on-visible subscription (`useVisibleAuctionLive`) map through here so the
// live overlay never drifts from the paginated doc's values (e.g. `endTime`
// always resolves from `endsAt` first, then `endTime`, identically on both).

import { AuctionItem } from '../types';

/**
 * Normalise a Firestore timestamp-ish value → epoch millis. Accepts a number,
 * an ISO/parseable string, a Firestore `Timestamp` (`toDate()`), or a raw
 * `{ seconds }` shape. Falls back to "one hour from now" for missing/unparseable
 * values so a lot never renders an already-expired clock from a bad field.
 */
export function parseAuctionTimestamp(val: any): number {
  if (!val) return Date.now() + 3600000;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? Date.now() + 3600000 : parsed;
  }
  if (typeof val.toDate === 'function') {
    return val.toDate().getTime();
  }
  if (val.seconds !== undefined) {
    return val.seconds * 1000;
  }
  return Date.now() + 3600000;
}

/**
 * Resolve a lot's end time (epoch millis) from a raw doc: prefer the `endsAt`
 * Timestamp (the field anti-snipe extensions write), fall back to `endTime`,
 * then to a safe default. Guards against a NaN parse.
 */
export function resolveEndTime(data: any): number {
  let t = Date.now() + 3600000;
  if (data.endsAt) {
    t = parseAuctionTimestamp(data.endsAt);
  } else if (data.endTime) {
    t = parseAuctionTimestamp(data.endTime);
  }
  if (isNaN(t)) {
    t = Date.now() + 3600000;
  }
  return t;
}

/**
 * Fils→units price resolver: prefer the integer `*Fils` field (÷1000), else the
 * plain field, else `fallback`. Mirrors the price mapping in `mapAuctionDoc`.
 */
export function filsToUnits(
  filsVal: number | undefined,
  plainVal: number | undefined,
  fallback: number
): number {
  return filsVal !== undefined ? filsVal / 1000 : plainVal ?? fallback;
}

/**
 * Map only the fast-changing "live" fields of a raw auction doc. Returned as a
 * `Partial<AuctionItem>` for overlaying onto an already-loaded (paginated) card
 * via `mergeLiveIntoCard`. Values are resolved identically to the broad
 * listener so a visible card's live numbers match the rest of the feed.
 */
export function mapLiveAuctionFields(data: any): Partial<AuctionItem> {
  const startingPrice = filsToUnits(data.startingPriceFils, data.startingPrice, 0);
  return {
    currentPrice: filsToUnits(data.currentPriceFils, data.currentPrice, startingPrice),
    totalBids: data.totalBids ?? 0,
    currentBidderId: data.currentBidderId || null,
    currentBidderName: data.currentBidderName || null,
    reserveMet: data.reserveMet,
    status: data.status || 'live',
    endTime: resolveEndTime(data),
  };
}
