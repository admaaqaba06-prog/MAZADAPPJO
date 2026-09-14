/**
 * Meta Pixel event helpers.
 *
 * The pixel is initialised by the snippet in index.html; this module only sends
 * events. Every call uses `?.` because `window.fbq` is genuinely optional —
 * the loader is a remote script that ad blockers and tracking protection stop
 * routinely, and analytics must never be able to break a bid or a signup.
 *
 * WHAT IS MEASURED. These fire on SERVER-CONFIRMED success only: after the
 * backend has accepted the bid, after the account document exists, after the
 * listing has been written. Never on a button click and never on an optimistic
 * update — a pixel that counts attempts makes every downstream conversion rate
 * a lie, and ad delivery optimises against it.
 */

/**
 * A route change in the single-page app.
 *
 * Called from AppContext's history sync, NOT from a component, because the
 * event has to land after the URL has actually changed — `fbq` reads
 * `document.location` itself at call time, so firing a tick early reports the
 * PREVIOUS page. See the call site for why that ordering is explicit there and
 * cannot be expressed reliably from a child component.
 */
export function trackPageView(): void {
  window.fbq?.('track', 'PageView');
}

/** A new account finished being created. */
export function trackRegistration(): void {
  window.fbq?.('track', 'CompleteRegistration');
}

/** The backend accepted a bid. `amount` is JOD, matching the auction's own unit. */
export function trackBid(auctionId: string, amount: number): void {
  window.fbq?.('trackCustom', 'PlaceBid', {
    content_ids: [auctionId],
    value: amount,
    currency: 'JOD',
  });
}

/** A listing was successfully created. */
export function trackListItem(itemId: string): void {
  window.fbq?.('trackCustom', 'ListItem', { content_ids: [itemId] });
}
