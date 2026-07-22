import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';

type BidResult = { success: boolean; message: string } | void;
type BidExecute = (amount: number) => Promise<BidResult> | BidResult;

export type ConfirmDecision =
  | { action: 'reprompt'; amount: number }
  | { action: 'send'; amount: number };

/**
 * Decide what a confirm tap should do, given the amount the user staged and the
 * LATEST minimum next bid for that auction. If a rival outbid during the (≤10s)
 * confirm window the latest minimum rises above the staged amount, so the
 * surface must re-prompt at the new minimum ("price moved") instead of sending
 * a stale amount the server would reject with a generic "minimum bid required".
 *
 * Pure + shared so the live reel and the details modal decide this identically.
 */
export function resolveConfirm(pendingAmount: number, latestMin: number): ConfirmDecision {
  if (latestMin > pendingAmount) {
    return { action: 'reprompt', amount: latestMin };
  }
  return { action: 'send', amount: pendingAmount };
}

/**
 * Shared bid entry flow for every bid surface (live reel + details modal), so a
 * bid can only ever be placed one way. It enforces three guarantees:
 *   - Membership gate: non-members are invited to join (subscription sheet)
 *     BEFORE any confirm — they never reach the confirm step.
 *   - Confirm step: `startBid` stages an amount; the caller renders BidConfirm
 *     against `pendingBid` and calls `confirmBid` to actually send.
 *   - Submitting guard: `confirmBid` blocks re-entry and exposes `submitting`
 *     so callers can disable controls + show a spinner for the callable round-trip.
 *
 * The caller supplies `execute` (the real placeBid call, plus any surface-local
 * optimistic paint). `confirmBid` returns whatever `execute` returned so callers
 * can branch on success/failure.
 */
export function useBidFlow(execute: BidExecute) {
  const { currentUser, setShowSubscriptionPrompt } = useApp();
  const isMember = currentUser?.subscriptionStatus === 'active';

  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Non-members are invited to join before any confirm; members get the confirm.
  const startBid = useCallback((amount: number) => {
    if (!isMember) {
      setShowSubscriptionPrompt(true);
      return;
    }
    setPendingBid(amount);
  }, [isMember, setShowSubscriptionPrompt]);

  const cancelBid = useCallback(() => setPendingBid(null), []);

  const confirmBid = useCallback(async (amount: number): Promise<BidResult> => {
    if (submitting) return; // in-flight guard: no double-submit
    setPendingBid(null);
    setSubmitting(true);
    try {
      return await execute(amount);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, execute]);

  return { isMember, pendingBid, submitting, startBid, confirmBid, cancelBid };
}
