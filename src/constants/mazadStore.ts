/**
 * MazadJo's own store identity, used when Mazad is itself the seller.
 *
 * Mazad drops its own auctions through the admin drop-builder. Those lots used
 * to be saved under the *individual admin's* personal account name (createListing
 * stores `currentUser.name`), so a lot MJ built showed to buyers as "by <MJ's
 * name>" rather than as MazadJo. The desktop auction page papered over it with a
 * hardcoded 'MAZAD JO Store' fallback, which was right for Mazad's own drops and
 * wrong for every third-party seller with no store name — a guess at render time
 * that could not be correct for both.
 *
 * The fix is to store the truth at creation instead. See docs/BACKLOG.md #16.
 *
 * NOTE this is a BUYER-FACING DISPLAY identity only. `sellerId` and `createdById`
 * deliberately remain the real admin uid, because orders, payouts, seller
 * notifications, reviews, and the firestore.rules ownership checks are all keyed
 * on them. Changing those would move money.
 */

/** Stored on the lot as `sellerName`. One fixed string — it cannot vary by language. */
export const MAZAD_STORE_NAME = 'MAZAD JO Store';

/**
 * Stored on the lot as `sellerLogo`. The real app icon, not the Unsplash stock
 * photo that the generic seller-logo fallback still uses.
 */
export const MAZAD_STORE_LOGO = '/icon-192.png';
