import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { resolveBidGate } from '../utils/guestGate';
import { hasRealPhoto } from '../utils/avatarPlaceholder';

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
  const { currentUser, isAuthenticated, setShowSubscriptionPrompt, setShowPhotoGate, requestSignIn } = useApp();
  const isMember = currentUser?.subscriptionStatus === 'active';
  const isGuest = !isAuthenticated;
  const hasPhoto = hasRealPhoto(currentUser);

  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ordered gate (resolveBidGate — pure, see utils/guestGate.test.ts):
  //   guest        -> SIGNUP (never a members-only sheet)
  //   non-member   -> subscription invite
  //   member, no photo -> "add a photo to bid" trust gate (client-side only)
  //   member, photo    -> stage the confirm
  // The server bid path is untouched — this only decides whether to stage.
  const startBid = useCallback((amount: number) => {
    const decision = resolveBidGate({ isAuthenticated, isMember, hasPhoto });
    if (decision === 'signin') {
      requestSignIn();
      return;
    }
    if (decision === 'membership') {
      setShowSubscriptionPrompt(true);
      return;
    }
    if (decision === 'photo') {
      setShowPhotoGate(true);
      return;
    }
    setPendingBid(amount);
  }, [isAuthenticated, isMember, hasPhoto, requestSignIn, setShowSubscriptionPrompt, setShowPhotoGate]);

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

  return { isMember, isGuest, requestSignIn, pendingBid, submitting, startBid, confirmBid, cancelBid };
}
