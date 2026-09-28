/**
 * Embedded CliQ (Bank al Etihad / Staq) — SERVER CORE.
 *
 * This is the enforcement half of the flow. src/utils/cliqRequest.ts draws the
 * countdown; THIS decides whether a request may exist. Everything that matters
 * — the 90-minute duplicate lock, the amount check, who may mark a payment
 * paid — is resolved here inside a transaction on the Admin SDK.
 *
 * HOW THIS DIFFERS FROM THE EXISTING CliQ PATH. orderPaymentSubmit.js is the
 * MANUAL transfer: the buyer sends money themselves, uploads a screenshot and a
 * reference, and an admin verifies it. That flow is untouched and still the
 * default. This one is the GATEWAY: Mazzado raises a request, the payer
 * approves it inside their own banking app, and the bank tells us. The two
 * differ in the only way that really counts —
 *
 *   manual  : the BUYER's submission flips the order to paid (proof pending).
 *   gateway : ONLY applyCliqWebhook can, and it is never reachable from a
 *             client. A buyer cannot self-report a gateway payment as paid.
 *
 * TODO: BAE CliQ API — the Staq/BAE endpoints are NOT called from this file
 * yet. The two marked call sites below are where they connect. No endpoint,
 * key, certificate or alias is hardcoded anywhere in this repo.
 */

const CLIQ_REQUEST_TTL_MS = 90 * 60 * 1000;

/** Max CliQ requests per order. Each one pushes a prompt into a banking app. */
const MAX_CLIQ_REQUESTS = 5;

const CLIQ_STATUSES = ['none', 'pending', 'paid', 'rejected', 'expired'];
const RETRYABLE = new Set(['none', 'rejected', 'expired']);

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function readStatus(raw) {
  return CLIQ_STATUSES.includes(raw) ? raw : 'none';
}

function readMillis(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw.toMillis === 'function') {
    const v = raw.toMillis();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  if (raw instanceof Date) {
    const v = raw.getTime();
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/**
 * MUST stay identical to cliqRequestState in src/utils/cliqRequest.ts —
 * cliqRequestParity.test.ts fails the build if they diverge, the same guard
 * moneyParity.test.ts puts on the buyer's premium.
 */
function cliqRequestState(order, nowMs) {
  const stored = readStatus(order && order.cliqPaymentStatus);
  const expiresAt = readMillis(order && order.cliqRequestExpiresAt);

  if (stored === 'pending') {
    // Malformed pending (no expiry) fails CLOSED — holding the lock is the safe
    // side of this branch; releasing it hands out a duplicate request.
    if (expiresAt == null) {
      return { status: 'pending', canCreate: false, remainingMs: CLIQ_REQUEST_TTL_MS, blockedReason: 'pending' };
    }
    const remainingMs = expiresAt - nowMs;
    if (remainingMs > 0) return { status: 'pending', canCreate: false, remainingMs, blockedReason: 'pending' };
    return { status: 'expired', canCreate: true, remainingMs: 0, blockedReason: 'none' };
  }

  if (stored === 'paid') {
    return { status: 'paid', canCreate: false, remainingMs: 0, blockedReason: 'already_paid' };
  }

  return { status: stored, canCreate: RETRYABLE.has(stored), remainingMs: 0, blockedReason: 'none' };
}

/**
 * True while a CliQ request is genuinely outstanding — pending AND inside its
 * 90-minute window.
 *
 * Used by paymentDefaultEnforcer to skip a buyer who is mid-request. It is
 * deliberately built on cliqRequestState rather than reading the status field
 * directly, so a request whose window has quietly lapsed counts as NOT live and
 * the buyer defaults normally. A bare `cliqPaymentStatus === 'pending'` check
 * would let a stale flag postpone the deadline forever.
 */
function isCliqRequestLive(order, nowMs) {
  return cliqRequestState(order, nowMs).status === 'pending';
}

// --- identifier validation (mirrors src/utils/cliqIdentifier.ts) -------------
const ALIAS_RE = /^[A-Za-z0-9]{3,35}$/;
const JO_MOBILE_RE = /^(?:\+962|00962|0)?(7[789]\d{6,7})$/;

function normalizeJordanMobile(raw) {
  if (typeof raw !== 'string') return '';
  const compact = raw.replace(/[\s\-()]/g, '');
  const m = JO_MOBILE_RE.exec(compact);
  if (!m) return '';
  const national = m[1];
  if (national.length !== 9) return '';
  return `+962${national}`;
}

function normalizeCliqIdentifier(type, raw) {
  if (type === 'alias') {
    const s = typeof raw === 'string' ? raw.trim() : '';
    return ALIAS_RE.test(s) ? s : '';
  }
  if (type === 'mobile') return normalizeJordanMobile(raw);
  return '';
}

/**
 * Display-safe identifier. Mirrors maskCliqIdentifier in
 * src/utils/cliqIdentifier.ts — cliqIdentifier.test.ts pins them together.
 *
 * THIS IS THE ONLY FORM THAT MAY GO ON THE ORDER DOC. See the identifier
 * split in createCliqRequest below for why.
 */
function maskCliqIdentifier(type, value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '';
  if (type === 'mobile') return `••••${s.slice(-3)}`;
  if (s.length <= 2) return '••';
  return `${s.slice(0, 2)}${'•'.repeat(Math.max(2, s.length - 2))}`;
}

// --- amount ------------------------------------------------------------------
/**
 * The amount the payer is asked for is the one the SETTLER already persisted on
 * the order (`totalDue`, written by settleAuctionTxn via totalDueJod). It is
 * never recomputed here and never taken from the client: a recomputation is a
 * second source of truth that can drift, and a client-supplied total is just a
 * price the buyer chose.
 *
 * The client still SENDS its total, and we compare — a mismatch means the page
 * was showing a different number from the one we are about to charge, which is
 * a bug or a tamper, and either way must not be silently resolved in favour of
 * the server. Tolerance is a tenth of a fil: JOD carries 3 decimals and the
 * client's own total is produced by the same fils double-round, so an exact
 * float compare would reject on representation alone.
 */
const AMOUNT_EPSILON = 0.0001;

function resolveCliqAmount(order) {
  const total = Number(order && order.totalDue);
  if (Number.isFinite(total) && total > 0) {
    const bid = Number(order.winningBidAmount) || 0;
    const premium = Number(order.buyersPremium);
    return {
      amount: bid,
      // Derive the fee line from what was persisted rather than re-deriving the
      // rate, so the breakdown always sums to the total actually charged.
      fees: Number.isFinite(premium) ? premium : Math.max(0, total - bid),
      total,
    };
  }
  return null;
}

async function createCliqRequest(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now(), ttlMs = CLIQ_REQUEST_TTL_MS } = deps;
  const {
    orderId,
    buyerUid,
    identifierType,
    identifier,
    expectedTotal,
  } = args;

  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (identifierType !== 'alias' && identifierType !== 'mobile') {
    throw makeError('invalid-argument', 'identifierType must be alias or mobile.');
  }
  const normalized = normalizeCliqIdentifier(identifierType, identifier);
  if (!normalized) throw makeError('invalid-argument', 'invalid CliQ identifier.');

  const nowMs = now();

  return db.runTransaction(async (txn) => {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await txn.get(orderRef);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};

    if (o.buyerId !== buyerUid) throw makeError('permission-denied', 'You are not the buyer on this order.');
    if (o.status !== 'waiting_payment') {
      throw makeError('failed-precondition', `Order ${orderId} is not awaiting payment.`);
    }

    // THE 90-MINUTE LOCK. Read inside the transaction, so two taps racing from
    // two tabs serialise here and the second sees the first's write.
    const state = cliqRequestState(o, nowMs);
    if (!state.canCreate) {
      if (state.blockedReason === 'already_paid') {
        throw makeError('failed-precondition', 'This payment has already been completed.');
      }
      const err = makeError('resource-exhausted', 'A CliQ request is already pending for this payment.');
      err.details = { remainingMs: state.remainingMs };
      throw err;
    }

    // A PAID ORDER WITH NOWHERE TO SEND IT IS NOT A SUCCESS.
    //
    // The manual rail treats a delivery address + phone as a hard precondition
    // of payment (OrderDetailsView's validateDeliveryAddress gate, persisted by
    // orderPaymentSubmit). The gateway rail must not be the cheaper door into
    // the same state: its address form lives inside the manual panel, and that
    // panel only renders while status === 'waiting_payment' — so the moment a
    // gateway payment flips the order to 'paid', the last surface on which the
    // buyer could ever supply an address unmounts. The seller is then looking
    // at a paid order with no governorate, no area and no phone, and only an
    // admin editing Firestore by hand can fix it.
    //
    // Refusing here makes that state unreachable rather than merely unlikely.
    const addr = o.deliveryAddress;
    const hasAddress = !!addr && typeof addr === 'object'
      && typeof addr.governorate === 'string' && addr.governorate.trim() !== '';
    const hasPhone = typeof o.deliveryPhone === 'string' && o.deliveryPhone.trim() !== '';
    if (!hasAddress || !hasPhone) {
      throw makeError('failed-precondition', 'A delivery address and phone are required before paying.');
    }

    // A REQUEST CANNOT BE RAISED AFTER THE PAYMENT DEADLINE HAS PASSED.
    //
    // This closes a hole created by the enforcer deferral. paymentDefaultEnforcer
    // skips an order whose CliQ request is live, and the comment there calls the
    // deferral bounded because a request lapses after 90 minutes. That is true of
    // ONE request. It says nothing about the next one.
    //
    // The sweep runs every 30 minutes and the TTL is 90, so a single request per
    // cycle covers every intervening sweep and still leaves a 30-minute gap in
    // which to raise the next — by hand, no automation. A buyer who simply never
    // opens their banking app could hold a seller's lot indefinitely, take no
    // strike, and keep the runner-up from ever being offered it.
    //
    // Refusing here rather than in the enforcer keeps the deferral honest: an
    // already-live request still runs its 90 minutes, but nothing new starts
    // after the deadline, so the order defaults at most one TTL late.
    const deadlineMs = readMillis(o.paymentDeadlineAt);
    if (deadlineMs != null && nowMs > deadlineMs) {
      throw makeError('failed-precondition', 'The payment deadline for this order has passed.');
    }

    // Defence in depth, mirroring MAX_ATTEMPTS in orderPaymentSubmit.js. Every
    // request is a real push notification into someone's banking app, so an
    // unbounded retry loop is abusive even inside the deadline.
    const attempts = Number(o.cliqRequestAttempts) || 0;
    if (attempts >= MAX_CLIQ_REQUESTS) {
      throw makeError('resource-exhausted', 'Too many CliQ payment attempts for this order.');
    }

    const money = resolveCliqAmount(o);
    if (!money) throw makeError('failed-precondition', 'This order has no settled total to charge.');

    // The browser's number must agree with the one we are about to charge.
    if (expectedTotal != null) {
      const sent = Number(expectedTotal);
      if (!Number.isFinite(sent) || Math.abs(sent - money.total) > AMOUNT_EPSILON) {
        throw makeError('failed-precondition', 'The displayed amount does not match the amount due.');
      }
    }

    // TODO: BAE CliQ API — raise the request with Staq here, inside the same
    // await, and use the response for `cliqRequestId` and the payer IBAN prefix
    // below. Until then the ids are locally minted so the UI and the demo mode
    // exercise the exact same state machine.
    const requestId = `local_${orderId}_${nowMs}`;
    const payerIbanPrefix = null;

    const expiresAtMs = nowMs + ttlMs;

    /**
     * THE IDENTIFIER IS SPLIT IN TWO, AND THIS IS NOT OPTIONAL.
     *
     * `orders/{orderId}` grants `allow read` to the buyer AND THE SELLER, and
     * Firestore has no field-level read denylist — a granted read returns every
     * field. The update denylist added for cliq* stops WRITES; it does nothing
     * for reads.
     *
     * So putting the payer's CliQ identifier on the order doc would hand the
     * SELLER the buyer's bank-registered mobile number the moment a request is
     * raised — before any payment, and in direct defeat of
     * contactReveal.js:44, which refuses to share a counterparty's contact
     * until `paymentVerified === true`.
     *
     * Same lesson, same fix as `deliveryCodes` (see firestore.rules): the full
     * value lives in its own admin-only document, and only the MASKED form —
     * which is all the buyer's own UI ever displays — goes on the order.
     */
    const secretRef = db.collection('cliqPayerIdentifiers').doc(orderId);
    txn.set(secretRef, {
      orderId,
      buyerId: buyerUid,
      identifierType,
      identifier: normalized,
      createdAt: Timestamp.fromMillis(nowMs),
    }, { merge: true });

    txn.set(orderRef, {
      cliqPaymentStatus: 'pending',
      cliqRequestId: requestId,
      cliqRequestCreatedAt: Timestamp.fromMillis(nowMs),
      cliqRequestExpiresAt: Timestamp.fromMillis(expiresAtMs),
      cliqPayerIdentifierType: identifierType,
      // MASKED ONLY — never `normalized`. See the note above.
      cliqPayerIdentifierMasked: maskCliqIdentifier(identifierType, normalized),
      cliqPayerIbanPrefix: payerIbanPrefix,
      cliqRequestAttempts: attempts + 1,
      cliqAmount: money.amount,
      cliqFees: money.fees,
      cliqTotal: money.total,
      updatedAt: Timestamp.fromMillis(nowMs),
    }, { merge: true });

    return {
      requestId,
      expiresAtMs,
      amount: money.amount,
      fees: money.fees,
      total: money.total,
      payerIbanPrefix,
    };
  });
}

/**
 * The ONLY path that may mark a gateway payment paid.
 *
 * Reached from the BAE webhook (and, in demo mode, from an admin-gated
 * callable). Never exposed to a buyer — see firestore.rules, where every cliq*
 * field is on the orders update denylist.
 */
async function applyCliqWebhook(deps, args = {}) {
  const { db, Timestamp, now = () => Date.now() } = deps;
  const { orderId, requestId, outcome } = args;

  if (!orderId || typeof orderId !== 'string') throw makeError('invalid-argument', 'orderId is required.');
  if (!['paid', 'rejected', 'expired'].includes(outcome)) {
    throw makeError('invalid-argument', 'outcome must be paid, rejected or expired.');
  }

  const nowMs = now();

  return db.runTransaction(async (txn) => {
    const orderRef = db.collection('orders').doc(orderId);
    const snap = await txn.get(orderRef);
    if (!snap.exists) throw makeError('not-found', `Order ${orderId} not found.`);
    const o = snap.data() || {};

    // A late webhook for a SUPERSEDED request must not reopen it. Matching the
    // id is what makes this safe to retry, and webhooks are retried.
    //
    // But 'paid' is not symmetric with the others and must not be dropped here.
    // The collision is between two numbers in this file: the lock lapses at 90
    // minutes while the disclaimer promises settlement may take two hours. A
    // payer who approves near the end of their window sees the request expire,
    // retries, overwrites cliqRequestId — and the ORIGINAL request then settles.
    // Discarding that leaves money moved at the bank with no trace anywhere on
    // our side, which is exactly the failure the out-of-band branch below was
    // written to prevent. Same rule applies: record it, escalate it, force
    // nothing.
    const superseded = !!(requestId && o.cliqRequestId && o.cliqRequestId !== requestId);
    if (superseded && outcome !== 'paid') {
      return { orderId, ignored: 'stale_request' };
    }
    if (superseded) {
      txn.set(orderRef, {
        cliqSupersededPaid: true,
        cliqSupersededPaidRequestId: requestId,
        cliqSupersededPaidAt: Timestamp.fromMillis(nowMs),
        updatedAt: Timestamp.fromMillis(nowMs),
      }, { merge: true });
      txn.set(db.collection('system_health').doc(), {
        type: 'payment_fail',
        title: 'CliQ payment settled against a superseded request',
        details: `Order ${orderId} received a paid webhook for request ${requestId}, but the order has since moved to request ${o.cliqRequestId}. The money moved at the bank. Check for a DOUBLE payment before refunding — the current request may also settle.`,
        source: 'applyCliqWebhook',
        createdAt: Timestamp.fromMillis(nowMs),
      });
      // Deliberately does NOT write cliqPaymentStatus: the live request is a
      // different one, and overwriting its state would hide a second payment.
      return { orderId, outcome: 'paid', needsReconciliation: true, supersededRequestId: requestId };
    }
    // Idempotent: the same terminal outcome arriving twice is a no-op, not an
    // error, and not a second status write.
    if (o.cliqPaymentStatus === outcome) return { orderId, ignored: 'duplicate' };
    if (o.cliqPaymentStatus === 'paid') return { orderId, ignored: 'already_paid' };

    const patch = {
      cliqPaymentStatus: outcome,
      cliqSettledAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
    };

    if (outcome === 'paid') {
      // MONEY HAS ALREADY MOVED. This branch must never throw.
      //
      // The order can legitimately have left waiting_payment while the request
      // was live — paymentDefaultEnforcer runs every 30 minutes and defaults
      // anything past its deadline, and our own disclaimer tells the payer
      // processing may take up to two hours. If we threw here, the throw would
      // abort the whole transaction: cliqPaymentStatus would stay 'pending',
      // cliqSettledAt would never be written, and every BAE webhook retry would
      // throw identically. The bank would have taken the buyer's money and our
      // system would hold no record of it at all.
      //
      // So a payment that lands on a non-waiting_payment order is RECORDED and
      // escalated instead. It does not force the order to 'paid' — a defaulted
      // lot may already be with the runner-up, and silently reviving it would
      // sell one item twice. A human resolves it; the money is never invisible.
      if (o.status !== 'waiting_payment') {
        patch.cliqPaidOutOfBand = true;
        patch.cliqPaidOutOfBandStatus = o.status || null;
        txn.set(orderRef, patch, { merge: true });
        txn.set(db.collection('system_health').doc(), {
          type: 'payment_fail',
          title: 'CliQ payment received on an order that was no longer awaiting payment',
          details: `Order ${orderId} status='${o.status}' received a CliQ payment of ${o.cliqTotal ?? o.totalDue ?? '?'} JOD (request ${o.cliqRequestId || requestId || '?'}). The money moved at the bank. Refund or reinstate — do NOT leave this unresolved.`,
          source: 'applyCliqWebhook',
          createdAt: Timestamp.fromMillis(nowMs),
        });
        return { orderId, outcome: 'paid', needsReconciliation: true, orderStatus: o.status };
      }
      patch.status = 'paid';
      patch.paymentStatus = 'paid';
      patch.paymentSubmittedAt = Timestamp.fromMillis(nowMs);
      patch.paymentMethod = 'cliq_gateway';
      // NOTE: `paymentVerified` is deliberately NOT set. It is the admin
      // verification stamp that gates escrow release and contact reveal, and
      // flipping it from here would remove a human step that exists today for
      // every order. A bank-confirmed gateway payment is arguably self-verifying
      // — that is a product decision, not one to slip in with plumbing.
    }
    // rejected / expired leave `status` at waiting_payment, so the buyer can
    // retry under the 90-minute rule. No transition, nothing to undo.

    txn.set(orderRef, patch, { merge: true });
    return { orderId, outcome };
  });
}

module.exports = {
  CLIQ_REQUEST_TTL_MS,
  MAX_CLIQ_REQUESTS,
  CLIQ_STATUSES,
  cliqRequestState,
  isCliqRequestLive,
  normalizeCliqIdentifier,
  normalizeJordanMobile,
  maskCliqIdentifier,
  resolveCliqAmount,
  createCliqRequest,
  applyCliqWebhook,
};
