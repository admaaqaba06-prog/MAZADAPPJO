/**
 * D5 — counterparty contact reveal.
 *
 * Once money is verified in, the buyer and seller have to coordinate a physical
 * handover in Amman. Today they cannot reach each other: firestore.rules
 * restricts `users` reads to the owner and admins, and the order doc carries no
 * seller phone — so every delivery conversation goes through whatever WhatsApp
 * thread the CS team brokers by hand. That is the same manual bottleneck Wave 3
 * removed from the evidence chain.
 *
 * THE GATE IS THE POINT. Revealing a phone is irreversible, so:
 *  - only a party to the order may ask, and only about the OTHER party;
 *  - only once `paymentVerified` is true — without that, anyone who placed a
 *    bid could harvest the seller's number;
 *  - never on a cancelled or refunded order, where there is nothing left to
 *    coordinate.
 *
 * Pure: the callable in index.js reads the three documents and passes them in,
 * so every branch above is unit-tested without an emulator.
 */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const CLOSED_STATUSES = ['cancelled', 'refunded'];

/**
 * @param {{order: object, buyer: object|null, seller: object|null}} docs
 * @param {string} callerUid
 * @returns {{role: 'buyer'|'seller', name: string, phone: string}}
 */
function resolveCounterpartyContact(docs, callerUid) {
  const { order, buyer, seller } = docs || {};
  if (!order) throw makeError('not-found', 'Order not found.');

  const isBuyer = order.buyerId === callerUid;
  const isSeller = order.sellerId === callerUid;
  if (!isBuyer && !isSeller) {
    throw makeError('permission-denied', 'You are not a party to this order.');
  }

  if (order.paymentVerified !== true) {
    throw makeError('failed-precondition', 'Contact details are shared once the payment is verified.');
  }

  if (CLOSED_STATUSES.includes(order.status)) {
    throw makeError('failed-precondition', 'This order is closed — cancelled or refunded.');
  }

  if (isBuyer) {
    const phone = (seller && seller.phoneNumber) || '';
    if (!phone) throw makeError('failed-precondition', 'The seller has no phone number on file.');
    return { role: 'seller', name: (seller && seller.name) || 'Seller', phone };
  }

  // Seller asking about the buyer: prefer the phone the buyer NOMINATED for
  // delivery at checkout over their account phone — they may pay from one
  // number and want the courier to call another.
  const phone = order.deliveryPhone || (buyer && buyer.phoneNumber) || '';
  if (!phone) throw makeError('failed-precondition', 'The buyer has no phone number on file.');
  return { role: 'buyer', name: (buyer && buyer.name) || order.buyerName || 'Buyer', phone };
}

/**
 * wa.me needs bare digits with the country code and no leading +/00.
 * Returns null rather than a half-built link when there is nothing usable.
 */
function waMeLink(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

module.exports = { resolveCounterpartyContact, waMeLink, CLOSED_STATUSES };
