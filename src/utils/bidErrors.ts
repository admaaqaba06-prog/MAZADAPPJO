// Classification of bid-failure messages (PF6).
//
// The server `placeBid` returns/throws a number of ROUTINE "no" answers (below
// minimum, membership required, funds, auction ended, price moved…). Those are
// expected outcomes, not system-health incidents — logging them as `bid_fail`
// health docs floods `system_health` during a normal bid war. Only genuinely
// unexpected failures should become health incidents.
//
// Substring matching mirrors the messages produced by functions/index.js
// (placeBid) and the client-side membership/price-moved paths.

const EXPECTED_FRAGMENTS = [
  'ended',
  'Minimum',
  'Funds',
  'subscription',
  'restricted',
  'not accepting',
  'MEMBERSHIP_REQUIRED',
  'PRICE_MOVED_RETRY',
] as const;

/**
 * True when a bid-failure message is a routine, expected server rejection that
 * should NOT be logged as a system-health incident.
 */
export function isExpectedBidFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  return EXPECTED_FRAGMENTS.some((frag) => message.includes(frag));
}
