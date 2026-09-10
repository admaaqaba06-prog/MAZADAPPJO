/**
 * Phase 1 migration census — READ ONLY, ALWAYS.
 *
 * Counts and classifies the live records the seller-approval change would move
 * around. It answers four questions that cannot be answered from the source:
 *
 *   1. `completed` auctions — how many, and how many have an order, a payment,
 *      seller-acceptance metadata, buyer-confirmation metadata, or no order.
 *   2. `reserve_not_met` auctions — split across the eight states the
 *      belowReserveOffer machine can leave them in, to establish whether the
 *      offer object is already the source of truth for them.
 *   3. `pending_buyer_confirmation` orders — the live population of the step
 *      Phase 1 keeps: count, age, deadline, and whether any are already paid.
 *   4. `waiting_payment` orders — whether their deadline was anchored to the
 *      auction's end or to the order's creation. This one matters because the
 *      new rule must not retroactively move a historical deadline, and the
 *      only way to know which anchor a given order used is to measure it.
 *
 * THERE IS NO WRITE PATH IN THIS FILE. No set, no update, no delete, no batch,
 * no --apply. It is safe to run against production, and it is meant to be:
 * the alternative is guessing about live money.
 *
 * Setup (see scripts/admin/README.md):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
 *   node scripts/admin/phase1-census.cjs
 *
 * Add --json to emit machine-readable output instead of the report.
 * Add --ids to list document ids per bucket (verbose; off by default so the
 * report stays readable and no ids end up pasted into a chat by accident).
 */
'use strict';

function loadAdmin() {
  const candidates = ['../loadtest/node_modules/firebase-admin', 'firebase-admin'];
  for (const c of candidates) {
    try {
      return require(c.startsWith('.') ? require('path').join(__dirname, c) : c);
    } catch (e) {
      if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]);
    }
  }
  console.error('firebase-admin not found. Run `npm ci` in scripts/loadtest.');
  process.exit(1);
}

const admin = loadAdmin();
const AS_JSON = process.argv.includes('--json');
const SHOW_IDS = process.argv.includes('--ids');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set — see scripts/admin/README.md.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const HOUR = 3600 * 1000;
const ms = (t) => {
  if (!t) return null;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t._seconds != null) return t._seconds * 1000;
  const p = Date.parse(t);
  return Number.isFinite(p) ? p : null;
};
const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null;
const days = (a, b) => (a == null || b == null) ? null : Math.round((a - b) / (24 * HOUR) * 10) / 10;

/** A bucket that counts, and optionally remembers ids, without ever growing unbounded. */
function bucket() {
  return { n: 0, ids: [], add(id) { this.n++; if (this.ids.length < 50) this.ids.push(id); } };
}
const mkBuckets = (names) => Object.fromEntries(names.map(n => [n, bucket()]));

async function main() {
  const now = Date.now();
  const report = { generatedAt: new Date(now).toISOString(), project: process.env.GCLOUD_PROJECT || 'from-credentials' };

  // Pull once; these collections are small enough that paging them whole is
  // cheaper and more consistent than a dozen filtered queries.
  const [auctionSnap, orderSnap] = await Promise.all([
    db.collection('auctions').get(),
    db.collection('orders').get(),
  ]);

  const orders = new Map();
  orderSnap.docs.forEach(d => orders.set(d.id, d.data() || {}));
  const auctions = new Map();
  auctionSnap.docs.forEach(d => auctions.set(d.id, d.data() || {}));

  report.totals = { auctions: auctions.size, orders: orders.size };

  // ---- Q0: the whole auction status distribution, for context -------------
  report.auctionStatusDistribution = {};
  for (const a of auctions.values()) {
    const s = a.status || '<missing>';
    report.auctionStatusDistribution[s] = (report.auctionStatusDistribution[s] || 0) + 1;
  }
  report.orderStatusDistribution = {};
  for (const o of orders.values()) {
    const s = o.status || '<missing>';
    report.orderStatusDistribution[s] = (report.orderStatusDistribution[s] || 0) + 1;
  }

  // ---- Q1: completed auctions ---------------------------------------------
  const q1 = mkBuckets([
    'total', 'withOrder', 'withoutOrder', 'orderPaidOrBeyond', 'orderWaitingPayment',
    'orderPendingBuyerConfirmation', 'orderDefaulted', 'hasSellerAcceptedAt',
    'hasBuyerConfirmedAt', 'hasBelowReserveOffer', 'noBidderRecorded',
  ]);
  const PAID_OR_BEYOND = ['paid', 'preparing_shipment', 'out_for_delivery', 'shipped', 'delivered', 'completed'];

  for (const [id, a] of auctions) {
    if (a.status !== 'completed') continue;
    q1.total.add(id);
    const o = orders.get(id);
    if (o) {
      q1.withOrder.add(id);
      if (PAID_OR_BEYOND.includes(o.status)) q1.orderPaidOrBeyond.add(id);
      if (o.status === 'waiting_payment') q1.orderWaitingPayment.add(id);
      if (o.status === 'pending_buyer_confirmation') q1.orderPendingBuyerConfirmation.add(id);
      if (o.status === 'defaulted') q1.orderDefaulted.add(id);
    } else {
      // A completed auction with no order is the anomaly repairEndedAuctionOrder exists for.
      q1.withoutOrder.add(id);
    }
    const off = a.belowReserveOffer;
    if (off) q1.hasBelowReserveOffer.add(id);
    if (has(off, 'sellerAcceptedAt')) q1.hasSellerAcceptedAt.add(id);
    if (has(off, 'buyerConfirmedAt')) q1.hasBuyerConfirmedAt.add(id);
    if (!a.currentBidderId && !a.highestBidderId && !a.winnerId) q1.noBidderRecorded.add(id);
  }
  report.q1_completedAuctions = q1;

  // ---- Q2: reserve_not_met auctions ---------------------------------------
  // The eight buckets the owner asked for. `offerSourceOfTruth` answers the
  // real question underneath: are these records already described by the
  // belowReserveOffer object, or only by the auction status?
  const q2 = mkBuckets([
    'total', 'genuinelyUnsold_noOffer', 'pendingSeller', 'sellerAccepted_pendingBuyer',
    'buyerConfirmed', 'alreadyPaid', 'expired', 'rejectedBySeller', 'declinedByBuyer',
    'unknownOfferStatus', 'pendingButLapsed', 'hasOrder',
  ]);

  for (const [id, a] of auctions) {
    if (a.status !== 'reserve_not_met') continue;
    q2.total.add(id);
    const off = a.belowReserveOffer;
    const o = orders.get(id);
    if (o) q2.hasOrder.add(id);

    if (!off) { q2.genuinelyUnsold_noOffer.add(id); continue; }

    switch (off.status) {
      case 'pending_seller':
        q2.pendingSeller.add(id);
        if (ms(off.expiresAt) != null && now >= ms(off.expiresAt)) q2.pendingButLapsed.add(id);
        break;
      case 'pending_buyer':
        q2.sellerAccepted_pendingBuyer.add(id);
        if (ms(off.expiresAt) != null && now >= ms(off.expiresAt)) q2.pendingButLapsed.add(id);
        break;
      case 'confirmed':
        q2.buyerConfirmed.add(id);
        if (o && PAID_OR_BEYOND.includes(o.status)) q2.alreadyPaid.add(id);
        break;
      case 'expired': q2.expired.add(id); break;
      case 'declined':
        // The stored vocabulary collapses both refusals into 'declined'; the
        // timestamps are the only thing that says which side walked.
        if (has(off, 'buyerDeclinedAt')) q2.declinedByBuyer.add(id);
        else q2.rejectedBySeller.add(id);
        break;
      default: q2.unknownOfferStatus.add(id);
    }
  }
  report.q2_reserveNotMetAuctions = q2;

  // ---- Q3: pending_buyer_confirmation orders ------------------------------
  // The population of the step Phase 1 KEEPS. Nothing here is migrated; the
  // point is to know how many people are standing in it right now.
  const q3 = { count: 0, rows: [], anyPaid: 0, anyWithDeadline: 0, anyExpiredOffer: 0, anyBuyerAlreadyConfirmed: 0, orphanNoAuction: 0 };
  for (const [id, o] of orders) {
    if (o.status !== 'pending_buyer_confirmation') continue;
    q3.count++;
    const a = auctions.get(o.auctionId || id);
    const off = a && a.belowReserveOffer;
    const createdMs = ms(o.createdAt);
    const expMs = off ? ms(off.expiresAt) : null;
    const paid = o.paymentStatus && o.paymentStatus !== 'unpaid';

    if (paid) q3.anyPaid++;
    if (o.paymentDeadlineAt) q3.anyWithDeadline++;
    if (expMs != null && now >= expMs) q3.anyExpiredOffer++;
    if (off && has(off, 'buyerConfirmedAt')) q3.anyBuyerAlreadyConfirmed++;
    if (!a) q3.orphanNoAuction++;

    if (q3.rows.length < 50) {
      q3.rows.push({
        orderId: id,
        auctionId: o.auctionId || null,
        auctionStatus: a ? a.status : '<auction missing>',
        offerStatus: off ? off.status : '<no offer>',
        ageDays: days(now, createdMs),
        paymentStatus: o.paymentStatus || null,
        hasPaymentDeadline: !!o.paymentDeadlineAt,
        offerExpired: expMs == null ? 'unknown' : now >= expMs,
        offerExpiresInHours: expMs == null ? null : Math.round((expMs - now) / HOUR),
      });
    }
  }
  report.q3_pendingBuyerConfirmationOrders = q3;

  // ---- Q4: what anchor did waiting_payment orders actually use? -----------
  // Measured, not assumed. For each order compare its stored deadline against
  // the two candidate anchors and report which it matches within a tolerance
  // wide enough to absorb the closer's up-to-60s lag.
  const TOL_MS = 10 * 60 * 1000; // 10 minutes
  const q4 = {
    count: 0, matchesOrderCreation: 0, matchesAuctionEnd: 0, matchesBoth: 0,
    matchesNeither: 0, missingDeadline: 0, missingAnchors: 0, samples: [],
    windowHoursSeen: {},
  };
  for (const [id, o] of orders) {
    if (o.status !== 'waiting_payment') continue;
    q4.count++;
    const dl = ms(o.paymentDeadlineAt);
    if (dl == null) { q4.missingDeadline++; continue; }

    const hours = Number(o.paymentWindowHours) > 0 ? Number(o.paymentWindowHours) : 24;
    q4.windowHoursSeen[hours] = (q4.windowHoursSeen[hours] || 0) + 1;

    const a = auctions.get(o.auctionId || id);
    const createdMs = ms(o.createdAt);
    const endMs = a ? (ms(a.endsAt) ?? ms(a.endTime)) : null;
    if (createdMs == null && endMs == null) { q4.missingAnchors++; continue; }

    const fromCreate = createdMs == null ? null : Math.abs(dl - (createdMs + hours * HOUR));
    const fromEnd = endMs == null ? null : Math.abs(dl - (endMs + hours * HOUR));
    const okCreate = fromCreate != null && fromCreate <= TOL_MS;
    const okEnd = fromEnd != null && fromEnd <= TOL_MS;

    if (okCreate && okEnd) q4.matchesBoth++;
    else if (okCreate) q4.matchesOrderCreation++;
    else if (okEnd) q4.matchesAuctionEnd++;
    else {
      q4.matchesNeither++;
      if (q4.samples.length < 20) {
        q4.samples.push({
          orderId: id,
          windowHours: hours,
          deadline: new Date(dl).toISOString(),
          orderCreated: createdMs == null ? null : new Date(createdMs).toISOString(),
          auctionEnd: endMs == null ? null : new Date(endMs).toISOString(),
          driftFromCreationHours: fromCreate == null ? null : Math.round(fromCreate / HOUR * 10) / 10,
          driftFromEndHours: fromEnd == null ? null : Math.round(fromEnd / HOUR * 10) / 10,
        });
      }
    }
  }
  report.q4_waitingPaymentAnchors = q4;

  // ---- Q5: anything already sitting in a state Phase 1 would create -------
  // If this is non-zero the deploy is not a clean slate and the plan changes.
  const q5 = mkBuckets(['auctionsWithPendingSellerStatus', 'secondChancePending']);
  for (const [id, a] of auctions) {
    if (a.status === 'pending_seller') q5.auctionsWithPendingSellerStatus.add(id);
    const sc = a.secondChanceOffer;
    if (sc && (sc.status === 'pending_seller' || sc.status === 'pending_buyer')) q5.secondChancePending.add(id);
  }
  report.q5_preexistingNewStates = q5;

  if (!SHOW_IDS) {
    const strip = (o) => {
      for (const k of Object.keys(o)) {
        if (o[k] && typeof o[k] === 'object' && Array.isArray(o[k].ids)) delete o[k].ids;
      }
    };
    strip(q1); strip(q2); strip(q5);
  }

  if (AS_JSON) { console.log(JSON.stringify(report, null, 2)); return; }

  const line = (s = '') => console.log(s);
  const kv = (o) => Object.entries(o)
    .filter(([, v]) => v && typeof v === 'object' && typeof v.n === 'number')
    .forEach(([k, v]) => line(`    ${String(v.n).padStart(6)}  ${k}`));

  line(`\nMAZZADO — Phase 1 migration census (READ ONLY)`);
  line(`${report.generatedAt}`);
  line(`\nTOTALS  auctions=${report.totals.auctions}  orders=${report.totals.orders}`);
  line(`\nAUCTION STATUS DISTRIBUTION`);
  Object.entries(report.auctionStatusDistribution).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => line(`    ${String(v).padStart(6)}  ${k}`));
  line(`\nORDER STATUS DISTRIBUTION`);
  Object.entries(report.orderStatusDistribution).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => line(`    ${String(v).padStart(6)}  ${k}`));

  line(`\nQ1 — completed auctions`); kv(q1);
  line(`\nQ2 — reserve_not_met auctions`); kv(q2);
  line(`\nQ3 — pending_buyer_confirmation orders`);
  line(`    ${String(q3.count).padStart(6)}  total`);
  line(`    ${String(q3.anyPaid).padStart(6)}  already paid  <-- must be 0`);
  line(`    ${String(q3.anyWithDeadline).padStart(6)}  carry a payment deadline  <-- expected 0`);
  line(`    ${String(q3.anyExpiredOffer).padStart(6)}  whose offer window has lapsed`);
  line(`    ${String(q3.anyBuyerAlreadyConfirmed).padStart(6)}  where the buyer already confirmed  <-- must be 0`);
  line(`    ${String(q3.orphanNoAuction).padStart(6)}  with no auction document`);
  if (q3.rows.length) { line(`\n  rows:`); q3.rows.forEach(r => line(`    ${JSON.stringify(r)}`)); }

  line(`\nQ4 — waiting_payment deadline anchors`);
  line(`    ${String(q4.count).padStart(6)}  total`);
  line(`    ${String(q4.matchesOrderCreation).padStart(6)}  anchored to ORDER CREATION`);
  line(`    ${String(q4.matchesAuctionEnd).padStart(6)}  anchored to AUCTION END`);
  line(`    ${String(q4.matchesBoth).padStart(6)}  indistinguishable (settled within ~10min of close)`);
  line(`    ${String(q4.matchesNeither).padStart(6)}  matches NEITHER  <-- investigate`);
  line(`    ${String(q4.missingDeadline).padStart(6)}  no deadline stored`);
  line(`    ${String(q4.missingAnchors).padStart(6)}  no usable anchor`);
  line(`    windows seen: ${JSON.stringify(q4.windowHoursSeen)}`);
  if (q4.samples.length) { line(`\n  unmatched samples:`); q4.samples.forEach(s => line(`    ${JSON.stringify(s)}`)); }

  line(`\nQ5 — states Phase 1 would introduce, already present?`); kv(q5);
  line(`\nNothing was written. This script has no write path.\n`);
}

main().catch(e => { console.error('census failed:', e); process.exit(1); });
