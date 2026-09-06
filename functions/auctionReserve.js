/**
 * The reserve price: who may set it, and what counts as a value.
 *
 * WHY THIS FILE EXISTS. The reserve lives in `auctionSecrets/{auctionId}`,
 * whose rules are:
 *
 *     match /auctionSecrets/{auctionId} {
 *       allow read:  if isAdmin();
 *       allow write: if isAdmin();
 *     }
 *
 * Those rules are CORRECT — the amount is a secret and a seller's browser has
 * no business holding write access to it. But `createListing` wrote it from the
 * browser anyway, as the seller, so Firestore denied every non-admin write and
 * the failure was swallowed into a `console.warn`. The seller was told the
 * auction had been created; it went live carrying `reserveMet: false` with no
 * amount stored anywhere; and settlement, reading an ABSENT document rather
 * than hitting an error, treated it as "no reserve" and awarded the lot at
 * whatever the top bid happened to be.
 *
 * The fix is not to open the rules. It is to write the secret from a trusted
 * context, which is what the `setAuctionReserve` callable does — and the two
 * decisions that callable has to make are pure, so they live here where they
 * can be tested without the Admin SDK.
 */

/**
 * Coerce whatever the client sent into a reserve amount, or null.
 *
 * The form field is a STRING (`dropFormState.reservePrice: string`), so a
 * number is not guaranteed and `Number('')` is 0, `Number('abc')` is NaN, and
 * both of those must land on "no reserve" rather than on a number. A reserve of
 * zero is meaningless — every bid clears it — so it is treated as absent rather
 * than accepted and then silently satisfied.
 *
 * Returns a finite positive number, or null for "no reserve requested".
 */
function normalizeReservePrice(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

/**
 * May this caller set the reserve on this auction?
 *
 * The seller who owns the lot, or an admin. `sellerId` is the REAL creating uid
 * even for Mazad's own drops (see the note on it in createListing), so it is the
 * right ownership key — the buyer-facing display identity is not.
 *
 * Returns `{ ok: true }` or `{ ok: false, code }` where `code` is the
 * HttpsError code the caller should throw, so the callable stays a thin wrapper
 * and every branch here is reachable from a unit test.
 */
function authorizeReserveWrite({ callerUid, isAdmin, auction }) {
  if (!callerUid) return { ok: false, code: 'unauthenticated' };
  // Checked BEFORE ownership: "this lot does not exist" and "this lot is not
  // yours" are different answers, and conflating them would let a caller probe
  // for the existence of auctions by watching which error came back.
  if (!auction) return { ok: false, code: 'not-found' };
  if (isAdmin === true) return { ok: true };
  if (auction.sellerId && auction.sellerId === callerUid) return { ok: true };
  return { ok: false, code: 'permission-denied' };
}

module.exports = { normalizeReservePrice, authorizeReserveWrite };
