/**
 * Which amount the desktop bid CTA will send.
 *
 * Desktop had no way to enter an amount at all: `BidSheet` — and with it the
 * custom-amount field — is rendered only by `MobileAuctionView`, so the desktop
 * panel offered three quick-bid chips and a fixed minimum-next button. This is
 * the shared decision behind the input that closes that gap.
 *
 * Validation itself is NOT re-implemented here: `validateCustomBid` in
 * `auctionBid.ts` already owns "is this a legal bid", and mobile uses it. This
 * adds only the question mobile answers inline — given what is typed, what does
 * the primary button do?
 *
 * THE RULE THAT MATTERS: an invalid entry BLOCKS the bid. It does not fall back
 * to the minimum. Typing 5 and having the button send 145 is a financial
 * surprise, and the confirm dialog would surface the real number too late to
 * read as a warning rather than a slip.
 */
import { validateCustomBid } from './auctionBid';

export interface ChosenBid {
  /** The amount the CTA would send, and the amount its label must show. */
  amount: number;
  /** True when the amount came from the field rather than the minimum. */
  isCustom: boolean;
  /** False blocks the CTA — the field holds something that must not be sent. */
  canBid: boolean;
  error: 'too_low' | 'invalid' | null;
}

export function chooseBidAmount(customValue: string, minNext: number): ChosenBid {
  const raw = (customValue ?? '').trim();

  // Untouched field: the CTA keeps its default behaviour — bid the minimum.
  if (raw === '') {
    return { amount: minNext, isCustom: false, canBid: true, error: null };
  }

  // `Number('')` is 0 and `Number(' ')` is 0, both already excluded above.
  // `Number('abc')` is NaN, which validateCustomBid rejects as invalid.
  const result = validateCustomBid(Number(raw), minNext);

  if (result.ok === false) {
    // amount is the minimum ONLY so the label has something coherent to render
    // while blocked; canBid=false is what actually governs, and isCustom=false
    // keeps the label from advertising an amount the user did not ask for.
    return { amount: minNext, isCustom: false, canBid: false, error: result.reason };
  }

  return { amount: result.amount, isCustom: true, canBid: true, error: null };
}
