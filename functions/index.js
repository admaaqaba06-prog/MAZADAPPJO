const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { resolveTierByPrice } = require('./subscriptionTiers');
const {
  approveSubscriptionRequest,
  grantSubscriptionDirect,
  rejectSubscriptionRequest,
} = require('./subscriptionApproval');
const { verifyOrderPayment: verifyOrderPaymentTxn, rejectOrderPayment: rejectOrderPaymentTxn } = require('./orderPaymentVerify');
const { sendFulfillmentNudge: sendFulfillmentNudgeTxn } = require('./fulfillmentNudge');
const { stampDisputeResolution: stampDisputeResolutionTxn } = require('./disputeResolution');
const { userStatusForSubscriptionRequest } = require('./subscriptionRequestStatus');
const { resolveSettlement, reserveMet, resolvePaymentWindowHours, resolveAntiSnipe, computeSoftCloseEnd, computeBidEndTime, sellerCommissionFils, sellerNetFils, buyerPremiumJod, totalDueJod, shouldAutoRelist, MAX_AUTO_RELISTS, belowReserveExpiryMs, isBelowReserveOfferExpired } = require('./settlement');
const { resolvePaymentDefaultBan, isEffectivelyBlocked } = require('./banLadder');
const { onAuctionWriteAlgolia } = require('./algoliaSync');

admin.initializeApp();
const db = admin.firestore();

// Firestore → Algolia search mirror (defined in ./algoliaSync with its own
// ALGOLIA_ADMIN_KEY secret + runWith). Re-exported here so it deploys with the
// rest of the functions bundle.
exports.onAuctionWriteAlgolia = onAuctionWriteAlgolia;

// Per-auction payment window: hours the winner has to pay before the
// paymentDefaultEnforcer blocks them. Set at auction creation; clamp + 24h
// default live in ./settlement (resolvePaymentWindowHours) so the rule has one
// unit-tested source of truth. This wrapper turns the resolved hours into the
// order's Firestore deadline Timestamp.
function paymentDeadlineFromNow(auctionData) {
  const hours = resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours);
  return admin.firestore.Timestamp.fromMillis(Date.now() + hours * 60 * 60 * 1000);
}

// Fire-and-forget notification to the n8n webhook. No-ops if unconfigured.
// NEVER throws — these calls sit inside financial/transaction paths, so a
// webhook failure must only log and never disrupt settlement/bid/escrow logic.
async function postToN8n(event, payload) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload, ts: Date.now() }),
      // Bound the wait: a hung n8n endpoint must never stall the settlement cron
      // or a callable. On timeout, fetch rejects and the catch below swallows it.
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn(`[n8n] ${event} webhook failed:`, e && e.message);
  }
}

/**
 * assertAdmin — shared admin gate for admin-only callables.
 * Mirrors the inline check used across the existing admin callables
 * (releaseOrderEscrow / refundOrderEscrow / approveWithdrawal etc.):
 * users/{uid}.role === 'admin' || users/{uid}.isAdmin === true || root admin email.
 * Throws HttpsError('permission-denied') otherwise; returns the caller uid.
 */
async function assertAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const tokenEmail = ((context.auth.token && context.auth.token.email) || '').toLowerCase();
  if (tokenEmail === 'admaaqaba06@gmail.com') {
    return context.auth.uid;
  }
  const callerSnap = await db.collection('users').doc(context.auth.uid).get();
  const callerData = callerSnap.exists ? callerSnap.data() : {};
  const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true;
  if (!isCallerAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Administrators only.');
  }
  return context.auth.uid;
}

// Shared caller-is-admin check for callables that already read the caller's
// user doc inside their transaction (mirrors the inline check in
// releaseOrderEscrow). `callerData` is users/{uid}.data(); `tokenEmail` is
// context.auth.token.email. Kept tiny + pure so the below-reserve callables and
// the escrow callables agree on who counts as an admin.
function callerIsAdmin(callerData, tokenEmail) {
  const d = callerData || {};
  return d.role === 'admin' || d.isAdmin === true || (tokenEmail || '').toLowerCase() === 'admaaqaba06@gmail.com';
}

// Delete a list of document refs in chunks (Firestore batches cap at 500 writes).
async function deleteRefsInBatches(refs) {
  let count = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const chunk = refs.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    count += chunk.length;
  }
  return count;
}

/**
 * E3 Slice B — mutate a settlement `update` object in place to stamp
 * `relistEligibleAt` (auction end + 24h) when the listing opted in to auto-relist
 * and is under the cap. Only called from the unsold / reserve_not_met branches —
 * NEVER on a sold outcome. `freshData` is the authoritative in-txn snapshot (used
 * for the eligibility fields + end time); `auctionData` is the sweep snapshot
 * fallback for the end time. No-op when not eligible (leaves `update` untouched).
 */
function addRelistEligibility(update, freshData, auctionData) {
  if (!shouldAutoRelist(freshData, Date.now())) return;
  const endMs = resolveAuctionEndMs(freshData) || resolveAuctionEndMs(auctionData || {}) || Date.now();
  update.relistEligibleAt = admin.firestore.Timestamp.fromMillis(endMs + 24 * 3600 * 1000);
}

/**
 * settleAuctionTxn — the per-auction settlement, extracted verbatim from the
 * body of scheduledAuctionCloser so the cron and simulateSettleNow run the
 * EXACT same settle path: transactional status flip, order creation with
 * buyer's premium + 24h payment deadline, winner wonCount increment, FCM,
 * and post-commit auction_won / payment_due webhooks.
 *
 * `auctionData` is the caller's pre-transaction snapshot; like the original
 * closer code it is only used for the vestigial escrow lookup, logging, and
 * order display fields — winner/price/bids are re-derived from the FRESH
 * in-transaction read, and the completed/ended + order-exists guards make
 * this safe against double-settling.
 *
 * Simulated auctions: when the FRESH in-transaction auction doc carries
 * isSimulated: true, the created order carries isSimulated: true as well —
 * derived here (not caller-supplied) so BOTH the closer cron and
 * simulateSettleNow flag it, and simulateCleanup / metrics can find it.
 * For real auctions the payload is byte-identical to before (no key added).
 *
 * Returns { settled, orderId }: settled=true when THIS call transitioned the
 * auction (completed with order, or ended unsold); orderId set only on the
 * completed-with-winner path.
 */
async function settleAuctionTxn(auctionRef, auctionData) {
  const auctionId = auctionRef.id;

  // NOTE: these are computed from the caller's snapshot and may be STALE
  // (a bid can land between that read and the transaction below). They are
  // only used for the vestigial escrow lookup + logging; the settlement
  // itself derives winner/price from the fresh in-txn read.
  const sweepWinnerId = auctionData.currentBidderId || auctionData.highestBidderId || auctionData.winnerId;
  const sweepFinalPrice = auctionData.currentPrice || auctionData.startingPrice;

  console.log("Checking ended auction:", auctionId);
  console.log("Winner (sweep snapshot):", sweepWinnerId);
  console.log("Final price (sweep snapshot):", sweepFinalPrice);

  let escrowId = null;
  if (sweepWinnerId) {
    console.log("Creating order:", auctionId);
    try {
      const escrowSnap = await db.collection('escrows')
        .where('auctionId', '==', auctionId)
        .where('bidderId', '==', sweepWinnerId)
        .where('status', '==', 'locked')
        .limit(1)
        .get();
      if (!escrowSnap.empty) {
        escrowId = escrowSnap.docs[0].id;
      }
    } catch (escErr) {
      console.warn(`[settleAuctionTxn] Escrow fetch failed for ${auctionId}:`, escErr);
    }
  }

  // Reserve lives in an admin/server-only doc (never on the world-readable
  // auction). Read it here; the authoritative sale decision re-derives price
  // from the in-txn snapshot below.
  // FAIL CLOSED: if this read errors we must NOT settle — defaulting to
  // "no reserve" could irreversibly sell below reserve. Abort this auction's
  // settlement for this run; the per-minute cron retries next sweep.
  let reservePrice = null;
  try {
    const secretSnap = await db.collection('auctionSecrets').doc(auctionId).get();
    if (secretSnap.exists) reservePrice = secretSnap.data().reservePrice ?? null;
  } catch (secErr) {
    console.error(`[settleAuctionTxn] auctionSecrets fetch failed for ${auctionId} — aborting settlement this run (fail closed):`, secErr);
    throw secErr;
  }

  // (notify) set ONLY on a real settlement this run; fired AFTER the txn commits.
  let notifyData = null;
  // (notify) E3 Slice C — set when a reserve_not_met settlement stamps a fresh
  // below-reserve offer, so the seller is prompted post-commit to accept.
  let belowReserveNotify = null;
  let settled = false;
  let settledOrderId = null;
  await db.runTransaction(async (transaction) => {
    notifyData = null; // reset each attempt — transactions retry on contention
    belowReserveNotify = null;
    settled = false;
    settledOrderId = null;
    const freshDoc = await transaction.get(auctionRef);
    const freshData = freshDoc.data();

    if (['completed', 'ended', 'reserve_not_met'].includes(freshData.status)) {
      return;
    }

    // Derive winner/price/bids from the FRESH in-txn snapshot. A bid
    // landing between the sweep query and this transaction would make
    // the sweep values settle the wrong bidder at the wrong price.
    const winnerId = freshData.currentBidderId || freshData.highestBidderId || freshData.winnerId;
    const winnerName = freshData.currentBidderName || freshData.highestBidderName || freshData.winnerName || 'Buyer';
    const finalPrice = freshData.currentPrice || freshData.startingPrice;
    const totalBids = freshData.totalBids || 0;

    const orderRef = db.collection('orders').doc(auctionId);
    const orderSnap = await transaction.get(orderRef);

    // Firestore requires ALL reads before ANY writes. Read the winner doc
    // HERE (before the settlement writes below). Previously this read ran
    // AFTER the writes, throwing on every settlement so no auction ever
    // completed and no order was ever created.
    const winnerRef = winnerId ? db.collection('users').doc(winnerId) : null;
    const winnerSnap = winnerRef ? await transaction.get(winnerRef) : null;

    const decision = resolveSettlement({ totalBids, winnerId, finalPrice, reservePrice });

    if (decision.outcome === 'sold') {
      // Mark completed
      transaction.update(auctionRef, {
        status: 'completed',
        settledAt: admin.firestore.FieldValue.serverTimestamp()
      });
      settled = true;
      settledOrderId = orderRef.id;

      // Increment win count (winnerRef was read above, before any writes)
      transaction.set(winnerRef, {
        wonCount: admin.firestore.FieldValue.increment(1)
      }, { merge: true });

      // Create Order System (Phase 1)
      if (!orderSnap.exists) {
        const orderPayload = {
          id: auctionId,
          auctionId: auctionId,
          auctionTitle: auctionData.title || '',
          auctionImage: auctionData.thumbnailUrl || auctionData.imageUrl || '',
          sellerId: auctionData.sellerId || '',
          sellerName: auctionData.sellerName || 'Seller',
          buyerId: winnerId,
          buyerName: winnerName,
          winningBidAmount: finalPrice,
          buyersPremium: buyerPremiumJod(finalPrice),
          totalDue: totalDueJod(finalPrice),
          sellerCommission: sellerCommissionFils(Math.round(finalPrice * 1000)) / 1000,
          sellerNet: sellerNetFils(Math.round(finalPrice * 1000)) / 1000,
          paymentDeadlineAt: paymentDeadlineFromNow(auctionData),
          paymentWindowHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
          status: "waiting_payment",
          paymentStatus: "unpaid",
          shippingStatus: "not_started",
          escrowStatus: "locked",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (escrowId) {
          orderPayload.escrowId = escrowId;
        }

        // Derive from the fresh in-txn doc (NOT a caller option): a simulated
        // auction settled by the cron must still produce a flagged order.
        if (freshData.isSimulated === true) {
          orderPayload.isSimulated = true;
        }

        transaction.set(orderRef, orderPayload);
        console.log(`[settleAuctionTxn] Created order for auction ${auctionId}`);
      } else {
        console.log(`[settleAuctionTxn] Order for auction ${auctionId} already exists, skipping creation.`);
      }

      console.log(`[settleAuctionTxn] Settled completed auction ${auctionId} - Winner: ${winnerName} (${winnerId}) at ${finalPrice} JOD`);

      // (notify) capture the winner's contact details for the post-commit
      // side effects (FCM push + webhooks). NOTHING is sent from in here:
      // Firestore retries this callback on contention — and a last-second bid
      // on a settling auction is exactly that — so a send inside the txn fires
      // the winner's "you won 🎉" push once per retry. Capture in, send out.
      const winnerData = (winnerSnap && winnerSnap.exists) ? winnerSnap.data() : null;
      notifyData = {
        phone: (winnerData && winnerData.phoneNumber) || '',
        fcmToken: (winnerData && winnerData.fcmToken) || '',
        winnerId, winnerName, finalPrice, auctionTitle: auctionData.title || '', auctionId,
      };
    } else if (decision.outcome === 'reserve_not_met') {
      // A winner exists but the top bid never cleared the hidden reserve.
      // Per spec: NO sale, NO order, NO wonCount. Relist-able.
      const rnmUpdate = {
        status: 'reserve_not_met',
        settledAt: admin.firestore.FieldValue.serverTimestamp()
      };
      // E3 Slice C — below-reserve near-miss: a real bidder exists but never
      // cleared the reserve. Stamp a bounded (24h) offer so the seller can
      // one-tap accept the top bid (then the buyer confirms). NO order + NO
      // wallet movement here — that only happens on seller-accept / buyer-
      // confirm via the acceptBelowReserve / confirmBelowReserve callables.
      // reserve_not_met already implies totalBids>0 && winnerId, so there is
      // always a real top bid to offer.
      if (winnerId) {
        rnmUpdate.belowReserveOffer = {
          topBid: finalPrice,
          topBidderId: winnerId,
          topBidderName: winnerName,
          expiresAt: admin.firestore.Timestamp.fromMillis(belowReserveExpiryMs(Date.now())),
          status: 'pending_seller',
        };
      }
      // E3 Slice B — stamp auto-relist eligibility (24h after the auction end)
      // when the seller opted in and the cap isn't hit. autoRelistSweep picks
      // these up but WAITS while a below-reserve offer is still live
      // (shouldAutoRelist → belowReserveBlocksRelist). NEVER on a sold outcome.
      addRelistEligibility(rnmUpdate, freshData, auctionData);
      transaction.update(auctionRef, rnmUpdate);
      settled = true;
      // (notify) capture the seller prompt — sent post-commit (never inside the
      // retrying txn). Seller phone is fetched post-commit only when set.
      if (winnerId) {
        belowReserveNotify = {
          sellerId: auctionData.sellerId || freshData.sellerId || '',
          auctionId,
          auctionTitle: auctionData.title || freshData.title || '',
          topBid: finalPrice,
        };
      }
      console.log(`[settleAuctionTxn] Reserve not met for ${auctionId} (top ${finalPrice} < reserve ${reservePrice}) — below-reserve offer opened, no order created`);
    } else {
      // Close without bidder
      const unsoldUpdate = {
        status: 'ended',
        settledAt: admin.firestore.FieldValue.serverTimestamp()
      };
      // E3 Slice B — same auto-relist eligibility stamp for a truly unsold lot.
      addRelistEligibility(unsoldUpdate, freshData, auctionData);
      transaction.update(auctionRef, unsoldUpdate);
      settled = true;
      console.log(`[settleAuctionTxn] Closed unsold auction ${auctionId}`);
    }
  });

  // (notify) post-commit: fire ONLY when this run actually settled a winner.
  // Outside the transaction so retries never double-send; postToN8n never throws.
  if (notifyData) {
    // Winner push. Post-commit for the same reason as the webhooks below — a
    // retried transaction must never re-send it. Never throws: a dead FCM token
    // must not fail a settlement that has already committed.
    if (notifyData.fcmToken) {
      await admin.messaging().send({
        token: notifyData.fcmToken,
        notification: {
          title: 'تهانينا! لقد فزت بالمزاد 🎉',
          body: `مبروك! لقد انتهى المزاد على "${notifyData.auctionTitle}" بعرضك الفائز بقيمة ${notifyData.finalPrice.toLocaleString()} دينار أردني.`
        }
      }).catch(err => console.warn(`FCM error for winner ${notifyData.winnerId}: ${err.message}`));
    }

    await postToN8n('auction_won', {
      phone: notifyData.phone, name: notifyData.winnerName,
      auctionId: notifyData.auctionId, auctionTitle: notifyData.auctionTitle,
      amount: notifyData.finalPrice,
      buyersPremium: buyerPremiumJod(notifyData.finalPrice),
      totalDue: totalDueJod(notifyData.finalPrice),
      paymentHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      idempotencyKey: `${notifyData.auctionId}_auction_won`,
    });
    await postToN8n('payment_due', {
      phone: notifyData.phone, name: notifyData.winnerName,
      auctionId: notifyData.auctionId, auctionTitle: notifyData.auctionTitle,
      amount: notifyData.finalPrice,
      buyersPremium: buyerPremiumJod(notifyData.finalPrice),
      totalDue: totalDueJod(notifyData.finalPrice),
      paymentHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      idempotencyKey: `${notifyData.auctionId}_payment_due`,
    });
  }

  // (notify) E3 Slice C — prompt the seller that a below-reserve offer is open.
  // Post-commit + never-throws for the same reason as the win webhooks above.
  if (belowReserveNotify) {
    let sellerPhone = '';
    if (belowReserveNotify.sellerId) {
      try {
        const sSnap = await db.collection('users').doc(belowReserveNotify.sellerId).get();
        sellerPhone = (sSnap.exists && sSnap.data().phoneNumber) || '';
      } catch (e) { console.warn('[n8n] below-reserve seller phone lookup failed:', e && e.message); }
    }
    await postToN8n('below_reserve_offer', {
      phone: sellerPhone,
      sellerId: belowReserveNotify.sellerId,
      auctionId: belowReserveNotify.auctionId,
      auctionTitle: belowReserveNotify.auctionTitle,
      topBid: belowReserveNotify.topBid,
      idempotencyKey: `${belowReserveNotify.auctionId}_below_reserve_offer`,
    });
  }

  return { settled, orderId: settledOrderId };
}

/**
 * 1. scheduledAuctionCloser (BUG #2 & BUG #6 Compliance)
 * Runs every minute to sweep, settle & close expired auctions with transactional consistency.
 * Prevents client-reliant closing so that auctions always conclude on server-set time.
 */
exports.scheduledAuctionCloser = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    
    console.log('[scheduledAuctionCloser] Executing minute cron check for expired active listings and migrating old listings...');

    try {
      // Query all auctions in states: active, live, upcoming
      const querySnap = await db.collection('auctions')
        .where('status', 'in', ['active', 'live', 'upcoming'])
        .get();

      if (querySnap.empty) {
        console.log('[scheduledAuctionCloser] No active, live, or upcoming listings found.');
        return null;
      }

      console.log(`[scheduledAuctionCloser] Scanning ${querySnap.size} active/live/upcoming listings for migration and expiration check...`);

      const promises = querySnap.docs.map(async (auctionDoc) => {
        const auctionId = auctionDoc.id;
        const auctionData = auctionDoc.data();
        let endsAt = auctionData.endsAt;
        let endTime = auctionData.endTime;
        let endsAtMs = 0;
        let needsMigration = false;

        // 1. Resolve endsAt to epoch ms
        if (endsAt) {
          if (typeof endsAt === 'object' && typeof endsAt.toMillis === 'function') {
            endsAtMs = endsAt.toMillis();
          } else if (endsAt.seconds !== undefined) {
            endsAtMs = endsAt.seconds * 1000;
          } else {
            endsAtMs = new Date(endsAt).getTime();
          }
        }

        // 2. Fallback to endTime & Migrate if endsAt is absent
        if (!endsAt && endTime) {
          endsAtMs = typeof endTime === 'number' ? endTime : (endTime.seconds ? endTime.seconds * 1000 : Date.parse(endTime));
          endsAt = admin.firestore.Timestamp.fromMillis(endsAtMs);
          needsMigration = true;
        }

        if (needsMigration && endsAt) {
          console.log(`[scheduledAuctionCloser] Migrating old auction ${auctionId} - setting endsAt to Firestore Timestamp.`);
          await auctionDoc.ref.update({
            endsAt: endsAt,
            endTime: endsAtMs
          }).catch(err => console.error(`Migration fail for auction ${auctionId}`, err));
        }

        // 3. Check if active/live auction has expired
        const isLive = auctionData.status === 'active' || auctionData.status === 'live';
        // E3 first_bid safety: a 'first_bid' lot goes live with NO endTime and
        // starts its clock only on the first bid. Until then endsAtMs is 0, so
        // `isExpired` is false and it is never settled/closed — it stays open
        // indefinitely awaiting that first bid. Once a bid sets endsAt, normal
        // expiry applies. This guard makes that intent explicit (endsAtMs > 0).
        const isExpired = endsAtMs > 0 && endsAtMs <= nowMs;

        if (isLive && isExpired) {
          console.log(`[scheduledAuctionCloser] Settling expired auction ${auctionId}...`);
          // Full settle logic lives in settleAuctionTxn (shared with simulateSettleNow).
          // Per-auction guard: a throw here (e.g. fail-closed reserve read) must
          // abort only THIS auction's settle this sweep — log and let the other
          // auctions settle; the per-minute cron retries this one next run.
          try {
            await settleAuctionTxn(auctionDoc.ref, auctionData);
          } catch (settleErr) {
            console.error(`[scheduledAuctionCloser] Settle failed for ${auctionId} — will retry next sweep:`, settleErr);
          }
        }
      });

      await Promise.all(promises);
      console.log('[scheduledAuctionCloser] Completed settlement sweep successfully.');
    } catch (err) {
      console.error('[scheduledAuctionCloser Global Error]', err);
    }
    return null;
  });

/**
 * scheduledAuctionOpener
 * Runs every minute; flips `upcoming` auctions whose scheduledStartAt has
 * arrived to `live`, resetting the countdown from `duration` at open time.
 * Only touches auctions that HAVE a scheduledStartAt (null = manual open).
 */
exports.scheduledAuctionOpener = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const nowMs = admin.firestore.Timestamp.now().toMillis();
    try {
      const snap = await db.collection('auctions').where('status', '==', 'upcoming').get();
      if (snap.empty) return null;

      const promises = snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let startMs = data.scheduledStartAt;
        if (startMs === null || startMs === undefined) return; // manual-open drop; skip
        if (typeof startMs === 'object' && typeof startMs.toMillis === 'function') {
          startMs = startMs.toMillis();
        } else if (typeof startMs !== 'number') {
          startMs = new Date(startMs).getTime();
        }
        if (!(startMs > 0) || startMs > nowMs) return; // not due yet

        const durationSec = Number(data.duration) > 0 ? Number(data.duration) : 600;

        return db.runTransaction(async (tx) => {
          const fresh = await tx.get(docSnap.ref);
          const fd = fresh.data();
          if (!fd || fd.status !== 'upcoming') return; // already opened / changed
          // Mirror approveListing's go-live fields so an auto-opened auction is
          // NOT left counted as a pending approval (AdminDashboardView badge,
          // SellerCenterView bucket) and sorts correctly (LiveStreamView uses approvedAt).
          const goLive = {
            status: 'live',
            approvalStatus: 'approved',
            isApproved: true,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: 'scheduledAuctionOpener',
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          // E3 first_bid: go live NOW but leave endTime/endsAt absent — the
          // duration clock starts on the first bid (applyBidWrites/computeBidEndTime).
          // Scheduled lots reset their countdown from `duration` at open time.
          if (fd.startMode !== 'first_bid') {
            const openMs = admin.firestore.Timestamp.now().toMillis();
            const endMs = openMs + durationSec * 1000;
            goLive.endTime = endMs;
            goLive.endsAt = admin.firestore.Timestamp.fromMillis(endMs);
          }
          tx.update(docSnap.ref, goLive);
        }).catch((err) => console.error(`[scheduledAuctionOpener] open failed for ${docSnap.id}`, err));
      });

      await Promise.all(promises);
    } catch (err) {
      console.error('[scheduledAuctionOpener]', err);
    }
    return null;
  });

/**
 * autoRelistSweep (E3 Slice B)
 * Every 60 minutes: finds auctions whose `relistEligibleAt` (stamped 24h after an
 * unsold / reserve-not-met settlement, seller opted in) has passed and creates a
 * FRESH listing for each — a brand-new auction doc copying the sale-relevant
 * fields, with autoRelistCount incremented.
 *
 * IDEMPOTENCY / anti-spam (three layers):
 *  1. The stamp only lands when the seller opted in AND autoRelistCount < cap
 *     (settleAuctionTxn → addRelistEligibility → shouldAutoRelist).
 *  2. Each relist runs in a transaction that RE-READS the original and bails
 *     unless shouldAutoRelist is still true, then marks the ORIGINAL
 *     `{ relisted: true }`. That mark makes shouldAutoRelist false forever after,
 *     so a later sweep (or an overlapping run — the tx reads the original, so a
 *     concurrent writer forces a retry that then sees relisted:true) never
 *     re-processes it. Exactly one replacement per original.
 *  3. autoRelistCount carries onto the child (prev+1); once it reaches the cap
 *     the child never gets a stamp, so the chain terminates at MAX_AUTO_RELISTS.
 */
exports.autoRelistSweep = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    try {
      const snap = await db.collection('auctions')
        .where('relistEligibleAt', '<=', now)
        .get();
      if (snap.empty) {
        console.log('[autoRelistSweep] Nothing eligible for relist.');
        return null;
      }
      console.log(`[autoRelistSweep] ${snap.size} candidate(s) past relistEligibleAt.`);

      const promises = snap.docs.map(async (docSnap) => {
        const origRef = docSnap.ref;
        const origId = origRef.id;
        // Pre-generate the child ref so a tx retry reuses the SAME id (no dupes).
        const newRef = db.collection('auctions').doc();
        const newId = newRef.id;
        try {
          let created = false;
          let reservePrice = null;
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(origRef);
            if (!fresh.exists) return;
            const d = fresh.data();
            // Re-check under the transaction: opted in, under cap, not already
            // relisted. The `relisted` mark below makes this false on any retry
            // or later sweep — exactly-once.
            if (!shouldAutoRelist(d, Date.now())) return;

            // Reserve copy: read the admin-only secret INSIDE the tx (all reads
            // before writes). Absent = no reserve; nothing to copy.
            const secretSnap = await tx.get(db.collection('auctionSecrets').doc(origId));
            if (secretSnap.exists) reservePrice = secretSnap.data().reservePrice ?? null;

            // A below-reserve offer that the seller accepted but the buyer never
            // confirmed leaves a stale pending order. We only reach here once the
            // offer window lapsed (shouldAutoRelist blocks a live offer), so cancel
            // that zombie order and expire the offer as we relist — no orphan +
            // duplicate-listing pair. (reads before writes.)
            const origOrderSnap = await tx.get(db.collection('orders').doc(origId));

            const nowMs = Date.now();
            const durationSec = Number(d.duration) > 0 ? Number(d.duration) : 600;
            const startMode = d.startMode === 'first_bid' ? 'first_bid' : 'scheduled';
            const startingPrice = d.startingPrice;

            const child = {
              id: newId,
              title: d.title || '',
              description: d.description || '',
              category: d.category || '',
              channel: d.channel || 'misc',
              thumbnailUrl: d.thumbnailUrl || '',
              startingPrice: startingPrice,
              currentPrice: startingPrice,
              minIncrement: d.minIncrement ?? 10,
              duration: durationSec,
              sellerId: d.sellerId || '',
              sellerName: d.sellerName || 'Seller',
              createdById: d.createdById || d.sellerId || '',
              startMode: startMode,
              autoRelist: true,
              autoRelistCount: (d.autoRelistCount || 0) + 1,
              relistedFrom: origId, // provenance (audit / analytics)
              totalBids: 0,
              currentBidderId: null,
              currentBidderName: null,
              isApproved: true,
              approvalStatus: 'approved',
              status: startMode === 'first_bid' ? 'live' : 'upcoming',
              // Open promptly: scheduled lots are flipped live by the opener on
              // its next run; first_bid lots are already live here.
              scheduledStartAt: nowMs,
              createdAt: nowMs,
              createdByName: d.createdByName || d.sellerName || 'Seller',
              paymentWindowHours: resolvePaymentWindowHours(d.paymentWindowHours),
              openedAt: admin.firestore.FieldValue.serverTimestamp(),
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
              approvedBy: 'autoRelistSweep',
            };
            // Conditional / optional sale fields — Firestore rejects explicit
            // undefined, so only copy when present.
            if (typeof startingPrice === 'number') child.currentPriceFils = Math.round(startingPrice * 1000);
            if (Array.isArray(d.mediaUrls) && d.mediaUrls.length > 0) child.mediaUrls = d.mediaUrls;
            if (d.imageUrl) child.imageUrl = d.imageUrl;
            if (typeof d.marketPrice === 'number') child.marketPrice = d.marketPrice;
            if (d.antiSnipeWindowSec != null) child.antiSnipeWindowSec = d.antiSnipeWindowSec;
            if (d.antiSnipeExtendSec != null) child.antiSnipeExtendSec = d.antiSnipeExtendSec;
            if (d.vendorId != null) child.vendorId = d.vendorId;
            if (d.vendorName) child.vendorName = d.vendorName;
            if (d.condition) child.condition = d.condition;
            if (reservePrice && reservePrice > 0) child.reserveMet = false;
            // first_bid: NO endTime/endsAt (clock starts on the first bid).
            // scheduled: fixed window from now.
            if (startMode !== 'first_bid') {
              const endMs = nowMs + durationSec * 1000;
              child.endTime = endMs;
              child.endsAt = admin.firestore.Timestamp.fromMillis(endMs);
            }

            // (a) mark the ORIGINAL relisted (idempotency — fires once); expire a
            // still-open below-reserve offer so it can't be acted on post-relist.
            const origUpdate = { relisted: true };
            if (d.belowReserveOffer && (d.belowReserveOffer.status === 'pending_seller' || d.belowReserveOffer.status === 'pending_buyer')) {
              origUpdate['belowReserveOffer.status'] = 'expired';
            }
            tx.update(origRef, origUpdate);
            // (a2) cancel a stale seller-accepted-but-unconfirmed order.
            if (origOrderSnap.exists && origOrderSnap.data().status === 'pending_buyer_confirmation') {
              tx.update(origOrderSnap.ref, { status: 'cancelled', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
            // (b) create the fresh listing
            tx.set(newRef, child);
            created = true;
          });

          // Copy the reserve secret for the new listing (outside the tx: it's a
          // different collection doc and non-critical to the atomic relist mark).
          if (created && reservePrice && reservePrice > 0) {
            await db.collection('auctionSecrets').doc(newId).set({ reservePrice })
              .catch((e) => console.warn(`[autoRelistSweep] reserve copy failed for ${newId}:`, e));
          }
          if (created) {
            console.log(`[autoRelistSweep] Relisted ${origId} -> ${newId} (cap ${MAX_AUTO_RELISTS}).`);
          }
        } catch (relErr) {
          console.error(`[autoRelistSweep] Relist failed for ${origId} — will retry next sweep:`, relErr);
        }
      });

      await Promise.all(promises);
      console.log('[autoRelistSweep] Sweep complete.');
    } catch (err) {
      console.error('[autoRelistSweep Global Error]', err);
    }
    return null;
  });

/**
 * paymentDefaultEnforcer
 * Every 30 minutes: any order still waiting_payment past its paymentDeadlineAt
 * is marked defaulted and the buyer is blocked (isBlocked) pending admin review.
 * Re-run / runner-up offer is a manual admin decision in v1.
 */
exports.paymentDefaultEnforcer = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    try {
      // A. Auto-expiry: lift any cooldown whose blockedUntil has elapsed so the
      // user regains bidding and the UI/ban banner clears without a bid attempt.
      // Permanent bans have no blockedUntil, so they never match this query.
      const expiredSnap = await db.collection('users')
        .where('blockedUntil', '<=', now)
        .get();
      for (const uDoc of expiredSnap.docs) {
        const u = uDoc.data();
        if (u.isBlocked === true) {
          await uDoc.ref.set(
            {
              isBlocked: false,
              blockedUntil: admin.firestore.FieldValue.delete(),
              blockedReason: admin.firestore.FieldValue.delete(),
            },
            { merge: true }
          );
          console.log(`[paymentDefaultEnforcer] cooldown expired — unblocked ${uDoc.id}`);
        }
      }

      // B. Default any order past its payment deadline and advance the buyer's
      // strike ladder (1st = 48h, repeat = 3-month). Group by buyer so a buyer
      // with N newly-defaulted orders advances N strikes computed once.
      const snap = await db.collection('orders')
        .where('status', '==', 'waiting_payment')
        .where('paymentDeadlineAt', '<=', now)
        .get();
      if (snap.empty) return null;

      const ordersByBuyer = new Map();
      const noBuyer = [];
      for (const doc of snap.docs) {
        const buyerId = doc.data().buyerId;
        if (!buyerId) { noBuyer.push(doc); continue; }
        if (!ordersByBuyer.has(buyerId)) ordersByBuyer.set(buyerId, []);
        ordersByBuyer.get(buyerId).push(doc);
      }

      const markDefaulted = (batch, doc) => {
        const o = doc.data();
        batch.update(doc.ref, { status: 'defaulted', defaultedAt: admin.firestore.FieldValue.serverTimestamp() });
        batch.set(db.collection('system_health').doc(), {
          type: 'payment_fail',
          title: `Order defaulted (${resolvePaymentWindowHours(o.paymentWindowHours)}h unpaid)`,
          details: `Order ${doc.id} (${o.auctionTitle || ''}) buyer ${o.buyerName || o.buyerId} — ${o.totalDue || o.winningBidAmount} JOD. Buyer blocked; decide re-run/runner-up.`,
          source: 'paymentDefaultEnforcer',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      };

      for (const [buyerId, docs] of ordersByBuyer.entries()) {
        const userRef = db.collection('users').doc(buyerId);
        const userSnap = await userRef.get();
        const currentStrikes = userSnap.exists ? (Number(userSnap.data().strikeCount) || 0) : 0;
        // A "miss" is one occasion, not one-per-order: multiple unpaid wins
        // lapsing in the SAME run count as a single strike, so a first-time
        // defaulter with several same-night wins still gets the 48h tier (not
        // an instant 3-month suspension). Advance at most +1 per enforcer run.
        const newStrikes = currentStrikes + 1;
        const { blockedUntil, blockedReason } = resolvePaymentDefaultBan(newStrikes, nowMs);

        const batch = db.batch();
        for (const doc of docs) markDefaulted(batch, doc);
        batch.set(userRef, {
          isBlocked: true,
          blockedUntil: admin.firestore.Timestamp.fromMillis(blockedUntil),
          blockedReason,
          strikeCount: newStrikes,
        }, { merge: true });
        await batch.commit();
        console.log(`[paymentDefaultEnforcer] buyer ${buyerId}: +1 strike (${docs.length} order(s) defaulted) → ${newStrikes}, ${blockedReason} until ${new Date(blockedUntil).toISOString()}`);
      }

      // Orders with no buyer id: still default them (no strike to apply).
      for (const doc of noBuyer) {
        const batch = db.batch();
        markDefaulted(batch, doc);
        await batch.commit();
      }
    } catch (err) {
      console.error('[paymentDefaultEnforcer]', err);
    }
    return null;
  });

/**
 * pollN8nHealth
 * Every 15 minutes: pull execution stats for the two n8n workflows (WhatsApp
 * bot + notification pipe) via the n8n API and write a single status doc the
 * admin health tab reads in real time. If the failure rate crosses 20%,
 * append an incident to system_health (de-duped to at most one per hour per
 * workflow). Requires N8N_API_KEY + N8N_BASE_URL; if either is unset this is
 * a clean no-op (same discipline as postToN8n). NEVER throws — a failed poll
 * only logs and leaves the last-known system_status/current doc intact.
 */
const N8N_HEALTH_WORKFLOWS = [
  { key: 'bot', id: 'WB0gnN7vZUmi4tS7', label: 'bot' },
  { key: 'notifications', id: 'F8kFAQkiwlmxSYMI', label: 'notifications' },
];

exports.pollN8nHealth = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const apiKey = process.env.N8N_API_KEY;
    const baseUrl = process.env.N8N_BASE_URL;
    if (!apiKey || !baseUrl) {
      console.log('[pollN8nHealth] N8N_API_KEY / N8N_BASE_URL not configured — skipping.');
      return null;
    }

    try {
      const n8n = {};

      for (const wf of N8N_HEALTH_WORKFLOWS) {
        try {
          const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/executions?workflowId=${wf.id}&limit=100`;
          const res = await fetch(url, {
            headers: { 'X-N8N-API-KEY': apiKey },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) {
            console.warn(`[pollN8nHealth] n8n API ${res.status} for workflow ${wf.key} — skipping this block.`);
            continue;
          }
          const body = await res.json();
          // Tolerate both API shapes: { data: [...] } (n8n public API) or a bare array.
          const executions = Array.isArray(body) ? body : (Array.isArray(body.data) ? body.data : []);
          const total = executions.length;
          const errors = executions.filter((ex) =>
            ex.status === 'error' || (ex.finished === false && !!ex.stoppedAt)
          ).length;
          const failureRate = total > 0 ? errors / total : 0;
          n8n[wf.key] = {
            total,
            errors,
            failureRate,
            checkedAt: admin.firestore.Timestamp.now(),
          };
        } catch (wfErr) {
          console.warn(`[pollN8nHealth] Poll failed for workflow ${wf.key}:`, wfErr && wfErr.message);
        }
      }

      if (Object.keys(n8n).length === 0) {
        console.warn('[pollN8nHealth] No workflow blocks fetched — leaving last status doc intact.');
        return null;
      }

      await db.collection('system_status').doc('current').set({
        n8n,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Threshold incidents (de-duped: at most one per workflow per hour).
      for (const wf of N8N_HEALTH_WORKFLOWS) {
        const stats = n8n[wf.key];
        if (!stats || stats.failureRate <= 0.2) continue;
        const title = `n8n ${wf.label} failure rate high`;
        try {
          const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
          const recent = await db.collection('system_health')
            .where('source', '==', 'pollN8nHealth')
            .where('title', '==', title)
            .where('createdAt', '>=', oneHourAgo)
            .limit(1)
            .get();
          if (!recent.empty) continue;
          await db.collection('system_health').add({
            type: 'error',
            title,
            details: `${Math.round(stats.failureRate * 100)}% over last ${stats.total} runs`,
            source: 'pollN8nHealth',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[pollN8nHealth] Incident logged: ${title} (${Math.round(stats.failureRate * 100)}%)`);
        } catch (incErr) {
          console.warn(`[pollN8nHealth] Incident write failed for ${wf.key}:`, incErr && incErr.message);
        }
      }
    } catch (err) {
      console.error('[pollN8nHealth]', err);
    }
    return null;
  });

/**
 * 2. onBidCreated (BUG #5 Compliance)
 * Activates instant real-time outbid notifications.
 * Sends push messaging to the outbid user (previousBidderId) the instant a higher bid enters the database subcollection.
 */
exports.onBidCreated = functions.firestore
  .document('auctions/{auctionId}/bids/{bidId}')
  .onCreate(async (snapshot, context) => {
    const bidData = snapshot.data();
    const auctionId = context.params.auctionId;

    const amount = bidData.amount;
    const bidderId = bidData.bidderId;

    try {
      // Get the current leading auction document to retrieve the previous bidder details recorded during transaction
      const auctionSnap = await db.collection('auctions').doc(auctionId).get();
      if (!auctionSnap.exists) {
        console.warn(`[onBidCreated] Auction ${auctionId} not found.`);
        return null;
      }

      const auctionData = auctionSnap.data();

      // Maintain the room's reserve-met label without leaking the amount.
      // Only flip false -> true (once), and only when a reserve actually exists.
      try {
        const secretSnap = await db.collection('auctionSecrets').doc(auctionId).get();
        const rp = secretSnap.exists ? (secretSnap.data().reservePrice ?? null) : null;
        if (rp) {
          const met = reserveMet(auctionData.currentPrice ?? amount, rp);
          if (met && auctionData.reserveMet !== true) {
            await db.collection('auctions').doc(auctionId).update({ reserveMet: true });
          }
        }
      } catch (rmErr) {
        console.warn(`[onBidCreated] reserveMet update failed for ${auctionId}:`, rmErr);
      }

      const previousBidderId = auctionData.previousBidderId;

      // Only notify if there is an active previous bidder and they are not the person who just bid
      if (previousBidderId && previousBidderId !== bidderId) {
        const prevUserSnap = await db.collection('users').doc(previousBidderId).get();
        if (prevUserSnap.exists) {
          const prevUserData = prevUserSnap.data();
          const fcmToken = prevUserData.fcmToken;

          if (fcmToken) {
            console.log(`[onBidCreated] Dispatching FCM outbid notification to user ${previousBidderId}`);
            
            const payload = {
              token: fcmToken,
              notification: {
                title: 'تجاوزك أحد! ⚡',
                body: `لقد مزاد شخص آخر بسعر أعلى (${amount.toLocaleString()} JOD) على "${auctionData.title}". زايد الآن لاسترجاع الصدارة!`
              },
              data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                auctionId: auctionId,
                bidAmount: String(amount)
              }
            };

            await admin.messaging().send(payload);
            console.log('[onBidCreated] FCM dispatch successful.');
          } else {
            console.log(`[onBidCreated] User ${previousBidderId} does not have a registered FCM Token.`);
          }

          // (notify) WhatsApp outbid — fires even without an FCM token; never throws.
          await postToN8n('outbid', {
            phone: (prevUserData && prevUserData.phoneNumber) || '',
            name: (prevUserData && prevUserData.name) || 'Bidder',
            auctionId: auctionId,
            auctionTitle: (auctionData && auctionData.title) || '',
            amount: amount,
            idempotencyKey: `outbid_${context.params.bidId}`,
          });
        }
      }
    } catch (err) {
      console.error('[onBidCreated Error]', err);
    }
    return null;
  });

/**
 * onOrderStatusChanged
 * Emits a WhatsApp webhook event when an order's `status` transitions to a
 * notify-worthy value (shipped/delivered/etc). Never fires on create, and
 * never on waiting_payment (that's covered by payment_due at auction close),
 * so there's no overlap with the closer's events.
 */
exports.onOrderStatusChanged = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (before.status === after.status) return null; // no status change
    const NOTIFY = {
      preparing_shipment: 'order_preparing',
      shipped: 'order_shipped',
      delivered: 'order_delivered',
      completed: 'order_completed',
      refunded: 'order_refunded',
    };
    const event = NOTIFY[after.status];
    if (!event) return null;
    let phone = '';
    try {
      if (after.buyerId) {
        const u = await db.collection('users').doc(after.buyerId).get();
        phone = (u.exists && u.data().phoneNumber) || '';
      }
    } catch (e) { console.warn('[n8n] order phone lookup failed:', e && e.message); }
    await postToN8n(event, {
      phone, name: after.buyerName || 'Buyer',
      orderId: context.params.orderId, auctionId: after.auctionId || '',
      auctionTitle: after.auctionTitle || '', amount: after.winningBidAmount || 0,
      status: after.status, trackingNumber: after.trackingNumber || '',
      idempotencyKey: `${context.params.orderId}_${after.status}`,
    });
    return null;
  });

/**
 * Shared bid helpers — extracted from placeBid so simulateBid applies the
 * EXACT same end-time resolution, min-next-bid pricing, and anti-snipe rules.
 */

// Resolve an auction's end time to epoch ms, prioritizing endsAt Timestamp
// over the legacy endTime field (extracted from placeBid).
function resolveAuctionEndMs(auctionData) {
  let endTime = auctionData.endsAt || auctionData.endTime;
  if (typeof endTime === 'object' && endTime.seconds) {
    endTime = endTime.seconds * 1000;
  } else if (typeof endTime === 'string') {
    endTime = Date.parse(endTime);
  }
  return endTime;
}

// Min-next-bid rule (extracted from placeBid): the FIRST bid may equal the
// asking price; every later bid must clear currentPrice + minIncrement.
// All math in integer fils to avoid float loss.
function bidPricing(auctionData) {
  const currentPriceFils = Math.round((auctionData.currentPrice || auctionData.startingPrice || 0) * 1000);
  const minIncrementFils = Math.round((auctionData.minIncrement || 10) * 1000);
  const totalBids = auctionData.totalBids || 0;
  const minRequiredFils = totalBids > 0 ? (currentPriceFils + minIncrementFils) : currentPriceFils;
  return { currentPriceFils, minIncrementFils, totalBids, minRequiredFils };
}

// Buffered transaction writes for ONE accepted bid (extracted from placeBid):
// bid doc under auctions/{id}/bids + auction pricing fields + anti-snipe
// extension (+15s when 0 < timeRemaining < 10s). Caller has already validated
// auction state and bid amount. bid.isSimulated adds the flag to the bid doc
// ONLY when true — real bids keep the exact same shape as before.
function applyBidWrites(transaction, auctionRef, auctionData, bid) {
  const totalBids = auctionData.totalBids || 0;

  const bidRef = auctionRef.collection('bids').doc();
  const bidDoc = {
    id: bidRef.id,
    auctionId: auctionRef.id,
    amount: bid.amountJod,
    amountFils: bid.amountFils,
    bidderId: bid.bidderId,
    bidderName: bid.bidderName,
    bidderAvatar: bid.bidderAvatar || '',
    timestamp: Date.now()
  };
  if (bid.isSimulated) {
    bidDoc.isSimulated = true;
  }
  transaction.set(bidRef, bidDoc);

  // End time after this bid. 'first_bid' listings start their clock on the FIRST
  // bid (now + duration); every other bid applies the anti-snipe soft close.
  const nowMs = Date.now();
  const finalEndTime = computeBidEndTime(auctionData, totalBids, bid.endTimeMs, nowMs);

  transaction.update(auctionRef, {
    currentPrice: bid.amountJod,
    currentPriceFils: bid.amountFils,
    currentBidderId: bid.bidderId,
    currentBidderName: bid.bidderName,
    totalBids: totalBids + 1,
    endTime: finalEndTime,
    endsAt: admin.firestore.Timestamp.fromMillis(finalEndTime),
    previousBidderId: auctionData.currentBidderId || null
  });

  return { finalEndTime, bidId: bidRef.id };
}

/**
 * 3. placeBid Callable Cloud Function
 * Handles the high-frequency and critical bidding business rules transactionally in a single Firestore runTransaction block.
 * Ensures subscription checking, blocking, pricing thresholds, sniper extensions, wallet deductively atomic locking,
 * and outbid user refunding are guaranteed without race-conditions or browser-side vulnerability bypasses.
 * Balances and calculations are implemented in integer FILS to prevent float decimals loss.
 */
/**
 * getServerTime (CORR1) — echoes the SERVER's own clock so the client can derive
 * a latency-compensated client↔server offset (src/utils/serverTime.ts). No auth,
 * no inputs, no side effects: it is a read-only clock probe. Because the value
 * comes from the server's own Date.now() and uses NO client-supplied data, a
 * client cannot game it to shift the offset — and even if it tampers with its
 * own local timestamps in the offset math, that only skews its own UI clock; the
 * placeBid transaction below re-checks endTime with the real server clock, so no
 * client can bid or settle past the true auction close.
 */
exports.getServerTime = functions.runWith({ cors: true }).https.onCall(async () => {
  return { now: Date.now() };
});

// PF3: keep one instance warm so the first bid of a drop doesn't eat a 2-5s
// cold start at the open stampede; cap parallelism (bid contention is on the
// single auction doc anyway — tune maxInstances after the load test).
//
// Load-tested 2026-07-24 (docs/PERFORMANCE.md): maxInstances:20 caused real
// platform-level HTTP 500s (not app errors — placeBid's own execution logs
// showed zero internal failures) starting at ~500 concurrent bidders.
// Confirmed via direct A/B on a throwaway project: 0 errors at
// maxInstances:500 under the same load, clean up to 2,000 concurrent
// bidders. Raised accordingly — this only bounds a burst ceiling and costs
// nothing at idle; minInstances:1 (unchanged) is the only always-billed part.
exports.placeBid = functions.runWith({ cors: true, minInstances: 1, maxInstances: 500 }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const { auctionId, amount } = data; // amount is in JOD (double)

  if (!auctionId || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid auctionId or amount.');
  }

  try {
    const txnResult = await db.runTransaction(async (transaction) => {
      // 1. Get user profile
      const userRef = db.collection('users').doc(userId);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        return { success: false, message: 'User profile not found.' };
      }
      const userData = userSnap.data();

      // Idempotency: Server-side rate limit check (prevent bids faster than every 1.5 seconds)
      const lastBidAt = userData.lastBidAt || 0;
      const now = Date.now();
      if (now - lastBidAt < 1500) {
        return { success: false, message: 'يرجى الانتظار لحظة قبل المزايدة مرة أخرى' };
      }

      if (isEffectivelyBlocked(userData, Date.now())) {
        return { success: false, message: 'Account restricted. Bidding disabled.' };
      }
      const subExpiry = userData.subscriptionExpiry;
      const subExpiryMs = subExpiry && subExpiry.toMillis ? subExpiry.toMillis() : (typeof subExpiry === 'number' ? subExpiry : null);
      if (userData.subscriptionStatus !== 'active' || (subExpiryMs && subExpiryMs <= Date.now())) {
        return { success: false, message: 'MEMBERSHIP_REQUIRED' };
      }

      // 2. Get auction item
      const auctionRef = db.collection('auctions').doc(auctionId);
      const auctionSnap = await transaction.get(auctionRef);
      if (!auctionSnap.exists) {
        return { success: false, message: 'Auction listing not found.' };
      }
      const auctionData = auctionSnap.data();
      if (auctionData.status !== 'live' && auctionData.status !== 'active') {
        return { success: false, message: 'This auction is not accepting bids.' };
      }

      // Idempotency: Prevent rapid double-click bid of the exact same amount on the same auction by same user
      const amountFils = Math.round(amount * 1000);
      const { currentPriceFils, minRequiredFils } = bidPricing(auctionData);
      if (auctionData.currentBidderId === userId && currentPriceFils === amountFils) {
        return { success: false, message: 'لقد قمت بتقديم هذا العرض بالفعل.' };
      }

      // Determine end time, prioritizing endsAt Timestamp over old endTime
      const endTime = resolveAuctionEndMs(auctionData);
      if (endTime && endTime <= Date.now()) {
        return { success: false, message: 'This auction has already ended.' };
      }

      if (amountFils < minRequiredFils) {
        return { success: false, message: `Minimum bid of ${(minRequiredFils / 1000).toLocaleString()} JOD required.` };
      }

      // 5. Update user profile with rate limit timestamp
      transaction.update(userRef, {
        lastBidAt: now
      });

      // 7. + 10. Write new bid document and update the auction details
      // (anti-sniping and pricing) via the shared helper.
      const { finalEndTime } = applyBidWrites(transaction, auctionRef, auctionData, {
        amountJod: amount,
        amountFils: amountFils,
        bidderId: userId,
        bidderName: userData.name || 'User',
        bidderAvatar: userData.avatar || '',
        endTimeMs: endTime
      });

      // 11. The system chat "winning bid" indicator is a SIDE EFFECT — it does
      // not need transactional consistency with the money-state. It is written
      // AFTER the txn commits (below) to shrink the lock window on the hot
      // auction doc. We only pass the payload out here.
      return {
        success: true,
        message: `Successfully bid ${amount} JOD! You are currently the highest bidder.`,
        amount,
        finalEndTime,
        _chat: {
          auctionId,
          userId,
          userName: userData.name || 'User',
          userAvatar: userData.avatar || '',
          amount
        }
      };
    });

    // POST-COMMIT side effect: system chat bid indicator. The bid has ALREADY
    // committed at this point — a chat write failure must NEVER fail the bid,
    // so it is logged and swallowed. Awaited (not fire-and-forget) so the write
    // is guaranteed to run before the function freezes, but it happens OUTSIDE
    // the transaction, so the auction-doc lock is already released.
    if (txnResult && txnResult.success && txnResult._chat) {
      const c = txnResult._chat;
      try {
        const chatRef = db.collection('chats').doc();
        await chatRef.set({
          id: chatRef.id,
          auctionId: c.auctionId,
          userId: c.userId,
          userName: c.userName,
          userAvatar: c.userAvatar,
          text: `placed a winning bid of ${c.amount.toLocaleString()} JOD`,
          timestamp: Date.now(),
          isSystem: false,
          isBid: true,
          bidAmount: c.amount
        });
      } catch (chatErr) {
        console.warn('[placeBid] post-commit chat write failed (bid already committed, ignoring):', chatErr && chatErr.message);
      }
      // Strip the internal side-effect payload from the client response so the
      // response shape stays byte-identical to before.
      const { _chat, ...clientResult } = txnResult;
      return clientResult;
    }

    return txnResult;
  } catch (error) {
    console.error('Error during transaction:', error);
    // Transaction contention / deadline / unavailable is a RETRIABLE infra
    // condition on the hot auction doc — NOT a real bid rejection. Genuine
    // validation errors never reach here (they return {success:false} inside
    // the txn). Surface a distinct, retriable 'aborted' code so the client can
    // offer a friendly "try again" instead of a scary generic 'internal'.
    const code = error && (error.code !== undefined ? error.code : error.status);
    const msg = (error && error.message) || '';
    const isContention =
      code === 10 || code === 4 || code === 14 || // gRPC ABORTED / DEADLINE_EXCEEDED / UNAVAILABLE
      code === 'aborted' || code === 'deadline-exceeded' || code === 'unavailable' ||
      code === 'ABORTED' || code === 'DEADLINE_EXCEEDED' || code === 'UNAVAILABLE' ||
      /aborted|deadline exceeded|too much contention|contention|unavailable/i.test(msg);
    if (isContention) {
      throw new functions.https.HttpsError('aborted', 'PRICE_MOVED_RETRY');
    }
    throw new functions.https.HttpsError('internal', msg || 'Transaction failed.');
  }
});

/**
 * 4. releaseEscrow Callable Cloud Function
 * Admin approved release of locked escrow funds. Adds balance to user wallet if it represents cliq fast topup.
 */
exports.releaseEscrow = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const handlerUserId = context.auth.uid;
  const { escrowId } = data;

  if (!escrowId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid escrowId.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // Verify user role
      const handlerUserRef = db.collection('users').doc(handlerUserId);
      const handlerSnap = await transaction.get(handlerUserRef);
      if (!handlerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Authenticated user not found.');
      }
      const handlerData = handlerSnap.data();
      if (handlerData.role !== 'admin' && !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Administrators only.');
      }

      const escrowRef = db.collection('escrows').doc(escrowId);
      const escrowSnap = await transaction.get(escrowRef);
      if (!escrowSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Escrow transaction not found.');
      }
      const escrowData = escrowSnap.data();
      if (escrowData.status !== 'locked') {
        throw new functions.https.HttpsError('failed-precondition', 'Escrow is not locked.');
      }

      // Read bidder wallet BEFORE writing to escrow, if it is a CliQ Top-up
      let bidderWalletSnap = null;
      const bidderWalletRef = db.collection('wallets').doc(escrowData.bidderId);
      if (escrowData.auctionId === 'cliq-dep') {
        bidderWalletSnap = await transaction.get(bidderWalletRef);
      }

      // Mark escrow as released
      transaction.update(escrowRef, { status: 'released' });

      // If it was a CliQ Top-Up transfer approval, add balance to wallet!
      if (escrowData.auctionId === 'cliq-dep') {
        const addedFils = escrowData.amountFils || Math.round((escrowData.amount || 0) * 1000);

        if (bidderWalletSnap && bidderWalletSnap.exists) {
          const wData = bidderWalletSnap.data();
          const oldAvail = wData.availableBalance || 0;
          const oldEscrow = wData.escrowBalance || 0;
          const newAvail = oldAvail + addedFils;

          transaction.set(bidderWalletRef, {
            userId: escrowData.bidderId,
            availableBalance: newAvail,
            escrowBalance: oldEscrow,
            totalBalance: newAvail + oldEscrow
          }, { merge: true });
        } else {
          transaction.set(bidderWalletRef, {
            userId: escrowData.bidderId,
            availableBalance: addedFils,
            escrowBalance: 0,
            totalBalance: addedFils
          });
        }
      }

      // Log admin action
      const actionRef = db.collection('adminActions').doc();
      transaction.set(actionRef, {
        id: actionRef.id,
        actionType: 'release_escrow',
        targetId: escrowId,
        targetName: `Escrow: ${escrowData.auctionTitle || 'Auction Item'}`,
        adminName: handlerData.name || 'Admin',
        timestamp: Date.now(),
        details: 'Admin reviewed and approved release.'
      });

      return { success: true, message: 'Escrow released successfully.' };
    });
  } catch (error) {
    console.error('Error in releaseEscrow:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
  }
});

/**
 * 5. refundEscrow Callable Cloud Function
 * Refund locked escrow funds back to bidder’s available balance & subtract from escrow.
 */
exports.refundEscrow = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const handlerUserId = context.auth.uid;
  const { escrowId } = data;

  if (!escrowId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid escrowId.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // Verify user role
      const handlerUserRef = db.collection('users').doc(handlerUserId);
      const handlerSnap = await transaction.get(handlerUserRef);
      if (!handlerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Authenticated user not found.');
      }
      const handlerData = handlerSnap.data();
      if (handlerData.role !== 'admin' && !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Administrators only.');
      }

      const escrowRef = db.collection('escrows').doc(escrowId);
      const escrowSnap = await transaction.get(escrowRef);
      if (!escrowSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Escrow transaction not found.');
      }
      const escrowData = escrowSnap.data();
      if (escrowData.status !== 'locked') {
        throw new functions.https.HttpsError('failed-precondition', 'Escrow is not locked.');
      }

      // Read bidder wallet BEFORE writing to escrow, if not a cliq-dep
      let bidderWalletSnap = null;
      const bidderWalletRef = db.collection('wallets').doc(escrowData.bidderId);
      if (escrowData.auctionId !== 'cliq-dep') {
        bidderWalletSnap = await transaction.get(bidderWalletRef);
      }

      // Mark escrow as refunded
      transaction.update(escrowRef, { status: 'refunded' });

      // Return escrow funds back to bidder’s wallet (availableBalance increase, escrowBalance decrease)
      if (escrowData.auctionId !== 'cliq-dep') {
        const refundAmtFils = escrowData.amountFils || Math.round((escrowData.amount || 0) * 1000);

        if (bidderWalletSnap && bidderWalletSnap.exists) {
          const wData = bidderWalletSnap.data();
          const oldAvail = wData.availableBalance || 0;
          const oldEscrow = wData.escrowBalance || 0;

          const newEscrow = Math.max(0, oldEscrow - refundAmtFils);
          const newAvail = oldAvail + refundAmtFils;

          transaction.set(bidderWalletRef, {
            userId: escrowData.bidderId,
            availableBalance: newAvail,
            escrowBalance: newEscrow,
            totalBalance: newAvail + newEscrow
          }, { merge: true });
        }
      }

      // Log admin action
      const actionRef = db.collection('adminActions').doc();
      transaction.set(actionRef, {
        id: actionRef.id,
        actionType: 'refund_escrow',
        targetId: escrowId,
        targetName: `Refund: ${escrowData.auctionTitle || 'Auction Item'}`,
        adminName: handlerData.name || 'Admin',
        timestamp: Date.now(),
        details: 'Admin reviewed and approved refund.'
      });

      return { success: true, message: 'Escrow refunded successfully.' };
    });
  } catch (error) {
    console.error('Error in refundEscrow:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
  }
});

/**
 * 6. requestTopUp Callable Cloud Function
 * Enrolls a manual Top-Up request as a locked CliQ escrow transfer record on the database safely.
 */
exports.requestTopUp = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const { amount, alias, paymentProofUrl, escrowId: passedEscrowId } = data; // amount is in JOD (double)

  if (typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid top-up amount.');
  }

  try {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userSnap.data();

    const escrowId = passedEscrowId || `cliq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const amountFils = Math.round(amount * 1000);

    const newCliQTransaction = {
      id: escrowId,
      walletId: 'wallet-current',
      auctionId: 'cliq-dep',
      auctionTitle: 'CliQ Fast Top-up request',
      bidderId: userId,
      bidderName: userData.name || 'User',
      sellerId: 'system',
      sellerName: 'Central Reserve Bank',
      amount: amount,
      amountFils: amountFils,
      status: 'locked',
      timestamp: Date.now(),
      paymentProofUrl: paymentProofUrl || '',
      receiptUrl: paymentProofUrl || '',
      paymentProofImage: paymentProofUrl || '',
      cliqAlias: alias || ''
    };

    await db.collection('escrows').doc(escrowId).set(newCliQTransaction);

    return { success: true, escrowId, message: 'Top-up request registered successfully.' };
  } catch (error) {
    console.error('Error in requestTopUp:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
  }
});

/**
 * 7. requestSubscription Callable Cloud Function
 * Enrolls a premium/pro subscription request safely on the server side 
 * and marks the user's subscriptionStatus as 'pending'.
 */
exports.requestSubscription = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  const { price, paymentProofUrl, paymentProofImage, transferFullName, transferPhone } = data;

  // Wave 1 S3 — the PRICE is the anchor. Derive the canonical tier + duration
  // from the amount (the admin verifies the CliQ proof against it); NEVER trust
  // the client's plan label, and reject any amount not in the tier table.
  // (The old `price || 15` / `plan || 'monthly'` fallbacks were latent mis-grants.)
  const resolved = resolveTierByPrice(price);
  if (!resolved) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Invalid subscription price: ${JSON.stringify(price)}. Offered amounts are 1, 4 or 7 JD.`
    );
  }

  try {
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }

    const userData = userSnap.data();
    const reqId = `sub-req-${Date.now()}-${userId}`;
    const proofUrl = paymentProofUrl || paymentProofImage || '';

    const newRequest = {
      id: reqId,
      userId: userId,
      userName: userData.name || 'User',
      userEmail: userData.email || '',
      // Server-derived canonical values (approveSubscription re-derives anyway).
      plan: resolved.tier,
      tier: resolved.tier,
      durationDays: resolved.durationDays,
      price: price,
      paymentProofUrl: proofUrl,
      paymentProofImage: proofUrl,
      transferFullName: transferFullName || '',
      transferPhone: transferPhone || '',
      status: 'pending',
      subscriptionStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();

    // 1. Create the subscription request document inside subscriptionRequests
    const reqRef = db.collection('subscriptionRequests').doc(reqId);
    batch.set(reqRef, newRequest);

    // 2. Set user status on the user doc. An already-active member upgrading
    // stays 'active' (bidding is gated on it) — only non-active users flip to
    // pending. The REQUEST doc is always 'pending' (needs review) regardless.
    batch.set(userRef, {
      subscriptionStatus: userStatusForSubscriptionRequest(userData.subscriptionStatus),
      subscriptionPlan: resolved.tier,
      paymentProofUrl: proofUrl,
      paymentProofImage: proofUrl,
      transferFullName: transferFullName || '',
      transferPhone: transferPhone || ''
    }, { merge: true });

    await batch.commit();

    return { success: true, reqId, message: 'Subscription request registered successfully.' };

  } catch (error) {
    console.error('Error in requestSubscription:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
  }
});

/**
 * 7b. approveSubscription Callable Cloud Function (Wave 1 S3)
 * Admin-only. The SOLE writer of the users/{uid} subscription-grant fields
 * (Firestore rules block all client writes to them, including the admin
 * client). Recomputes the grant duration server-side from the request's
 * verified amount / canonical tier — never from a client plan label.
 * Idempotent: re-approving an approved request is a no-op.
 *
 * Input: { reqId } (approve a subscriptionRequests doc)
 *     or { userId, tier? } (direct comped grant — the admin "activate user
 *        directly" flow; tier defaults to 'monthly', offered tiers only).
 */
const SUBSCRIPTION_ERROR_CODES = ['invalid-argument', 'not-found', 'failed-precondition'];

exports.approveSubscription = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { reqId, userId, tier } = data || {};

  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    let result;
    if (reqId) {
      result = await approveSubscriptionRequest(deps, reqId);
    } else if (userId) {
      result = await grantSubscriptionDirect(deps, { userId, ...(tier ? { tier } : {}) });
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Either reqId or userId is required.');
    }

    if (result.alreadyApproved) {
      return { success: true, alreadyApproved: true, message: 'Request was already approved — no changes made.' };
    }

    // Log the conversion server-side (mirrors the old client analytics event).
    await db.collection('analytics_events').add({
      eventType: 'subscription_conversion',
      userId: result.userId,
      userEmail: result.userEmail || null,
      timestamp: Date.now(),
      metadata: {
        plan: result.tier,
        durationDays: result.durationDays,
        price: typeof result.price === 'number' ? result.price : 0,
        reqId: reqId || null,
        direct: !reqId,
        approvedBy: context.auth.uid,
      },
    }).catch((e) => console.warn('[approveSubscription] analytics log failed:', e && e.message));

    console.log(`[approveSubscription] Granted ${result.tier}/${result.durationDays}d to ${result.userId} (by ${context.auth.uid}, reqId=${reqId || 'direct'})`);
    return {
      success: true,
      alreadyApproved: false,
      userId: result.userId,
      tier: result.tier,
      durationDays: result.durationDays,
      expiryMs: result.expiryMs,
    };
  } catch (error) {
    console.error('Error in approveSubscription:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = SUBSCRIPTION_ERROR_CODES.includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});

/**
 * 7c. rejectSubscription Callable Cloud Function (Wave 1 S3)
 * Admin-only counterpart of approveSubscription — needed because the rules
 * now block ALL client writes to the user subscription fields, including the
 * admin client's old reject/downgrade updateDoc.
 * Input: { reqId } (reject a request; downgrades the user only if still
 * 'pending' — never wipes an active membership) or { userId } (direct reject).
 */
exports.rejectSubscription = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { reqId, userId, reason } = data || {};

  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    const result = await rejectSubscriptionRequest(deps, { reqId, userId, reason });
    console.log(`[rejectSubscription] Rejected (reqId=${result.reqId || 'direct'}, userId=${result.userId}, downgraded=${result.userDowngraded}) by ${context.auth.uid}`);
    let phone = '';
    let userSnap = null;
    try {
      userSnap = result.userId ? await db.collection('users').doc(result.userId).get() : null;
      phone = userSnap && userSnap.exists ? (userSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[rejectSubscription] phone lookup failed:', e); }
    // Only notify on a real reviewed request rejection (reqId). A bare
    // direct-downgrade admin action returns reqId: null and must stay silent —
    // it predates this slice and was never meant to trigger a rejection message.
    if (result.reqId) {
      await postToN8n('membership_rejected', {
        phone,
        name: (userSnap && userSnap.exists ? (userSnap.data().name || 'Member') : 'Member'),
        reason: result.reason || '',
        reqId: result.reqId || null,
        idempotencyKey: `membership_rejected_${result.reqId || result.userId}`,
      });
    }
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in rejectSubscription:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = SUBSCRIPTION_ERROR_CODES.includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});

/**
 * verifyOrderPayment — Slice B (Verify & Approve).
 * Admin verifies (or rejects) a buyer's self-claimed CliQ payment on an order.
 * State machine + idempotency live in orderPaymentVerify.js (unit-tested);
 * this wrapper is admin-gating + the post-commit WhatsApp notify.
 */
exports.verifyOrderPayment = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, action, reason } = data || {};
  if (action !== 'verify' && action !== 'reject') {
    throw new functions.https.HttpsError('invalid-argument', "action must be 'verify' or 'reject'.");
  }
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    if (action === 'verify') {
      const result = await verifyOrderPaymentTxn(deps, { orderId, adminUid: context.auth.uid });
      console.log(`[verifyOrderPayment] verified order=${orderId} already=${result.alreadyVerified} by ${context.auth.uid}`);
      return { success: true, ...result };
    }
    const result = await rejectOrderPaymentTxn(deps, { orderId, adminUid: context.auth.uid, reason });
    // Post-commit, best-effort: tell the buyer why, so they can resubmit.
    let phone = '';
    try {
      const buyerSnap = result.buyerId ? await db.collection('users').doc(result.buyerId).get() : null;
      phone = buyerSnap && buyerSnap.exists ? (buyerSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[verifyOrderPayment] buyer phone lookup failed:', e); }
    await postToN8n('order_payment_rejected', {
      phone, name: result.buyerName, reason: result.reason, orderId,
      idempotencyKey: `order_payment_rejected_${orderId}`,
    });
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in verifyOrderPayment:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument', 'failed-precondition'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});

/**
 * sendFulfillmentNudge — Slice C (Fulfillment). Admin nudges a seller to
 * ship or a buyer to confirm delivery. Manual-only: this callable is the
 * ONLY way a nudge fires — nothing calls it on a timer/trigger.
 */
exports.sendFulfillmentNudge = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, kind } = data || {};
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    const result = await sendFulfillmentNudgeTxn(deps, { orderId, kind, adminUid: context.auth.uid });

    let phone = '';
    try {
      const targetSnap = result.targetUserId ? await db.collection('users').doc(result.targetUserId).get() : null;
      phone = targetSnap && targetSnap.exists ? (targetSnap.data().phoneNumber || '') : '';
    } catch (e) { console.warn('[sendFulfillmentNudge] target phone lookup failed:', e); }

    const event = kind === 'ship' ? 'seller_ship_nudge' : 'buyer_confirm_nudge';
    // Hour-bucketed key: dedupes accidental same-click retries within a clock-hour,
    // but still lets a deliberately-later repeat nudge (a spec requirement) through;
    // the exact window is tunable once the n8n Switch branches + real dedup are wired.
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    await postToN8n(event, {
      phone, name: result.targetUserName, orderId,
      idempotencyKey: `${event}_${orderId}_${hourBucket}`,
    });

    console.log(`[sendFulfillmentNudge] ${kind} nudge sent for order=${orderId} by ${context.auth.uid}`);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in sendFulfillmentNudge:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument', 'failed-precondition'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});

/**
 * stampDisputeResolution — Slice D (Disputes). Records the admin's
 * resolution note AFTER the real resolution (release/refund/resume) has
 * already happened via the existing, unmodified resolve_dispute path.
 * This callable moves no money and re-derives nothing from order state —
 * it is purely descriptive metadata.
 */
exports.stampDisputeResolution = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { orderId, resolutionType, notes } = data || {};
  try {
    const deps = { db, Timestamp: admin.firestore.Timestamp };
    const result = await stampDisputeResolutionTxn(deps, { orderId, resolutionType, adminUid: context.auth.uid, notes });
    console.log(`[stampDisputeResolution] ${resolutionType} note stamped for order=${orderId} by ${context.auth.uid}`);
    return { success: true, ...result };
  } catch (error) {
    console.error('Error in stampDisputeResolution:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    const code = ['not-found', 'invalid-argument'].includes(error.code) ? error.code : 'internal';
    throw new functions.https.HttpsError(code, error.message || 'Operation failed.');
  }
});

/**
 * 8. onUserCreated (Auth Trigger)
 * Automatically triggers on user signup in Auth to construct profile doc & wallet safely on the server side.
 */
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const userRef = db.collection('users').doc(uid);
  const walletRef = db.collection('wallets').doc(uid);

  const cleanEmail = user.email ? user.email.toLowerCase().trim() : '';
  const isAutoAdmin = cleanEmail === 'admaaqaba06@gmail.com';

  const batch = db.batch();

  // Create user doc if not exists
  batch.set(userRef, {
    id: uid,
    uid: uid,
    name: user.displayName || 'User',
    email: cleanEmail,
    avatar: user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    role: isAutoAdmin ? 'admin' : 'user',
    isAdmin: isAutoAdmin,
    accountStatus: 'active',
    isVerified: true,
    isBlocked: false,
    subscriptionStatus: 'none',
    subscriptionExpiry: null,
    phoneNumber: user.phoneNumber || '',
    phone: user.phoneNumber || '',
    city: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Create wallet doc if not exists
  batch.set(walletRef, {
    userId: uid,
    availableBalance: 0,
    escrowBalance: 0,
    totalBalance: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  try {
    await batch.commit();
    console.log(`[onUserCreated] Successfully initialized user profile and wallet for uid: ${uid}`);
  } catch (err) {
    console.error(`[onUserCreated Error] Failed for uid: ${uid}`, err);
  }
  return null;
});

/**
 * 9. initializeUserWallet (Callable)
 * Safely initializes or checks the presence of a user's wallet from server context.
 */
exports.initializeUserWallet = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;

  try {
    const walletRef = db.collection('wallets').doc(userId);
    const walletSnap = await walletRef.get();
    if (!walletSnap.exists) {
      await walletRef.set({
        userId,
        availableBalance: 0,
        escrowBalance: 0,
        totalBalance: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[initializeUserWallet] Initialized wallet for ${userId}`);
    }
    return { success: true, message: 'Wallet checked/initialized.' };
  } catch (error) {
    console.error(`[initializeUserWallet Error] Failed for userId: ${userId}`, error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to initialize wallet.');
  }
});

/**
 * 10. checkDuplicateAccount (Callable)
 * Server-side validation to check for duplicate phone numbers and names using Admin SDK.
 * Bypasses firestore client-side read security rules to ensure robust security.
 */
exports.checkDuplicateAccount = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  const phone = data.phone || '';
  const name = data.name || '';

  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedName = name.trim().toLowerCase();

  let phoneExists = false;
  let nameExists = false;

  console.log(`[checkDuplicateAccount] Checking duplicate for phone: ${phone} (${normalizedPhone}) and name: ${name} (${normalizedName})`);

  try {
    if (normalizedPhone) {
      const phoneSnap = await db.collection('users')
        .where('normalizedPhone', '==', normalizedPhone)
        .limit(1)
        .get();
      if (!phoneSnap.empty) {
        phoneExists = true;
      }
    }

    if (normalizedName) {
      const nameSnap = await db.collection('users')
        .where('normalizedName', '==', normalizedName)
        .limit(1)
        .get();
      if (!nameSnap.empty) {
        nameExists = true;
      }
    }

    return {
      phoneExists,
      nameExists,
      duplicate: phoneExists || nameExists
    };
  } catch (error) {
    console.error('[checkDuplicateAccount Error]', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to check duplicates.');
  }
});

/**
 * 11. repairEndedAuctionOrder (Callable)
 * Admin-only utility to repair any ended auction by creating its corresponding Order document
 * if the cron check didn't trigger or failed.
 */
exports.repairEndedAuctionOrder = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const handlerUserId = context.auth.uid;
  const { auctionId } = data;

  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid auctionId.');
  }

  try {
    const handlerUserRef = db.collection('users').doc(handlerUserId);
    const handlerSnap = await handlerUserRef.get();
    if (!handlerSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Authenticated user not found.');
    }
    const handlerData = handlerSnap.data();
    if (handlerData.role !== 'admin' && !context.auth.token.admin && (context.auth.token.email || '').toLowerCase() !== 'admaaqaba06@gmail.com') {
      throw new functions.https.HttpsError('permission-denied', 'Unauthorized. Administrators only.');
    }

    const auctionRef = db.collection('auctions').doc(auctionId);
    const auctionSnap = await auctionRef.get();
    if (!auctionSnap.exists) {
      return { success: false, message: 'Auction not found.' };
    }
    const auctionData = auctionSnap.data();

    // Check if there is a winner/highest bidder
    const winnerId = auctionData.currentBidderId || auctionData.highestBidderId || auctionData.winnerId;
    if (!winnerId) {
      return { success: false, message: 'No winner or highest bidder found for this auction.' };
    }

    const winnerName = auctionData.currentBidderName || auctionData.highestBidderName || auctionData.winnerName || 'Buyer';
    const finalPrice = auctionData.currentPrice || auctionData.startingPrice || 0;

    // Check if Order already exists
    const orderRef = db.collection('orders').doc(auctionId);
    const orderSnap = await orderRef.get();
    if (orderSnap.exists) {
      return { success: false, message: `Order for auction ${auctionId} already exists.` };
    }

    // Query escrow if any exists
    let escrowId = null;
    const escrowQuery = await db.collection('escrows')
      .where('auctionId', '==', auctionId)
      .where('bidderId', '==', winnerId)
      .where('status', '==', 'locked')
      .limit(1)
      .get();
    if (!escrowQuery.empty) {
      escrowId = escrowQuery.docs[0].id;
    }

    console.log("Checking ended auction:", auctionId);
    console.log("Winner:", winnerId);
    console.log("Final price:", finalPrice);
    console.log("Creating order:", auctionId);

    const orderPayload = {
      id: auctionId,
      auctionId: auctionId,
      auctionTitle: auctionData.title || '',
      auctionImage: auctionData.thumbnailUrl || auctionData.imageUrl || '',
      sellerId: auctionData.sellerId || '',
      sellerName: auctionData.sellerName || 'Seller',
      buyerId: winnerId,
      buyerName: winnerName,
      winningBidAmount: finalPrice,
      buyersPremium: buyerPremiumJod(finalPrice),
      totalDue: totalDueJod(finalPrice),
      sellerCommission: sellerCommissionFils(Math.round(finalPrice * 1000)) / 1000,
      sellerNet: sellerNetFils(Math.round(finalPrice * 1000)) / 1000,
      paymentDeadlineAt: paymentDeadlineFromNow(auctionData),
      paymentWindowHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      status: "waiting_payment",
      paymentStatus: "unpaid",
      shippingStatus: "not_started",
      escrowStatus: "locked",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (escrowId) {
      orderPayload.escrowId = escrowId;
    }

    await orderRef.set(orderPayload);
    console.log(`[repairEndedAuctionOrder] Created repaired order for auction ${auctionId}`);

    // (notify) mirror the closer: an admin-repaired win still owes payment, so
    // send the same auction_won + payment_due WhatsApp events. Never throws.
    let winnerPhone = '';
    try {
      const wSnap = await db.collection('users').doc(winnerId).get();
      winnerPhone = (wSnap.exists && wSnap.data().phoneNumber) || '';
    } catch (e) { console.warn('[n8n] repair phone lookup failed:', e && e.message); }
    await postToN8n('auction_won', {
      phone: winnerPhone, name: winnerName,
      auctionId, auctionTitle: auctionData.title || '', amount: finalPrice,
      buyersPremium: buyerPremiumJod(finalPrice),
      totalDue: totalDueJod(finalPrice),
      paymentHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      idempotencyKey: `${auctionId}_auction_won`,
    });
    await postToN8n('payment_due', {
      phone: winnerPhone, name: winnerName,
      auctionId, auctionTitle: auctionData.title || '', amount: finalPrice,
      buyersPremium: buyerPremiumJod(finalPrice),
      totalDue: totalDueJod(finalPrice),
      paymentHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      idempotencyKey: `${auctionId}_payment_due`,
    });

    return { success: true, message: `Successfully created repaired order for auction ${auctionId}.`, orderId: auctionId };

  } catch (error) {
    console.error('Error in repairEndedAuctionOrder:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
  }
});

/**
 * E3 Slice C — acceptBelowReserve (money-path).
 * The auction ended reserve_not_met with a real top bid; settleAuctionTxn
 * stamped a `belowReserveOffer` (status 'pending_seller'). The SELLER (or an
 * admin) one-taps to accept that top bid. This creates a PENDING order that the
 * top BIDDER must still confirm — so NO payment deadline, NO escrow lock, and
 * NO wallet movement happen here. Fees are the SAME as a normal sale, computed
 * from the below-reserve top bid via the shared settlement helpers (never
 * recomputed inline). Idempotent: an existing order short-circuits.
 */
exports.acceptBelowReserve = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }
  const callerUserId = context.auth.uid;
  const tokenEmail = (context.auth.token && context.auth.token.email) || '';
  const { auctionId } = data || {};
  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف المزاد مطلوب.');
  }

  try {
    let buyerNotify = null;
    const result = await db.runTransaction(async (transaction) => {
      buyerNotify = null; // reset each attempt — a retried txn must not re-emit a prior attempt's notify
      const auctionRef = db.collection('auctions').doc(auctionId);
      const orderRef = db.collection('orders').doc(auctionId);
      const callerRef = db.collection('users').doc(callerUserId);

      const [auctionSnap, orderSnap, callerSnap] = await Promise.all([
        transaction.get(auctionRef),
        transaction.get(orderRef),
        transaction.get(callerRef),
      ]);

      if (!auctionSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المزاد غير موجود.');
      }
      const auctionData = auctionSnap.data();
      const offer = auctionData.belowReserveOffer;
      if (!offer) {
        throw new functions.https.HttpsError('failed-precondition', 'لا يوجد عرض أقل من السعر المطلوب لهذا المزاد.');
      }

      const callerData = callerSnap.exists ? callerSnap.data() : {};
      const isAdmin = callerIsAdmin(callerData, tokenEmail);
      const isSeller = auctionData.sellerId && auctionData.sellerId === callerUserId;
      if (!isAdmin && !isSeller) {
        throw new functions.https.HttpsError('permission-denied', 'هذه العملية متاحة للبائع فقط.');
      }

      // Idempotency: an order already exists (this call already ran, or the
      // buyer already confirmed) — do not double-create or reopen.
      if (orderSnap.exists) {
        return { success: true, alreadyAccepted: true, message: 'تم قبول العرض مسبقاً.' };
      }

      if (offer.status !== 'pending_seller') {
        throw new functions.https.HttpsError('failed-precondition', 'العرض لم يعد بانتظار موافقة البائع.');
      }
      if (isBelowReserveOfferExpired(offer, Date.now())) {
        throw new functions.https.HttpsError('failed-precondition', 'انتهت مهلة قبول هذا العرض.');
      }

      const topBid = offer.topBid;
      const topBidderId = offer.topBidderId;
      const topBidderName = offer.topBidderName || 'Buyer';

      // Money-path: fees on the below-reserve top bid, computed with the SAME
      // shared helpers the sold path uses (buyer +5%, seller net 95%). PENDING —
      // no paymentDeadlineAt, no escrow lock. escrowStatus is a status field only.
      const orderPayload = {
        id: auctionId,
        auctionId: auctionId,
        auctionTitle: auctionData.title || '',
        auctionImage: auctionData.thumbnailUrl || auctionData.imageUrl || '',
        sellerId: auctionData.sellerId || '',
        sellerName: auctionData.sellerName || 'Seller',
        buyerId: topBidderId,
        buyerName: topBidderName,
        winningBidAmount: topBid,
        buyersPremium: buyerPremiumJod(topBid),
        totalDue: totalDueJod(topBid),
        sellerCommission: sellerCommissionFils(Math.round(topBid * 1000)) / 1000,
        sellerNet: sellerNetFils(Math.round(topBid * 1000)) / 1000,
        status: 'pending_buyer_confirmation',
        paymentStatus: 'unpaid',
        shippingStatus: 'not_started',
        escrowStatus: 'pending',
        belowReserve: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (auctionData.isSimulated === true) {
        orderPayload.isSimulated = true;
      }

      transaction.set(orderRef, orderPayload);
      transaction.update(auctionRef, {
        'belowReserveOffer.status': 'pending_buyer',
        'belowReserveOffer.sellerAcceptedAt': admin.firestore.FieldValue.serverTimestamp(),
        // Give the buyer a FRESH 24h window to confirm (not the residual of the
        // seller's window) — keeps the confirm window fair and keeps
        // belowReserveBlocksRelist blocking a relist until the buyer's window lapses.
        'belowReserveOffer.expiresAt': admin.firestore.Timestamp.fromMillis(belowReserveExpiryMs(Date.now())),
      });

      buyerNotify = {
        buyerId: topBidderId,
        buyerName: topBidderName,
        auctionId,
        auctionTitle: auctionData.title || '',
        topBid,
      };
      return { success: true, message: 'تم قبول العرض. بانتظار تأكيد المشتري.' };
    });

    // (notify) prompt the buyer to confirm. Post-commit, never-throws — a webhook
    // failure must not roll back an accepted offer.
    if (buyerNotify) {
      let buyerPhone = '';
      try {
        const bSnap = await db.collection('users').doc(buyerNotify.buyerId).get();
        buyerPhone = (bSnap.exists && bSnap.data().phoneNumber) || '';
      } catch (e) { console.warn('[n8n] below-reserve buyer phone lookup failed:', e && e.message); }
      await postToN8n('below_reserve_seller_accepted', {
        phone: buyerPhone,
        name: buyerNotify.buyerName,
        buyerId: buyerNotify.buyerId,
        auctionId: buyerNotify.auctionId,
        auctionTitle: buyerNotify.auctionTitle,
        topBid: buyerNotify.topBid,
        idempotencyKey: `${buyerNotify.auctionId}_below_reserve_accepted`,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in acceptBelowReserve:', error);
    throw new functions.https.HttpsError('internal', error.message || 'تعذر قبول العرض.');
  }
});

/**
 * E3 Slice C — confirmBelowReserve (money-path).
 * The seller accepted; the top BIDDER (or admin) confirms, turning the pending
 * order into a real obligation: status 'waiting_payment', escrowStatus 'locked'
 * (status field only — actual wallet movement stays with the existing
 * pay → verify → releaseOrderEscrow flow), and a 24h payment deadline via the
 * SAME paymentDeadlineFromNow helper a normal win uses. Idempotent.
 */
exports.confirmBelowReserve = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }
  const callerUserId = context.auth.uid;
  const tokenEmail = (context.auth.token && context.auth.token.email) || '';
  const { auctionId } = data || {};
  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف المزاد مطلوب.');
  }

  try {
    let buyerNotify = null;
    const result = await db.runTransaction(async (transaction) => {
      buyerNotify = null; // reset each attempt — a retried txn must not re-emit a prior attempt's notify
      const auctionRef = db.collection('auctions').doc(auctionId);
      const orderRef = db.collection('orders').doc(auctionId);
      const callerRef = db.collection('users').doc(callerUserId);

      const [auctionSnap, orderSnap, callerSnap] = await Promise.all([
        transaction.get(auctionRef),
        transaction.get(orderRef),
        transaction.get(callerRef),
      ]);

      if (!orderSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
      }
      const orderData = orderSnap.data();
      const auctionData = auctionSnap.exists ? auctionSnap.data() : {};

      const callerData = callerSnap.exists ? callerSnap.data() : {};
      const isAdmin = callerIsAdmin(callerData, tokenEmail);
      const isBuyer = orderData.buyerId && orderData.buyerId === callerUserId;
      if (!isAdmin && !isBuyer) {
        throw new functions.https.HttpsError('permission-denied', 'هذه العملية متاحة للمشتري فقط.');
      }

      // Idempotency: already confirmed (or beyond) — the obligation already exists.
      if (orderData.status !== 'pending_buyer_confirmation') {
        if (orderData.status === 'waiting_payment') {
          return { success: true, alreadyConfirmed: true, message: 'تم تأكيد الشراء مسبقاً.' };
        }
        throw new functions.https.HttpsError('failed-precondition', 'لا يمكن تأكيد هذا الطلب في حالته الحالية.');
      }

      // Guard the offer window: an expired offer can't be turned into a sale.
      const offer = auctionData.belowReserveOffer;
      if (offer && isBelowReserveOfferExpired(offer, Date.now())) {
        throw new functions.https.HttpsError('failed-precondition', 'انتهت مهلة تأكيد هذا العرض.');
      }

      transaction.update(orderRef, {
        status: 'waiting_payment',
        escrowStatus: 'locked',
        paymentDeadlineAt: paymentDeadlineFromNow(auctionData),
        paymentWindowHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (auctionSnap.exists) {
        transaction.update(auctionRef, {
          'belowReserveOffer.status': 'confirmed',
          'belowReserveOffer.buyerConfirmedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      buyerNotify = {
        buyerId: orderData.buyerId,
        buyerName: orderData.buyerName || 'Buyer',
        auctionId,
        auctionTitle: orderData.auctionTitle || '',
        amount: orderData.winningBidAmount,
        paymentHours: resolvePaymentWindowHours(auctionData && auctionData.paymentWindowHours),
      };
      return { success: true, message: 'تم تأكيد الشراء. يرجى إتمام الدفع.' };
    });

    // (notify) same auction_won + payment_due events a normal win fires — the
    // buyer now owes payment. Post-commit, never-throws.
    if (buyerNotify) {
      let buyerPhone = '';
      try {
        const bSnap = await db.collection('users').doc(buyerNotify.buyerId).get();
        buyerPhone = (bSnap.exists && bSnap.data().phoneNumber) || '';
      } catch (e) { console.warn('[n8n] below-reserve confirm phone lookup failed:', e && e.message); }
      const payload = {
        phone: buyerPhone, name: buyerNotify.buyerName,
        auctionId: buyerNotify.auctionId, auctionTitle: buyerNotify.auctionTitle,
        amount: buyerNotify.amount,
        buyersPremium: buyerPremiumJod(buyerNotify.amount),
        totalDue: totalDueJod(buyerNotify.amount),
        paymentHours: buyerNotify.paymentHours,
      };
      await postToN8n('auction_won', { ...payload, idempotencyKey: `${buyerNotify.auctionId}_auction_won` });
      await postToN8n('payment_due', { ...payload, idempotencyKey: `${buyerNotify.auctionId}_payment_due` });
    }

    return result;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in confirmBelowReserve:', error);
    throw new functions.https.HttpsError('internal', error.message || 'تعذر تأكيد الشراء.');
  }
});

/**
 * E3 Slice C — declineBelowReserve. The top BIDDER (or admin) declines the
 * seller-accepted offer: the pending order is cancelled and the offer marked
 * 'declined'. The auction stays reserve_not_met, so auto-relist (if the seller
 * opted in) picks it up — shouldAutoRelist stops blocking once status='declined'.
 * No wallet movement (nothing was ever locked). Idempotent.
 */
exports.declineBelowReserve = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول لتنفيذ هذه العملية.');
  }
  const callerUserId = context.auth.uid;
  const tokenEmail = (context.auth.token && context.auth.token.email) || '';
  const { auctionId } = data || {};
  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف المزاد مطلوب.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const auctionRef = db.collection('auctions').doc(auctionId);
      const orderRef = db.collection('orders').doc(auctionId);
      const callerRef = db.collection('users').doc(callerUserId);

      const [auctionSnap, orderSnap, callerSnap] = await Promise.all([
        transaction.get(auctionRef),
        transaction.get(orderRef),
        transaction.get(callerRef),
      ]);

      if (!orderSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الطلب غير موجود.');
      }
      const orderData = orderSnap.data();

      const callerData = callerSnap.exists ? callerSnap.data() : {};
      const isAdmin = callerIsAdmin(callerData, tokenEmail);
      const isBuyer = orderData.buyerId && orderData.buyerId === callerUserId;
      if (!isAdmin && !isBuyer) {
        throw new functions.https.HttpsError('permission-denied', 'هذه العملية متاحة للمشتري فقط.');
      }

      // Idempotency: already declined/cancelled.
      if (orderData.status === 'cancelled') {
        return { success: true, alreadyDeclined: true, message: 'تم رفض العرض مسبقاً.' };
      }
      // Only a still-pending (un-confirmed) offer can be declined. A confirmed
      // (waiting_payment) obligation can't be walked back here.
      if (orderData.status !== 'pending_buyer_confirmation') {
        throw new functions.https.HttpsError('failed-precondition', 'لا يمكن رفض هذا الطلب في حالته الحالية.');
      }

      transaction.update(orderRef, {
        status: 'cancelled',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (auctionSnap.exists && auctionSnap.data().belowReserveOffer) {
        transaction.update(auctionRef, {
          'belowReserveOffer.status': 'declined',
          'belowReserveOffer.buyerDeclinedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      return { success: true, message: 'تم رفض العرض.' };
    });
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error in declineBelowReserve:', error);
    throw new functions.https.HttpsError('internal', error.message || 'تعذر رفض العرض.');
  }
});

/**
 * 12. releaseOrderEscrow Callable Cloud Function (CRITICAL FIX PHASE 1)
 * Moves the financial logic of escrow release to a secure transactional server-side environment.
 * Ensures order completion, escrow release, wallet updates, and double-entry ledger logs are performed atomically.
 */
exports.releaseOrderEscrow = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'لا تملك صلاحية تنفيذ هذه العملية');
  }
  const callerUserId = context.auth.uid;
  const { orderId, action } = data;

  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'الطلب غير موجود');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read the order document from orders/{orderId}
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الطلب غير موجود');
      }
      const orderData = orderSnap.data();

      // 2. Validate basic properties of the order
      const buyerId = orderData.buyerId;
      const sellerId = orderData.sellerId;
      const auctionId = orderData.auctionId;

      if (!buyerId || !sellerId || !auctionId) {
        throw new functions.https.HttpsError('failed-precondition', 'بيانات الطلب غير مكتملة');
      }

      // Check authorization: Caller must be buyer OR admin
      const callerRef = db.collection('users').doc(callerUserId);
      const callerSnap = await transaction.get(callerRef);
      if (!callerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'ملف المستخدم غير موجود');
      }
      const callerData = callerSnap.data();
      const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';
      const isCallerBuyer = callerUserId === buyerId;

      if (!isCallerAdmin && !isCallerBuyer) {
        throw new functions.https.HttpsError('permission-denied', 'لا تملك صلاحية تنفيذ هذه العملية');
      }

      // 12. Idempotency check: If order is already completed or escrow is already released
      if (orderData.escrowStatus === 'released' || orderData.status === 'completed') {
        return { 
          success: true, 
          alreadyReleased: true, 
          message: "تم تحرير هذا المبلغ سابقاً" 
        };
      }

      // 3. Find the locked escrow document:
      let escrowRef = null;
      let escrowData = null;
      
      if (orderData.escrowId) {
        const directEscrowRef = db.collection('escrows').doc(orderData.escrowId);
        const directEscrowSnap = await transaction.get(directEscrowRef);
        if (directEscrowSnap.exists && directEscrowSnap.data().status === 'locked') {
          escrowRef = directEscrowRef;
          escrowData = directEscrowSnap.data();
        }
      }

      if (!escrowData) {
        const escrowQuery = await db.collection('escrows')
          .where('auctionId', '==', auctionId)
          .where('bidderId', '==', buyerId)
          .where('status', '==', 'locked')
          .limit(1)
          .get();

        if (!escrowQuery.empty) {
          escrowRef = escrowQuery.docs[0].ref;
          escrowData = escrowQuery.docs[0].data();
        }
      }

      // Under the membership model no escrow is created for bids, so a missing
      // escrow simply means there are no funds to move — the order must still complete.
      const hasEscrow = !!(escrowRef && escrowData);

      // 5. Determine amount for messaging/records
      let amountFils = 0;
      if (hasEscrow) {
        amountFils = escrowData.amountFils;
        if (!amountFils && escrowData.amount) {
          amountFils = Math.round(escrowData.amount * 1000);
        }
        if (!amountFils && orderData.winningBidAmount) {
          amountFils = Math.round(orderData.winningBidAmount * 1000);
        }

        if (!amountFils || amountFils <= 0) {
          throw new functions.https.HttpsError('failed-precondition', 'قيمة العملية غير صالحة');
        }
      } else if (orderData.winningBidAmount) {
        amountFils = Math.round(orderData.winningBidAmount * 1000);
      }

      const winningAmountJOD = amountFils / 1000;

      if (escrowRef && escrowData) {
        // 4. Read wallets (reads must precede writes inside the transaction)
        const buyerWalletRef = db.collection('wallets').doc(buyerId);
        const sellerWalletRef = db.collection('wallets').doc(sellerId);

        const buyerWalletSnap = await transaction.get(buyerWalletRef);
        const sellerWalletSnap = await transaction.get(sellerWalletRef);

        // 6. Validate balances
        const oldBuyerEscrow = buyerWalletSnap.exists ? (buyerWalletSnap.data().escrowBalance || 0) : 0;
        const oldBuyerAvail = buyerWalletSnap.exists ? (buyerWalletSnap.data().availableBalance || 0) : 0;

        if (oldBuyerEscrow < amountFils) {
          throw new functions.https.HttpsError('failed-precondition', 'رصيد المشتري المحجوز غير كافٍ');
        }

        // 7. Apply wallet movement
        const newBuyerEscrow = Math.max(0, oldBuyerEscrow - amountFils);
        const newBuyerTotal = oldBuyerAvail + newBuyerEscrow;

        // Seller receives the hammer MINUS Mazad's 5% seller commission (net 95 on
        // a 100 sale). The buyer's escrow is still debited the full hammer; the 5%
        // commission is retained by Mazad (not credited to the seller) — mirroring
        // how the 5% buyer premium is retained. Recorded on the ledger below.
        const commissionFils = sellerCommissionFils(amountFils);
        const sellerNetCreditFils = sellerNetFils(amountFils);
        const oldSellerAvail = sellerWalletSnap.exists ? (sellerWalletSnap.data().availableBalance || 0) : 0;
        const oldSellerEscrow = sellerWalletSnap.exists ? (sellerWalletSnap.data().escrowBalance || 0) : 0;
        const newSellerAvail = oldSellerAvail + sellerNetCreditFils;
        const newSellerTotal = newSellerAvail + oldSellerEscrow;

        // Execute Writes in Transaction
        transaction.set(buyerWalletRef, {
          userId: buyerId,
          availableBalance: oldBuyerAvail,
          escrowBalance: newBuyerEscrow,
          totalBalance: newBuyerTotal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        transaction.set(sellerWalletRef, {
          userId: sellerId,
          availableBalance: newSellerAvail,
          escrowBalance: oldSellerEscrow,
          totalBalance: newSellerTotal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 8. Update escrow status
        transaction.update(escrowRef, {
          status: 'released',
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          releasedBy: callerUserId,
          releaseReason: action || 'buyer_confirm_delivery',
          orderId: orderId
        });
      }

      // 9. Update order status
      transaction.update(orderRef, {
        status: 'completed',
        escrowStatus: 'released',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedBy: callerUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (escrowRef && escrowData) {
        // 10. Create double-entry ledger records
        const buyerLedgerRef = db.collection('ledger').doc();
        const sellerLedgerRef = db.collection('ledger').doc();

        transaction.set(buyerLedgerRef, {
          id: buyerLedgerRef.id,
          userId: buyerId,
          orderId: orderId,
          auctionId: auctionId,
          amount: -winningAmountJOD,
          amountFils: -amountFils,
          type: 'escrow_released_to_seller',
          direction: 'debit',
          titleAr: 'تحرير الضمان المالي للطلب',
          titleEn: 'Escrow Released to Seller',
          descriptionAr: `تم تحرير مبلغ الضمان بقيمة ${winningAmountJOD} د.أ وتحويله إلى البائع.`,
          descriptionEn: `Escrow funds of ${winningAmountJOD} JOD released to seller.`,
          timestamp: Date.now()
        });

        const sellerNetJOD = sellerNetCreditFils / 1000;
        const commissionJOD = commissionFils / 1000;
        transaction.set(sellerLedgerRef, {
          id: sellerLedgerRef.id,
          userId: sellerId,
          orderId: orderId,
          auctionId: auctionId,
          amount: sellerNetJOD,
          amountFils: sellerNetCreditFils,
          type: 'sale_payment_received',
          direction: 'credit',
          titleAr: 'تحصيل دفعة مبيعات',
          titleEn: 'Sale Payment Received',
          descriptionAr: `تم استلام ${sellerNetJOD} د.أ (بعد خصم عمولة مزاد جو ٥٪) في رصيدك.`,
          descriptionEn: `Received ${sellerNetJOD} JOD (after 5% Mazad commission) into your available balance.`,
          timestamp: Date.now()
        });

        // Mazad's 5% seller commission — the CREDIT leg to the platform revenue
        // account, so the release event's double-entry balances to zero
        // (buyer escrow −hammer, seller +net, platform +commission) and the
        // seller's own ledger sums to exactly what their wallet was credited (net).
        if (commissionFils > 0) {
          const commissionLedgerRef = db.collection('ledger').doc();
          transaction.set(commissionLedgerRef, {
            id: commissionLedgerRef.id,
            userId: 'mazad-platform', // synthetic platform revenue account, not the seller
            sellerId: sellerId,
            orderId: orderId,
            auctionId: auctionId,
            amount: commissionJOD,
            amountFils: commissionFils,
            type: 'seller_commission',
            direction: 'credit',
            titleAr: 'عمولة مزاد جو (٥٪)',
            titleEn: 'Mazad Commission (5%)',
            descriptionAr: `عمولة المنصة ٥٪ بقيمة ${commissionJOD} د.أ على سعر البيع.`,
            descriptionEn: `5% platform commission (${commissionJOD} JOD) on the sale price.`,
            timestamp: Date.now()
          });
        }

        // 11. Create audit log
        const auditLogRef = db.collection('financialAuditLogs').doc();
        transaction.set(auditLogRef, {
          id: auditLogRef.id,
          action: 'release_order_escrow',
          orderId: orderId,
          auctionId: auctionId,
          buyerId: buyerId,
          sellerId: sellerId,
          amount: winningAmountJOD,
          amountFils: amountFils,
          triggeredBy: callerUserId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      if (isCallerAdmin) {
        const adminActionsRef = db.collection('adminActions').doc();
        transaction.set(adminActionsRef, {
          id: adminActionsRef.id,
          orderId: orderId,
          action: action || 'release_escrow',
          adminId: callerUserId,
          adminName: callerData.name || 'Admin',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: hasEscrow
            ? `Force released escrow of ${winningAmountJOD} JOD to seller for order ${orderId}`
            : `Force completed order ${orderId} (no escrow funds to move)`
        });
      }

      // Write Order Activity record
      const activityRef = orderRef.collection('activity').doc();
      let messageAr;
      let messageEn;
      if (hasEscrow) {
        messageAr = isCallerAdmin
          ? `قام المشرف بفرض إغلاق الطلب وتحرير الضمان المالي بقيمة ${winningAmountJOD} د.أ للبائع.`
          : `تم الإفراج عن الضمان المالي بقيمة ${winningAmountJOD} د.أ وتحويله إلى محفظة البائع بنجاح.`;
        messageEn = isCallerAdmin
          ? `Admin forced close order and released secure Escrow funds of ${winningAmountJOD} JOD to seller.`
          : `Escrow funds of ${winningAmountJOD} JOD released and securely deposited into seller's wallet.`;
      } else {
        messageAr = isCallerAdmin
          ? 'قام المشرف بفرض إغلاق الطلب وتأكيد اكتماله.'
          : 'تم تأكيد استلام الطلب واكتماله بنجاح.';
        messageEn = isCallerAdmin
          ? 'Admin forced close order and confirmed its completion.'
          : 'Delivery confirmed and order completed successfully.';
      }

      transaction.set(activityRef, {
        id: activityRef.id,
        type: hasEscrow ? 'Escrow Released' : 'Order Completed',
        messageAr: messageAr,
        messageEn: messageEn,
        message: messageEn,
        performedBy: callerUserId,
        performedByName: callerData.name || 'User',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Notifications for Buyer and Seller
      const buyerNotifRef = db.collection('notifications').doc();
      const sellerNotifRef = db.collection('notifications').doc();

      transaction.set(buyerNotifRef, {
        id: buyerNotifRef.id,
        userId: buyerId,
        title: 'تم اكتمال الطلب',
        titleAr: 'تم اكتمال الطلب',
        titleEn: 'Order Completed',
        description: hasEscrow
          ? `الطلب رقم ${orderId.substring(0, 8)} مكتمل. تم تحويل الضمان للبائع.`
          : `الطلب رقم ${orderId.substring(0, 8)} مكتمل بنجاح.`,
        descriptionAr: hasEscrow
          ? `الطلب رقم ${orderId.substring(0, 8)} مكتمل. تم تحويل الضمان للبائع.`
          : `الطلب رقم ${orderId.substring(0, 8)} مكتمل بنجاح.`,
        descriptionEn: hasEscrow
          ? `Order #${orderId.substring(0, 8)} has been completed. Escrow funds transferred to seller.`
          : `Order #${orderId.substring(0, 8)} has been completed.`,
        type: 'info',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      transaction.set(sellerNotifRef, {
        id: sellerNotifRef.id,
        userId: sellerId,
        title: hasEscrow ? 'تحصيل رصيد مبيعات 🎉' : 'تم اكتمال الطلب 🎉',
        titleAr: hasEscrow ? 'تحصيل رصيد مبيعات 🎉' : 'تم اكتمال الطلب 🎉',
        titleEn: hasEscrow ? 'Sales Funds Collected 🎉' : 'Order Completed 🎉',
        description: hasEscrow
          ? `تم الإفراج عن مبلغ ${winningAmountJOD} د.أ وإضافته لرصيدك المتاح بنجاح!`
          : `الطلب رقم ${orderId.substring(0, 8)} مكتمل. أكد المشتري استلام الطلب.`,
        descriptionAr: hasEscrow
          ? `تم الإفراج عن مبلغ ${winningAmountJOD} د.أ وإضافته لرصيدك المتاح بنجاح!`
          : `الطلب رقم ${orderId.substring(0, 8)} مكتمل. أكد المشتري استلام الطلب.`,
        descriptionEn: hasEscrow
          ? `Funds of ${winningAmountJOD} JOD have been released to your available wallet balance.`
          : `Order #${orderId.substring(0, 8)} has been completed. The buyer confirmed delivery.`,
        type: 'win',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      return {
        success: true,
        message: hasEscrow
          ? `تم تحرير مبلغ ${winningAmountJOD} د.أ بنجاح للبائع.`
          : 'تم اكتمال الطلب بنجاح.'
      };
    });
  } catch (error) {
    console.error('Error in releaseOrderEscrow:', error);
    const arabicMsg = error.message || "تعذر تحرير المبلغ، حاول مرة أخرى";
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 12.5. refundOrderEscrow Callable Cloud Function (CRITICAL FIX REFUND)
 * Moves the financial logic of escrow refund to a secure transactional server-side environment.
 * Ensures order refunding, escrow refunding, wallet updates, and double-entry ledger logs are performed atomically.
 * Admin only.
 */
exports.refundOrderEscrow = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'لا تملك صلاحية تنفيذ هذه العملية');
  }
  const callerUserId = context.auth.uid;
  const { orderId, action } = data;

  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'الطلب غير موجود');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read the order document from orders/{orderId}
      const orderRef = db.collection('orders').doc(orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الطلب غير موجود');
      }
      const orderData = orderSnap.data();

      // 2. Validate basic properties of the order
      const buyerId = orderData.buyerId;
      const sellerId = orderData.sellerId;
      const auctionId = orderData.auctionId;

      if (!buyerId || !sellerId || !auctionId) {
        throw new functions.https.HttpsError('failed-precondition', 'بيانات الطلب غير مكتملة');
      }

      // Check authorization: Caller must be admin ONLY
      const callerRef = db.collection('users').doc(callerUserId);
      const callerSnap = await transaction.get(callerRef);
      if (!callerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'ملف المستخدم غير موجود');
      }
      const callerData = callerSnap.data();
      const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

      if (!isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح للقيام بهذه العملية، يجب أن تكون مشرفاً فقط');
      }

      // Idempotency check: If order is already refunded
      if (orderData.escrowStatus === 'refunded' || orderData.status === 'refunded') {
        return { 
          success: true, 
          alreadyRefunded: true, 
          message: "تم استرداد هذا المبلغ سابقاً" 
        };
      }

      // 3. Find the locked escrow document:
      let escrowRef = null;
      let escrowData = null;
      
      if (orderData.escrowId) {
        const directEscrowRef = db.collection('escrows').doc(orderData.escrowId);
        const directEscrowSnap = await transaction.get(directEscrowRef);
        if (directEscrowSnap.exists) {
          const status = directEscrowSnap.data().status;
          if (status === 'refunded') {
            return {
              success: true,
              alreadyRefunded: true,
              message: "تم استرداد هذا المبلغ سابقاً"
            };
          }
          if (status === 'locked') {
            escrowRef = directEscrowRef;
            escrowData = directEscrowSnap.data();
          }
        }
      }

      if (!escrowData) {
        const escrowQuery = await db.collection('escrows')
          .where('auctionId', '==', auctionId)
          .where('bidderId', '==', buyerId)
          .limit(1)
          .get();

        if (!escrowQuery.empty) {
          const docSnap = escrowQuery.docs[0];
          const status = docSnap.data().status;
          if (status === 'refunded') {
            return {
              success: true,
              alreadyRefunded: true,
              message: "تم استرداد هذا المبلغ سابقاً"
            };
          }
          if (status === 'locked') {
            escrowRef = docSnap.ref;
            escrowData = docSnap.data();
          }
        }
      }

      // Under the membership model no escrow is created for bids, so a missing
      // escrow simply means there are no funds to move — the order must still be refunded.
      const hasEscrow = !!(escrowRef && escrowData);

      // 5. Determine amount for messaging/records
      let amountFils = 0;
      if (hasEscrow) {
        amountFils = escrowData.amountFils;
        if (!amountFils && escrowData.amount) {
          amountFils = Math.round(escrowData.amount * 1000);
        }
        if (!amountFils && orderData.winningBidAmount) {
          amountFils = Math.round(orderData.winningBidAmount * 1000);
        }

        if (!amountFils || amountFils <= 0) {
          throw new functions.https.HttpsError('failed-precondition', 'قيمة العملية غير صالحة');
        }
      } else if (orderData.winningBidAmount) {
        amountFils = Math.round(orderData.winningBidAmount * 1000);
      }

      const winningAmountJOD = amountFils / 1000;

      if (escrowRef && escrowData) {
        // 4. Read wallets (only buyer is credited; reads must precede writes)
        const buyerWalletRef = db.collection('wallets').doc(buyerId);
        const buyerWalletSnap = await transaction.get(buyerWalletRef);

        // 6. Validate balances
        const oldBuyerEscrow = buyerWalletSnap.exists ? (buyerWalletSnap.data().escrowBalance || 0) : 0;
        const oldBuyerAvail = buyerWalletSnap.exists ? (buyerWalletSnap.data().availableBalance || 0) : 0;

        if (oldBuyerEscrow < amountFils) {
          throw new functions.https.HttpsError('failed-precondition', 'رصيد المشتري المحجوز غير كافٍ');
        }

        // 7. Apply wallet movement (from escrow to available for buyer)
        const newBuyerEscrow = Math.max(0, oldBuyerEscrow - amountFils);
        const newBuyerAvail = oldBuyerAvail + amountFils;
        const newBuyerTotal = newBuyerAvail + newBuyerEscrow;

        // Execute Writes in Transaction
        transaction.set(buyerWalletRef, {
          userId: buyerId,
          availableBalance: newBuyerAvail,
          escrowBalance: newBuyerEscrow,
          totalBalance: newBuyerTotal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 8. Update escrow status
        transaction.update(escrowRef, {
          status: 'refunded',
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundedBy: callerUserId,
          refundReason: action || 'admin_refund_dispute',
          orderId: orderId
        });
      }

      // 9. Update order status
      transaction.update(orderRef, {
        status: 'refunded',
        escrowStatus: 'refunded',
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowRefundedBy: callerUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (escrowRef && escrowData) {
        // 10. Create double-entry ledger records
        const buyerLedgerRef = db.collection('ledger').doc();
        const sellerLedgerRef = db.collection('ledger').doc();

        // Buyer Ledger: credit
        transaction.set(buyerLedgerRef, {
          id: buyerLedgerRef.id,
          userId: buyerId,
          orderId: orderId,
          auctionId: auctionId,
          amount: winningAmountJOD,
          amountFils: amountFils,
          type: 'escrow_refund',
          direction: 'credit',
          titleAr: 'استرداد الضمان المالي للطلب',
          titleEn: 'Escrow Refunded for Order',
          descriptionAr: `تم استرداد مبلغ الضمان بقيمة ${winningAmountJOD} د.أ وإعادته لمحافظتك بنجاح بعد إلغاء الطلب.`,
          descriptionEn: `Escrow funds of ${winningAmountJOD} JOD returned to your available balance.`,
          timestamp: Date.now()
        });

        // Seller Ledger: neutral / cancellation reference
        transaction.set(sellerLedgerRef, {
          id: sellerLedgerRef.id,
          userId: sellerId,
          orderId: orderId,
          auctionId: auctionId,
          amount: 0,
          amountFils: 0,
          type: 'order_refunded_neutral',
          direction: 'neutral',
          titleAr: 'إلغاء الطلب واسترداد الضمان للمشتري',
          titleEn: 'Order Cancelled and Escrow Refunded',
          descriptionAr: `تم إلغاء الطلب واسترجاع الضمان بقيمة ${winningAmountJOD} د.أ للمشتري بقرار من الإدارة.`,
          descriptionEn: `Order cancelled and escrow of ${winningAmountJOD} JOD refunded to the buyer.`,
          timestamp: Date.now()
        });

        // 11. Create audit log
        const auditLogRef = db.collection('financialAuditLogs').doc();
        transaction.set(auditLogRef, {
          id: auditLogRef.id,
          action: 'refund_order_escrow',
          orderId: orderId,
          auctionId: auctionId,
          buyerId: buyerId,
          sellerId: sellerId,
          amount: winningAmountJOD,
          amountFils: amountFils,
          triggeredBy: callerUserId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Admin Action Log
      const adminActionsRef = db.collection('adminActions').doc();
      transaction.set(adminActionsRef, {
        id: adminActionsRef.id,
        orderId: orderId,
        action: action || 'refund_order_escrow',
        adminId: callerUserId,
        adminName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: hasEscrow
          ? `Force refunded escrow of ${winningAmountJOD} JOD to buyer for order ${orderId}`
          : `Force refunded (cancelled) order ${orderId} (no escrow funds to move)`
      });

      // Write Order Activity record
      const activityRef = orderRef.collection('activity').doc();
      const messageAr = hasEscrow
        ? `قام المشرف بفرض إلغاء الطلب واسترداد الضمان المالي بقيمة ${winningAmountJOD} د.أ للمشتري.`
        : 'قام المشرف بفرض إلغاء الطلب وإرجاعه.';
      const messageEn = hasEscrow
        ? `Admin forced refund. Escrow funds of ${winningAmountJOD} JOD returned to buyer's available wallet.`
        : 'Admin forced refund. Order has been cancelled and marked as refunded.';

      transaction.set(activityRef, {
        id: activityRef.id,
        type: hasEscrow ? 'Escrow Refunded' : 'Order Refunded',
        messageAr: messageAr,
        messageEn: messageEn,
        message: messageEn,
        performedBy: callerUserId,
        performedByName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      // Notifications for Buyer and Seller
      const buyerNotifRef = db.collection('notifications').doc();
      const sellerNotifRef = db.collection('notifications').doc();

      transaction.set(buyerNotifRef, {
        id: buyerNotifRef.id,
        userId: buyerId,
        title: hasEscrow ? 'استرداد الضمان المالي للطلب 💸' : 'تم إلغاء الطلب 💸',
        titleAr: hasEscrow ? 'استرداد الضمان المالي للطلب 💸' : 'تم إلغاء الطلب 💸',
        titleEn: hasEscrow ? 'Order Escrow Refunded 💸' : 'Order Refunded 💸',
        description: hasEscrow
          ? `تم إرجاع مبلغ الضمان بقيمة ${winningAmountJOD} د.أ إلى رصيدك المتاح بنجاح لعدم اكتمال الطلب.`
          : `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} وإرجاعه بنجاح.`,
        descriptionAr: hasEscrow
          ? `تم إرجاع مبلغ الضمان بقيمة ${winningAmountJOD} د.أ إلى رصيدك المتاح بنجاح لعدم اكتمال الطلب.`
          : `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} وإرجاعه بنجاح.`,
        descriptionEn: hasEscrow
          ? `A pending escrow of ${winningAmountJOD} JOD has been returned to your wallet available balance.`
          : `Order #${orderId.substring(0, 8)} has been cancelled and refunded.`,
        type: 'info',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      transaction.set(sellerNotifRef, {
        id: sellerNotifRef.id,
        userId: sellerId,
        title: 'تم إلغاء واسترداد الطلب',
        titleAr: 'تم إلغاء واسترداد الطلب',
        titleEn: 'Order Cancelled & Refunded',
        description: hasEscrow
          ? `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} واسترجاع الضمان المالي للمشتري.`
          : `تم إلغاء الطلب رقم ${orderId.substring(0, 8)}.`,
        descriptionAr: hasEscrow
          ? `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} واسترجاع الضمان المالي للمشتري.`
          : `تم إلغاء الطلب رقم ${orderId.substring(0, 8)}.`,
        descriptionEn: hasEscrow
          ? `Order #${orderId.substring(0, 8)} has been cancelled and funds refunded to the buyer.`
          : `Order #${orderId.substring(0, 8)} has been cancelled.`,
        type: 'alert',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      return {
        success: true,
        message: hasEscrow
          ? `تم استرداد مبلغ ${winningAmountJOD} د.أ بنجاح للمشتري.`
          : 'تم إلغاء الطلب وإرجاعه بنجاح.'
      };
    });
  } catch (error) {
    console.error('Error in refundOrderEscrow:', error);
    const arabicMsg = error.message || "تعذر استرداد المبلغ، حاول مرة أخرى";
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 13. repairStuckEscrowsForEndedAuction Callable Cloud Function (PHASE 1.5)
 * Safely refunds stuck bid escrows for losing bidders of ended auctions.
 * Admin only. Fully transactional, safe, and idempotent.
 */
exports.repairStuckEscrowsForEndedAuction = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  }
  const callerUserId = context.auth.uid;
  const { auctionId } = data;

  if (!auctionId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرف المزاد غير صحيح أو مفقود');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Check if caller is admin
      const callerRef = db.collection('users').doc(callerUserId);
      const callerSnap = await transaction.get(callerRef);
      if (!callerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'ملف المستخدم الخاص بالمشرف غير موجود');
      }
      const callerData = callerSnap.data();
      const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

      if (!isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'عذراً، هذا الإجراء مخصص للمشرفين فقط');
      }

      // 2. Read auction document
      const auctionRef = db.collection('auctions').doc(auctionId);
      const auctionSnap = await transaction.get(auctionRef);
      if (!auctionSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المزاد المحدد غير موجود');
      }
      const auctionData = auctionSnap.data();

      // 3. Validate auction status is ended/completed/closed
      const endedStatuses = ['ended', 'completed', 'closed'];
      if (!endedStatuses.includes(auctionData.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'المزاد لم ينتهِ بعد أو ليس في حالة مكتملة');
      }

      // 4. Determine winner ID with prioritization
      let winnerId = auctionData.currentBidderId || auctionData.highestBidderId || auctionData.winnerId || auctionData.winningBidderId || null;

      // Try reading buyerId from orders/{auctionId} inside the transaction
      const orderRef = db.collection('orders').doc(auctionId);
      const orderSnap = await transaction.get(orderRef);
      let orderBuyerId = null;
      let orderStatus = null;
      if (orderSnap.exists) {
        const orderData = orderSnap.data();
        if (orderData) {
          orderBuyerId = orderData.buyerId || null;
          orderStatus = orderData.status || null;
          if (orderBuyerId) {
            winnerId = orderBuyerId;
          }
        }
      }

      // 5. Query all locked escrows for this auction inside the transaction
      const escrowsQuery = await transaction.get(
        db.collection('escrows')
          .where('auctionId', '==', auctionId)
          .where('status', '==', 'locked')
      );

      if (escrowsQuery.empty) {
        return {
          success: true,
          refundedCount: 0,
          keptWinnerEscrow: false,
          totalRefundedAmount: 0,
          message: 'لا توجد ضمانات مالية محجوزة/مغلقة لهذا المزاد لتعديلها.'
        };
      }

      const escrowDocs = escrowsQuery.docs;

      // Filter losing escrows to refund
      const losingEscrowDocs = [];
      let keptWinnerEscrow = false;

      for (const escDoc of escrowDocs) {
        const escData = escDoc.data();
        const bidderId = escData.bidderId;

        // Is this bidder the winner?
        const isWinner = !!(winnerId && bidderId === winnerId);

        // Security check: check if this bidder is the buyer in an active (not cancelled or rejected) order
        const isActiveBuyerInOrder = !!(orderSnap.exists && 
                                        orderBuyerId === bidderId && 
                                        orderStatus !== 'cancelled' && 
                                        orderStatus !== 'rejected');

        if (isWinner || isActiveBuyerInOrder) {
          keptWinnerEscrow = true;
        } else {
          losingEscrowDocs.push(escDoc);
        }
      }

      if (losingEscrowDocs.length === 0) {
        return {
          success: true,
          refundedCount: 0,
          keptWinnerEscrow,
          totalRefundedAmount: 0,
          message: keptWinnerEscrow 
            ? 'الضمان المالي الوحيد المحجوز يعود للفائز بالمزاد، وتم إبقاؤه محجوزاً بنجاح.'
            : 'لا توجد ضمانات للمزايدين الخاسرين متبقية لتسويتها.'
        };
      }

      // 6. Fetch unique bidder wallet references we need to read first
      const uniqueBidderIds = [...new Set(losingEscrowDocs.map(d => d.data().bidderId))];
      const walletRefs = {};
      const walletStates = {};

      for (const bidderId of uniqueBidderIds) {
        const walletRef = db.collection('wallets').doc(bidderId);
        const walletSnap = await transaction.get(walletRef);
        walletRefs[bidderId] = walletRef;
        if (walletSnap.exists) {
          const wData = walletSnap.data();
          walletStates[bidderId] = {
            availableBalance: wData.availableBalance || 0,
            escrowBalance: wData.escrowBalance || 0,
            exists: true
          };
        } else {
          walletStates[bidderId] = {
            availableBalance: 0,
            escrowBalance: 0,
            exists: false
          };
        }
      }

      let refundedCount = 0;
      let totalRefundedAmount = 0;

      // 7. Perform updates
      for (const escDoc of losingEscrowDocs) {
        const escRef = escDoc.ref;
        const escData = escDoc.data();
        const bidderId = escData.bidderId;

        const refundAmtFils = escData.amountFils || Math.round((escData.amount || 0) * 1000);
        const refundAmtJOD = escData.amount || (refundAmtFils / 1000);

        // Update escrow document
        transaction.update(escRef, {
          status: 'refunded',
          refundedAt: admin.firestore.FieldValue.serverTimestamp(),
          refundReason: 'auction_lost_repair'
        });

        // Update memory balance state & write to transaction
        const wState = walletStates[bidderId];
        const oldAvail = wState.availableBalance;
        const oldEscrow = wState.escrowBalance;

        const newEscrow = Math.max(0, oldEscrow - refundAmtFils);
        const newAvail = oldAvail + refundAmtFils;
        const newTotal = newAvail + newEscrow;

        wState.availableBalance = newAvail;
        wState.escrowBalance = newEscrow;
        wState.exists = true;

        const walletRef = walletRefs[bidderId];
        transaction.set(walletRef, {
          userId: bidderId,
          availableBalance: newAvail,
          escrowBalance: newEscrow,
          totalBalance: newTotal,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Create ledger entry
        const ledgerRef = db.collection('ledger').doc();
        transaction.set(ledgerRef, {
          id: ledgerRef.id,
          userId: bidderId,
          auctionId: auctionId,
          amount: refundAmtJOD,
          amountFils: refundAmtFils,
          type: 'escrow_refund',
          direction: 'credit',
          reason: 'auction_lost_repair',
          titleAr: 'استرداد الضمان المالي للمزاد (إصلاح)',
          titleEn: 'Escrow Refund for Auction (Repair)',
          descriptionAr: `تم استرداد مبلغ الضمان بقيمة ${refundAmtJOD} د.أ تلقائياً لانتهاء المزاد وعدم فوزك (تشغيل نظام الإصلاح).`,
          descriptionEn: `Secure escrow refund of ${refundAmtJOD} JOD processed (Admin Repair run) for ended auction.`,
          timestamp: Date.now()
        });

        // Create financial audit log
        const auditLogRef = db.collection('financialAuditLogs').doc();
        transaction.set(auditLogRef, {
          id: auditLogRef.id,
          action: 'repair_stuck_escrow_refund',
          auctionId: auctionId,
          escrowId: escDoc.id,
          userId: bidderId,
          amount: refundAmtJOD,
          amountFils: refundAmtFils,
          triggeredBy: callerUserId,
          reason: 'auction_lost_repair',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Send a notification to the outbid user
        const notificationRef = db.collection('notifications').doc();
        transaction.set(notificationRef, {
          id: notificationRef.id,
          userId: bidderId,
          title: 'استرداد ضمان مالي معلق 💸',
          titleAr: 'استرداد ضمان مالي معلق 💸',
          titleEn: 'Suspended Escrow Refunded 💸',
          description: `تم إرجاع مبلغ الضمان المعلق بقيمة ${refundAmtJOD} د.أ إلى محفظتك بنجاح بعد فحص المزاد المنتهي.`,
          descriptionAr: `تم إرجاع مبلغ الضمان المعلق بقيمة ${refundAmtJOD} د.أ إلى محفظتك بنجاح بعد فحص المزاد المنتهي.`,
          descriptionEn: `A pending escrow of ${refundAmtJOD} JOD has been returned to your wallet after checking ended auction.`,
          type: 'info',
          timestamp: Date.now(),
          read: false
        });

        refundedCount++;
        totalRefundedAmount += refundAmtJOD;
      }

      // Create Admin Action Log
      const adminActionsRef = db.collection('adminActions').doc();
      transaction.set(adminActionsRef, {
        id: adminActionsRef.id,
        auctionId: auctionId,
        action: 'repair_stuck_escrows',
        adminId: callerUserId,
        adminName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `Repaired stuck escrows for ended auction ${auctionId}. Refunded ${refundedCount} escrows for non-winners. Total amount: ${totalRefundedAmount} JOD.`
      });

      return {
        success: true,
        refundedCount,
        keptWinnerEscrow,
        totalRefundedAmount,
        message: `تمت تسوية وإصلاح ${refundedCount} من الضمانات العالقة بنجاح بمجموع ${totalRefundedAmount} د.أ، وتم إبقاء ضمان الفائز محجوزاً.`
      };
    });
  } catch (error) {
    console.error('Error in repairStuckEscrowsForEndedAuction:', error);
    const arabicMsg = error.message || 'تعذر تسوية الضمانات العالقة، حاول مرة أخرى';
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 14. requestWithdrawal Callable Cloud Function (PHASE 1.6)
 * Secure, transactional, and client-immutable withdrawal request flow.
 */
exports.requestWithdrawal = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  }

  const userId = context.auth.uid;
  const { amount, method, accountDetails } = data;

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'المبلغ المطلوب سحبه غير صحيح');
  }

  if (!method || (method !== 'cliq' && method !== 'bank')) {
    throw new functions.https.HttpsError('invalid-argument', 'طريقة السحب المحددة غير مدعومة');
  }

  if (!accountDetails || typeof accountDetails !== 'object') {
    throw new functions.https.HttpsError('invalid-argument', 'بيانات الحساب البنكي أو كليك ناقصة');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read User Wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المحفظة غير موجودة، يرجى تهيئتها أولاً');
      }

      const walletData = walletSnap.data();
      const oldAvailable = walletData.availableBalance || 0;
      const oldEscrow = walletData.escrowBalance || 0;
      const oldPendingWithdrawal = walletData.pendingWithdrawalBalance || 0;

      // Convert amount in JOD to fils (integers)
      const amountFils = Math.round(amount * 1000);

      // 2. Validate availableBalance >= amount
      if (oldAvailable < amountFils) {
        throw new functions.https.HttpsError('failed-precondition', 'المبلغ المطلوب يتجاوز الرصيد المتاح للسحب في محفظتك');
      }

      // 3. Move amount from availableBalance to pendingWithdrawalBalance
      const newAvailable = oldAvailable - amountFils;
      const newPendingWithdrawal = oldPendingWithdrawal + amountFils;
      const newTotal = newAvailable + oldEscrow + newPendingWithdrawal;

      // 4. Update user wallet
      transaction.update(walletRef, {
        availableBalance: newAvailable,
        pendingWithdrawalBalance: newPendingWithdrawal,
        totalBalance: newTotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Create withdrawals document with status "pending_review"
      const wId = `with-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const refId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
      const withdrawalRef = db.collection('withdrawals').doc(wId);

      transaction.set(withdrawalRef, {
        id: wId,
        userId: userId,
        amount: amount,
        amountFils: amountFils,
        type: method,
        status: 'pending_review',
        timestamp: Date.now(),
        details: accountDetails,
        referenceId: refId
      });

      // 6. Create ledger entry
      const ledgerRef = db.collection('ledger').doc();
      transaction.set(ledgerRef, {
        id: ledgerRef.id,
        userId: userId,
        amount: -amount,
        amountFils: -amountFils,
        type: 'withdrawal',
        direction: 'debit',
        reason: 'withdrawal_request',
        titleAr: method === 'cliq' ? 'طلب سحب كليك (قيد المراجعة)' : 'طلب سحب حوالة بنكية (قيد المراجعة)',
        titleEn: method === 'cliq' ? 'CliQ Withdrawal Request (Pending Review)' : 'Bank Withdrawal Request (Pending Review)',
        descriptionAr: `تم تقديم طلب سحب بقيمة ${amount} د.أ وهو قيد التدقيق والمراجعة.`,
        descriptionEn: `Withdrawal request of ${amount} JOD submitted and currently pending audit desk review.`,
        timestamp: Date.now()
      });

      // 7. Create financial audit log
      const auditLogRef = db.collection('financialAuditLogs').doc();
      transaction.set(auditLogRef, {
        id: auditLogRef.id,
        action: 'withdrawal_request',
        userId: userId,
        amount: amount,
        amountFils: amountFils,
        method: method,
        withdrawalId: wId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        message: 'طلب السحب قيد المراجعة. سيتم التواصل معك بعد مراجعة الطلب.'
      };
    });
  } catch (error) {
    console.error('Error in requestWithdrawal:', error);
    const arabicMsg = error.message || 'عذراً، فشل تقديم طلب السحب المالي.';
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 15. resetTestAuctionData Callable Cloud Function
 * Secure admin function to delete active/locked escrows of reset test auctions.
 * Directly prevents client-side write access to the escrows collection.
 */
exports.resetTestAuctionData = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  }

  const callerUserId = context.auth.uid;

  try {
    // 1. Fetch caller's profile to verify admin privileges
    const callerSnap = await db.collection('users').doc(callerUserId).get();
    if (!callerSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'الملف الشخصي للمشرف غير موجود');
    }

    const callerData = callerSnap.data();
    const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

    if (!isCallerAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'غير مصرح للقيام بهذه العملية، يجب أن تكون مشرفاً');
    }

    const { auctionIds } = data;
    if (!auctionIds || !Array.isArray(auctionIds) || auctionIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'مصفوفة معرّفات المزادات مطلوبة وغير صالحة');
    }

    // 2. Query locked escrows
    const escrowsSnap = await db.collection('escrows').where('status', '==', 'locked').get();
    const refsToDelete = [];

    escrowsSnap.forEach(docSnap => {
      const eData = docSnap.data();
      if (auctionIds.includes(eData.auctionId)) {
        refsToDelete.push(docSnap.ref);
      }
    });

    // 3. Delete in batches
    if (refsToDelete.length > 0) {
      const chunkSize = 400;
      for (let i = 0; i < refsToDelete.length; i += chunkSize) {
        const chunk = refsToDelete.slice(i, i + chunkSize);
        const batch = db.batch();
        chunk.forEach(ref => {
          batch.delete(ref);
        });
        await batch.commit();
      }
    }

    // 4. Log admin action
    const adminActionRef = db.collection('adminActions').doc();
    await adminActionRef.set({
      id: adminActionRef.id,
      action: 'reset_test_auctions_escrows',
      adminId: callerUserId,
      adminName: callerData.name || 'Admin',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: `Reset test auction escrows. Deleted ${refsToDelete.length} locked escrows associated with auctions: ${auctionIds.join(', ')}.`
    });

    return {
      success: true,
      deletedCount: refsToDelete.length,
      message: `تم مسح ${refsToDelete.length} من سجلات الضمان المالي للمزادات التجريبية بنجاح.`
    };
  } catch (error) {
    console.error('Error in resetTestAuctionData:', error);
    const arabicMsg = error.message || 'تعذر إعادة تعيين بيانات الإسكرو للمزادات التجريبية، حاول مرة أخرى لاحقاً';
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 16. approveWithdrawal Callable Cloud Function
 * Secure admin-only withdrawal approval flow.
 */
exports.approveWithdrawal = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  }

  const callerUserId = context.auth.uid;
  const { withdrawalId } = data;

  if (!withdrawalId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف طلب السحب مطلوب');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Verify admin privileges
      const callerRef = db.collection('users').doc(callerUserId);
      const callerSnap = await transaction.get(callerRef);
      if (!callerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الملف الشخصي للمشرف غير موجود');
      }

      const callerData = callerSnap.data();
      const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

      if (!isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح للقيام بهذه العملية، يجب أن تكون مشرفاً فقط');
      }

      // 2. Read Withdrawal Request
      const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
      const withdrawalSnap = await transaction.get(withdrawalRef);

      if (!withdrawalSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'طلب السحب غير موجود');
      }

      const withdrawalData = withdrawalSnap.data();

      // Idempotency / state checks
      if (withdrawalData.status === 'completed') {
        return { success: true, alreadyProcessed: true };
      }
      if (withdrawalData.status !== 'pending_review') {
        throw new functions.https.HttpsError('failed-precondition', 'حالة الطلب الحالية لا تسمح بالموافقة عليه');
      }

      const userId = withdrawalData.userId;
      const amount = withdrawalData.amount;
      const amountFils = withdrawalData.amountFils || Math.round(amount * 1000);

      // 3. Read Wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المحفظة غير موجودة');
      }

      const walletData = walletSnap.data();
      const oldAvailable = walletData.availableBalance || 0;
      const oldEscrow = walletData.escrowBalance || 0;
      const oldPendingWithdrawal = walletData.pendingWithdrawalBalance || 0;

      if (oldPendingWithdrawal < amountFils) {
        throw new functions.https.HttpsError('failed-precondition', 'رصيد طلبات السحب المعلقة غير كافٍ');
      }

      // 4. Update Wallet: Deduct from pendingWithdrawalBalance
      const newPendingWithdrawal = Math.max(0, oldPendingWithdrawal - amountFils);
      const newTotal = oldAvailable + oldEscrow + newPendingWithdrawal;

      transaction.update(walletRef, {
        pendingWithdrawalBalance: newPendingWithdrawal,
        totalBalance: newTotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Update Withdrawal Document
      transaction.update(withdrawalRef, {
        status: 'completed',
        approvedBy: callerUserId,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 6. Create ledger entry
      const ledgerRef = db.collection('ledger').doc();
      transaction.set(ledgerRef, {
        id: ledgerRef.id,
        userId: userId,
        amount: -amount,
        amountFils: -amountFils,
        type: 'withdrawal_approved',
        direction: 'debit',
        titleAr: 'اكتمل سحب الأموال',
        titleEn: 'Withdrawal Completed',
        descriptionAr: `تمت الموافقة على طلب السحب بقيمة ${amount} د.أ وتحويل الرصيد بنجاح.`,
        descriptionEn: `Withdrawal request of ${amount} JOD approved and successfully transferred.`,
        timestamp: Date.now()
      });

      // 7. Create audit log
      const auditLogRef = db.collection('financialAuditLogs').doc();
      transaction.set(auditLogRef, {
        id: auditLogRef.id,
        action: 'approve_withdrawal',
        userId: userId,
        amount: amount,
        amountFils: amountFils,
        withdrawalId: withdrawalId,
        triggeredBy: callerUserId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 8. Create admin action log
      const adminActionRef = db.collection('adminActions').doc();
      transaction.set(adminActionRef, {
        id: adminActionRef.id,
        action: 'approve_withdrawal',
        adminId: callerUserId,
        adminName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `Approved withdrawal ID ${withdrawalId} of ${amount} JOD for user ${userId}`
      });

      // 9. Send Notification
      const notifRef = db.collection('notifications').doc();
      transaction.set(notifRef, {
        id: notifRef.id,
        userId: userId,
        title: 'تمت الموافقة على طلب السحب 🎉',
        titleAr: 'تمت الموافقة على طلب السحب 🎉',
        titleEn: 'Withdrawal Approved 🎉',
        description: `تمت الموافقة على طلب السحب بقيمة ${amount} د.أ وتحويل الرصيد بنجاح.`,
        descriptionAr: `تمت الموافقة على طلب السحب بقيمة ${amount} د.أ وتحويل الرصيد بنجاح.`,
        descriptionEn: `Your withdrawal of ${amount} JOD has been approved and successfully transferred.`,
        type: 'info',
        timestamp: Date.now(),
        read: false
      });

      return {
        success: true,
        message: 'تمت الموافقة على طلب السحب وتحرير الرصيد بنجاح'
      };
    });
  } catch (error) {
    console.error('Error in approveWithdrawal:', error);
    const arabicMsg = error.message || 'فشلت عملية الموافقة على طلب السحب المالي';
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/**
 * 17. rejectWithdrawal Callable Cloud Function
 * Secure admin-only withdrawal rejection flow.
 * Refunds the withdrawal amount back to user's available balance.
 */
exports.rejectWithdrawal = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
  }

  const callerUserId = context.auth.uid;
  const { withdrawalId, reason } = data;

  if (!withdrawalId) {
    throw new functions.https.HttpsError('invalid-argument', 'معرّف طلب السحب مطلوب');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Verify admin privileges
      const callerRef = db.collection('users').doc(callerUserId);
      const callerSnap = await transaction.get(callerRef);
      if (!callerSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'الملف الشخصي للمشرف غير موجود');
      }

      const callerData = callerSnap.data();
      const isCallerAdmin = callerData.role === 'admin' || callerData.isAdmin === true || (context.auth.token.email || '').toLowerCase() === 'admaaqaba06@gmail.com';

      if (!isCallerAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح للقيام بهذه العملية، يجب أن تكون مشرفاً فقط');
      }

      // 2. Read Withdrawal Request
      const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
      const withdrawalSnap = await transaction.get(withdrawalRef);

      if (!withdrawalSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'طلب السحب غير موجود');
      }

      const withdrawalData = withdrawalSnap.data();

      // Idempotency / state checks
      if (withdrawalData.status === 'rejected') {
        return { success: true, alreadyProcessed: true };
      }
      if (withdrawalData.status !== 'pending_review') {
        throw new functions.https.HttpsError('failed-precondition', 'حالة الطلب الحالية لا تسمح برفضه');
      }

      const userId = withdrawalData.userId;
      const amount = withdrawalData.amount;
      const amountFils = withdrawalData.amountFils || Math.round(amount * 1000);

      // 3. Read Wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);

      if (!walletSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'المحفظة غير موجودة');
      }

      const walletData = walletSnap.data();
      const oldAvailable = walletData.availableBalance || 0;
      const oldEscrow = walletData.escrowBalance || 0;
      const oldPendingWithdrawal = walletData.pendingWithdrawalBalance || 0;

      if (oldPendingWithdrawal < amountFils) {
        throw new functions.https.HttpsError('failed-precondition', 'رصيد طلبات السحب المعلقة غير كافٍ');
      }

      // 4. Update Wallet: Refund back from pendingWithdrawalBalance to availableBalance
      const newPendingWithdrawal = Math.max(0, oldPendingWithdrawal - amountFils);
      const newAvailable = oldAvailable + amountFils;
      const newTotal = newAvailable + oldEscrow + newPendingWithdrawal;

      transaction.update(walletRef, {
        availableBalance: newAvailable,
        pendingWithdrawalBalance: newPendingWithdrawal,
        totalBalance: newTotal,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Update Withdrawal Document
      transaction.update(withdrawalRef, {
        status: 'rejected',
        rejectedBy: callerUserId,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        rejectionReason: reason || 'تم الرفض من الإدارة',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 6. Create ledger entry
      const ledgerRef = db.collection('ledger').doc();
      transaction.set(ledgerRef, {
        id: ledgerRef.id,
        userId: userId,
        amount: amount,
        amountFils: amountFils,
        type: 'withdrawal_rejected',
        direction: 'credit',
        titleAr: 'رفض طلب السحب واستعادة الرصيد',
        titleEn: 'Withdrawal Rejected & Funds Returned',
        descriptionAr: `تم رفض طلب السحب بقيمة ${amount} د.أ وإرجاع المبلغ لمحفظتك. السبب: ${reason || 'تم الرفض من الإدارة'}`,
        descriptionEn: `Withdrawal request of ${amount} JOD rejected and funds returned. Reason: ${reason || 'Rejected by admin'}`,
        timestamp: Date.now()
      });

      // 7. Create audit log
      const auditLogRef = db.collection('financialAuditLogs').doc();
      transaction.set(auditLogRef, {
        id: auditLogRef.id,
        action: 'reject_withdrawal',
        userId: userId,
        amount: amount,
        amountFils: amountFils,
        withdrawalId: withdrawalId,
        triggeredBy: callerUserId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 8. Create admin action log
      const adminActionRef = db.collection('adminActions').doc();
      transaction.set(adminActionRef, {
        id: adminActionRef.id,
        action: 'reject_withdrawal',
        adminId: callerUserId,
        adminName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `Rejected withdrawal ID ${withdrawalId} of ${amount} JOD for user ${userId}. Reason: ${reason || 'None'}`
      });

      // 9. Send Notification
      const notifRef = db.collection('notifications').doc();
      transaction.set(notifRef, {
        id: notifRef.id,
        userId: userId,
        title: '❌ تم رفض طلب السحب',
        titleAr: '❌ تم رفض طلب السحب',
        titleEn: 'Withdrawal Rejected ❌',
        description: `تم رفض طلب السحب بقيمة ${amount} د.أ وإرجاع الرصيد لمحفظتك. السبب: ${reason || 'تم الرفض من الإدارة'}`,
        descriptionAr: `تم رفض طلب السحب بقيمة ${amount} د.أ وإرجاع الرصيد لمحفظتك. السبب: ${reason || 'تم الرفض من الإدارة'}`,
        descriptionEn: `Your withdrawal of ${amount} JOD has been rejected and the funds returned to your balance. Reason: ${reason || 'Rejected by admin'}`,
        type: 'info',
        timestamp: Date.now(),
        read: false
      });

      return {
        success: true,
        message: 'تم رفض طلب السحب واستعادة الرصيد بنجاح'
      };
    });
  } catch (error) {
    console.error('Error in rejectWithdrawal:', error);
    const arabicMsg = error.message || 'فشلت عملية رفض طلب السحب المالي';
    throw new functions.https.HttpsError('internal', arabicMsg);
  }
});

/* =========================================================================
 * AUCTION SIMULATOR — Wave 1 (server callables, admin-only)
 *
 * Test harness for exercising the real auction engine end-to-end:
 *   simulateSpawnAuction — create a flagged (isSimulated) test auction
 *   simulateBid          — apply one rival bid via the SAME pricing +
 *                          anti-snipe rules as placeBid (shared helpers)
 *   simulateSettleNow    — force-settle via the SAME settleAuctionTxn the
 *                          closer cron uses (order + wonCount + webhooks)
 *   simulateCleanup      — wipe everything flagged isSimulated
 *
 * Every doc the simulator creates carries isSimulated: true so real metrics
 * can filter it out and cleanup can find it.
 * ========================================================================= */

const SIM_PLACEHOLDER_IMG = 'https://placehold.co/600x400/1a1a2e/f5b301?text=TEST+AUCTION';
// Wave 2 (media gallery): stable extra gallery images so simulated auctions
// exercise the swipeable MediaGallery end-to-end (video-less: image-only path).
const SIM_PLACEHOLDER_MEDIA_URLS = [
  'https://picsum.photos/id/1060/800/1200',
  'https://picsum.photos/id/201/800/1200',
  'https://picsum.photos/id/119/800/1200'
];
const SIM_BOT_ID = 'sim-bot';

exports.simulateSpawnAuction = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  const callerUid = await assertAdmin(context);
  const d = data || {};

  const category = (typeof d.category === 'string' && d.category.trim()) ? d.category.trim() : 'Electronics';
  const title = (typeof d.title === 'string' && d.title.trim()) ? d.title.trim() : `TEST — ${category}`;
  const startingPrice = (typeof d.startingPrice === 'number' && d.startingPrice > 0) ? d.startingPrice : 10;
  const durationSec = (typeof d.durationSec === 'number' && d.durationSec > 0) ? Math.round(d.durationSec) : 120;
  const channel = (typeof d.channel === 'string' && d.channel.trim()) ? d.channel.trim() : 'misc';
  const status = d.status === 'upcoming' ? 'upcoming' : 'live';

  try {
    const auctionRef = db.collection('auctions').doc();
    const doc = {
      id: auctionRef.id,
      isSimulated: true,
      title,
      description: 'Simulated auction (engine test) — removed by simulateCleanup.',
      category,
      channel,
      status,
      startingPrice,
      currentPrice: startingPrice,
      currentPriceFils: Math.round(startingPrice * 1000),
      minIncrement: Math.max(5, Math.round(startingPrice * 0.05)),
      totalBids: 0,
      duration: durationSec, // scheduledAuctionOpener uses this when opening an upcoming drop
      isApproved: true,
      approvalStatus: 'approved',
      ownershipAttested: true,
      attestedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdById: callerUid,
      sellerId: callerUid,
      sellerName: 'Simulator',
      thumbnailUrl: SIM_PLACEHOLDER_IMG,
      imageUrl: SIM_PLACEHOLDER_IMG,
      mediaUrls: SIM_PLACEHOLDER_MEDIA_URLS,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'live') {
      const endMs = Date.now() + durationSec * 1000;
      doc.endTime = endMs;
      doc.endsAt = admin.firestore.Timestamp.fromMillis(endMs);
      // Mirror the opener's go-live fields so the test auction is not counted
      // as a pending approval and sorts correctly in LiveStreamView.
      doc.approvedAt = admin.firestore.FieldValue.serverTimestamp();
      doc.approvedBy = 'simulateSpawnAuction';
      doc.openedAt = admin.firestore.FieldValue.serverTimestamp();
    } else {
      // scheduledAuctionOpener flips it live once scheduledStartAt arrives,
      // setting endTime = openedAt + duration (same as a real scheduled drop).
      doc.scheduledStartAt = Date.now() + 60 * 1000;
    }

    await auctionRef.set(doc);
    console.log(`[simulateSpawnAuction] Spawned ${status} test auction ${auctionRef.id} (${durationSec}s @ ${startingPrice} JOD) by ${callerUid}`);
    return { auctionId: auctionRef.id };
  } catch (error) {
    console.error('[simulateSpawnAuction]', error);
    throw new functions.https.HttpsError('internal', error.message || 'simulateSpawnAuction failed.');
  }
});

// Intentionally skips placeBid's 1.5s rate limit + membership checks: sim-bot
// has no user doc, and the client bot paces bids at 4-12s anyway.
exports.simulateBid = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { auctionId, bidderLabel } = data || {};
  if (!auctionId || typeof auctionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'auctionId is required.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
      const auctionRef = db.collection('auctions').doc(auctionId);
      const auctionSnap = await transaction.get(auctionRef);
      // Soft no-ops (never throw): the client bid bot loops until the
      // auction ends, so a missing/ended auction just stops the loop.
      if (!auctionSnap.exists) {
        return { noop: true, reason: 'not_found' };
      }
      const auctionData = auctionSnap.data();
      // Never bid on a REAL auction: sim-bot would take currentBidderId,
      // onBidCreated would fire real outbid notifications, anti-snipe would
      // extend a live drop, and a sim-bot win would create a real order.
      if (auctionData.isSimulated !== true) {
        return { noop: true, reason: 'not_simulated' };
      }
      if (auctionData.status !== 'live' && auctionData.status !== 'active') {
        return { noop: true, reason: 'not_live' };
      }
      const endTimeMs = resolveAuctionEndMs(auctionData);
      if (endTimeMs && endTimeMs <= Date.now()) {
        return { noop: true, reason: 'ended' };
      }

      // Next valid bid per placeBid's rule (first bid = asking price,
      // afterwards currentPrice + minIncrement), then the shared write path
      // (bid doc + pricing fields + anti-snipe +15s under 10s).
      const { minRequiredFils } = bidPricing(auctionData);
      const { finalEndTime } = applyBidWrites(transaction, auctionRef, auctionData, {
        amountJod: minRequiredFils / 1000,
        amountFils: minRequiredFils,
        bidderId: SIM_BOT_ID,
        bidderName: (typeof bidderLabel === 'string' && bidderLabel.trim()) ? bidderLabel.trim() : 'Test Bidder',
        endTimeMs: endTimeMs,
        isSimulated: true
      });

      return { currentPrice: minRequiredFils / 1000, endTime: finalEndTime };
    });
  } catch (error) {
    console.error('[simulateBid]', error);
    throw new functions.https.HttpsError('internal', error.message || 'simulateBid failed.');
  }
});

exports.simulateSettleNow = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const { auctionId } = data || {};
  if (!auctionId || typeof auctionId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'auctionId is required.');
  }

  try {
    const auctionRef = db.collection('auctions').doc(auctionId);
    const auctionSnap = await auctionRef.get();
    if (!auctionSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Auction not found.');
    }
    const auctionData = auctionSnap.data();

    // Mirror the closer's gate: it only settles live/active auctions. This
    // also short-circuits already-settled (completed/ended) auctions, and
    // settleAuctionTxn's fresh in-txn status + order-exists guards make the
    // settle race-safe against the cron (no double order, no double webhook).
    if (auctionData.status !== 'live' && auctionData.status !== 'active') {
      return { settled: false, reason: `status_${auctionData.status || 'unknown'}` };
    }

    // Same settle path as scheduledAuctionCloser. settleAuctionTxn derives
    // the order's isSimulated flag from the fresh in-txn auction doc, so a
    // simulated auction yields a flagged order and force-settling a REAL
    // auction still produces a real (metric-visible) order.
    const result = await settleAuctionTxn(auctionRef, auctionData);

    const response = { settled: result.settled };
    if (result.orderId) {
      response.orderId = result.orderId;
    }
    return response;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('[simulateSettleNow]', error);
    throw new functions.https.HttpsError('internal', error.message || 'simulateSettleNow failed.');
  }
});

exports.simulateCleanup = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  await assertAdmin(context);
  const deleted = { auctions: 0, bids: 0, orders: 0 };

  try {
    // 1. Simulated auctions — delete each auction's bids subcollection FIRST
    //    (bids live under auctions/{id}/bids; deleting the parent doc alone
    //    would orphan them). Everything under a simulated auction is test data.
    const auctionsSnap = await db.collection('auctions').where('isSimulated', '==', true).get();
    for (const auctionDoc of auctionsSnap.docs) {
      const bidsSnap = await auctionDoc.ref.collection('bids').get();
      deleted.bids += await deleteRefsInBatches(bidsSnap.docs.map((b) => b.ref));
    }
    deleted.auctions += await deleteRefsInBatches(auctionsSnap.docs.map((a) => a.ref));

    // 2. Simulated orders (created by simulateSettleNow via settleAuctionTxn).
    const ordersSnap = await db.collection('orders').where('isSimulated', '==', true).get();
    deleted.orders += await deleteRefsInBatches(ordersSnap.docs.map((o) => o.ref));

    // 3. Best-effort: stray simulated bids under NON-simulated auctions
    //    (simulateBid pointed at a real auction). Requires a collection-group
    //    index on bids.isSimulated — if it doesn't exist, log and move on.
    try {
      const straySnap = await db.collectionGroup('bids').where('isSimulated', '==', true).get();
      deleted.bids += await deleteRefsInBatches(straySnap.docs.map((b) => b.ref));
    } catch (cgErr) {
      console.warn('[simulateCleanup] stray-bid sweep skipped — create a Firestore collection-group index on bids.isSimulated for this sweep to work:', cgErr && cgErr.message);
    }

    // 4. Drop the sim-bot user doc so its settle-time wonCount increment
    //    never leaks into real user metrics. No-op if it doesn't exist.
    await db.collection('users').doc(SIM_BOT_ID).delete().catch(() => {});

    console.log('[simulateCleanup] deleted:', JSON.stringify(deleted));
    return { deleted };
  } catch (error) {
    console.error('[simulateCleanup]', error);
    throw new functions.https.HttpsError('internal', error.message || 'simulateCleanup failed.');
  }
});






