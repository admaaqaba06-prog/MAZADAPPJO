const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

admin.initializeApp();
const db = admin.firestore();

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
        const isExpired = endsAtMs > 0 && endsAtMs <= nowMs;

        if (isLive && isExpired) {
          console.log(`[scheduledAuctionCloser] Settling expired auction ${auctionId}...`);
          const winnerId = auctionData.currentBidderId || auctionData.highestBidderId || auctionData.winnerId;
          const winnerName = auctionData.currentBidderName || auctionData.highestBidderName || auctionData.winnerName || 'Buyer';
          const finalPrice = auctionData.currentPrice || auctionData.startingPrice;
          const totalBids = auctionData.totalBids || 0;

          console.log("Checking ended auction:", auctionId);
          console.log("Winner:", winnerId);
          console.log("Final price:", finalPrice);

          let escrowId = null;
          if (winnerId) {
            console.log("Creating order:", auctionId);
            try {
              const escrowSnap = await db.collection('escrows')
                .where('auctionId', '==', auctionId)
                .where('bidderId', '==', winnerId)
                .where('status', '==', 'locked')
                .limit(1)
                .get();
              if (!escrowSnap.empty) {
                escrowId = escrowSnap.docs[0].id;
              }
            } catch (escErr) {
              console.warn(`[scheduledAuctionCloser] Escrow fetch failed for ${auctionId}:`, escErr);
            }
          }

          return db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(auctionDoc.ref);
            const freshData = freshDoc.data();

            if (freshData.status === 'completed' || freshData.status === 'ended') {
              return;
            }

            const orderRef = db.collection('orders').doc(auctionId);
            const orderSnap = await transaction.get(orderRef);

            if (totalBids > 0 && winnerId) {
              // Mark completed
              transaction.update(auctionDoc.ref, {
                status: 'completed',
                settledAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // Increment win count
              const winnerRef = db.collection('users').doc(winnerId);
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

                transaction.set(orderRef, orderPayload);
                console.log(`[scheduledAuctionCloser] Created order for auction ${auctionId}`);
              } else {
                console.log(`[scheduledAuctionCloser] Order for auction ${auctionId} already exists, skipping creation.`);
              }

              console.log(`[scheduledAuctionCloser] Settled completed auction ${auctionId} - Winner: ${winnerName} (${winnerId}) at ${finalPrice} JOD`);

              // Notify winner via FCM
              const winnerSnap = await transaction.get(winnerRef);
              if (winnerSnap.exists() && winnerSnap.data().fcmToken) {
                const token = winnerSnap.data().fcmToken;
                await admin.messaging().send({
                  token: token,
                  notification: {
                    title: 'تهانينا! لقد فزت بالمزاد 🎉',
                    body: `مبروك! لقد انتهى المزاد على "${auctionData.title}" بعرضك الفائز بقيمة ${finalPrice.toLocaleString()} دينار أردني.`
                  }
                }).catch(err => console.warn(`FCM error for winner ${winnerId}: ${err.message}`));
              }
            } else {
              // Close without bidder
              transaction.update(auctionDoc.ref, {
                status: 'ended',
                settledAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log(`[scheduledAuctionCloser] Closed unsold auction ${auctionId}`);
            }
          });
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
        }
      }
    } catch (err) {
      console.error('[onBidCreated Error]', err);
    }
    return null;
  });

/**
 * 3. placeBid Callable Cloud Function
 * Handles the high-frequency and critical bidding business rules transactionally in a single Firestore runTransaction block.
 * Ensures subscription checking, blocking, pricing thresholds, sniper extensions, wallet deductively atomic locking,
 * and outbid user refunding are guaranteed without race-conditions or browser-side vulnerability bypasses.
 * Balances and calculations are implemented in integer FILS to prevent float decimals loss.
 */
exports.placeBid = functions.runWith({ cors: true }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userId = context.auth.uid;
  const { auctionId, amount } = data; // amount is in JOD (double)

  if (!auctionId || typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid auctionId or amount.');
  }

  try {
    return await db.runTransaction(async (transaction) => {
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

      if (userData.isBlocked) {
        return { success: false, message: 'Account restricted. Bidding disabled.' };
      }
      if (userData.subscriptionStatus !== 'active') {
        return { success: false, message: 'Active subscription pass required to place bids.' };
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
      const currentPriceFils = Math.round((auctionData.currentPrice || auctionData.startingPrice || 0) * 1000);
      if (auctionData.currentBidderId === userId && currentPriceFils === amountFils) {
        return { success: false, message: 'لقد قمت بتقديم هذا العرض بالفعل.' };
      }

      // Determine end time, prioritizing endsAt Timestamp over old endTime
      let endTime = auctionData.endsAt || auctionData.endTime;
      if (typeof endTime === 'object' && endTime.seconds) {
        endTime = endTime.seconds * 1000;
      } else if (typeof endTime === 'string') {
        endTime = Date.parse(endTime);
      }
      if (endTime && endTime <= Date.now()) {
        return { success: false, message: 'This auction has already ended.' };
      }

      // 3. Get bidder's wallet
      const walletRef = db.collection('wallets').doc(userId);
      const walletSnap = await transaction.get(walletRef);
      let walletData = {
        userId,
        availableBalance: 0,
        escrowBalance: 0,
        totalBalance: 0
      };
      if (walletSnap.exists) {
        const d = walletSnap.data();
        walletData.availableBalance = d.availableBalance || 0;
        walletData.escrowBalance = d.escrowBalance || 0;
        walletData.totalBalance = walletData.availableBalance + walletData.escrowBalance;
      }

      const minIncrementFils = Math.round((auctionData.minIncrement || 10) * 1000);
      const totalBids = auctionData.totalBids || 0;
      const minRequiredFils = totalBids > 0 ? (currentPriceFils + minIncrementFils) : currentPriceFils;

      if (amountFils < minRequiredFils) {
        return { success: false, message: `Minimum bid of ${(minRequiredFils / 1000).toLocaleString()} JOD required.` };
      }

      // 4. Query if the bidder has an existing locked escrow for this auction INSIDE transaction
      const existingEscrowsQuery = await transaction.get(
        db.collection('escrows')
          .where('auctionId', '==', auctionId)
          .where('bidderId', '==', userId)
          .where('status', '==', 'locked')
      );
      
      let existingEscrowDoc = null;
      let previousCommittedAmountFils = 0;
      if (!existingEscrowsQuery.empty) {
        existingEscrowDoc = existingEscrowsQuery.docs[0];
        const prevEscData = existingEscrowDoc.data();
        previousCommittedAmountFils = prevEscData.amountFils || Math.round((prevEscData.amount || 0) * 1000);
      }

      // Query if there is a previous locked escrow belonging to the outbid user INSIDE transaction
      const outbidUserId = auctionData.currentBidderId;
      let prevEscrowDoc = null;
      let prevRefundFils = 0;
      let prevWalletSnap = null;
      let prevWalletRef = null;

      if (outbidUserId && outbidUserId !== userId) {
        const prevEscrowsQuery = await transaction.get(
          db.collection('escrows')
            .where('auctionId', '==', auctionId)
            .where('bidderId', '==', outbidUserId)
            .where('status', '==', 'locked')
        );

        if (!prevEscrowsQuery.empty) {
          prevEscrowDoc = prevEscrowsQuery.docs[0];
          const prevEscrow = prevEscrowDoc.data();
          prevRefundFils = prevEscrow.amountFils || Math.round((prevEscrow.amount || 0) * 1000);

          // Get the outbid user's wallet INSIDE the transaction before any writes are done
          prevWalletRef = db.collection('wallets').doc(outbidUserId);
          prevWalletSnap = await transaction.get(prevWalletRef);
        }
      }

      // All reads are now 100% completed! Now we begin writes.

      // Incremental delta calculation in fils
      const incrementalDeltaFils = amountFils - previousCommittedAmountFils;

      if (walletData.availableBalance < incrementalDeltaFils) {
        return { success: false, message: `Insufficient Wallet Funds! You need ${((incrementalDeltaFils - walletData.availableBalance) / 1000).toLocaleString()} JOD more.` };
      }

      // 5. Update user profile with rate limit timestamp
      transaction.update(userRef, {
        lastBidAt: now
      });

      // 6. Update current bidder's wallet
      const newAvailFils = walletData.availableBalance - incrementalDeltaFils;
      const newEscrowFils = walletData.escrowBalance + incrementalDeltaFils;
      const newTotalFils = newAvailFils + newEscrowFils;

      transaction.set(walletRef, {
        userId,
        availableBalance: newAvailFils,
        escrowBalance: newEscrowFils,
        totalBalance: newTotalFils
      }, { merge: true });

      // 7. Write new bid document
      const bidRef = db.collection('auctions').doc(auctionId).collection('bids').doc();
      transaction.set(bidRef, {
        id: bidRef.id,
        auctionId,
        amount: amount, 
        amountFils: amountFils, 
        bidderId: userId,
        bidderName: userData.name || 'User',
        bidderAvatar: userData.avatar || '',
        timestamp: Date.now()
      });

      // 8. Update/Create current bidder's escrow transaction for this auction
      if (existingEscrowDoc) {
        transaction.update(existingEscrowDoc.ref, {
          amount: amount,
          amountFils: amountFils,
          timestamp: Date.now()
        });
      } else {
        const escrowRef = db.collection('escrows').doc();
        transaction.set(escrowRef, {
          id: escrowRef.id,
          walletId: 'wallet-current',
          auctionId: auctionId,
          auctionTitle: auctionData.title || 'Auction Name',
          bidderId: userId,
          bidderName: userData.name || 'User',
          sellerId: auctionData.sellerId || 'seller-system',
          sellerName: auctionData.sellerName || 'Seller',
          amount: amount,
          amountFils: amountFils,
          status: 'locked',
          timestamp: Date.now()
        });
      }

      // 9. Handle refunding the previous highest bidder
      if (outbidUserId && outbidUserId !== userId && prevEscrowDoc) {
        // Mark it as refunded
        transaction.update(prevEscrowDoc.ref, { status: 'refunded' });

        // Return funds to their wallet
        if (prevWalletSnap && prevWalletSnap.exists && prevWalletRef) {
          const pwData = prevWalletSnap.data();
          const oldPrevAvailFils = pwData.availableBalance || 0;
          const oldPrevEscrowFils = pwData.escrowBalance || 0;

          const newPrevEscrowFils = Math.max(0, oldPrevEscrowFils - prevRefundFils);
          const newPrevAvailFils = oldPrevAvailFils + prevRefundFils;
          const newPrevTotalFils = newPrevAvailFils + newPrevEscrowFils;

          transaction.set(prevWalletRef, {
            userId: outbidUserId,
            availableBalance: newPrevAvailFils,
            escrowBalance: newPrevEscrowFils,
            totalBalance: newPrevTotalFils
          }, { merge: true });
        }
      }

      // 10. Update the auction details (anti-sniping and pricing)
      let finalEndTime = endTime || Date.now();
      const timeRemaining = finalEndTime - Date.now();
      if (timeRemaining > 0 && timeRemaining < 10000) {
        finalEndTime += 15000;
      }

      transaction.update(auctionRef, {
        currentPrice: amount,
        currentPriceFils: amountFils,
        currentBidderId: userId,
        currentBidderName: userData.name || 'User',
        totalBids: totalBids + 1,
        endTime: finalEndTime,
        endsAt: admin.firestore.Timestamp.fromMillis(finalEndTime),
        previousBidderId: outbidUserId || null
      });

      // 11. Create a beautiful system Chat bid indicator
      const chatRef = db.collection('chats').doc();
      transaction.set(chatRef, {
        id: chatRef.id,
        auctionId,
        userId,
        userName: userData.name || 'User',
        userAvatar: userData.avatar || '',
        text: `placed a winning bid of ${amount.toLocaleString()} JOD`,
        timestamp: Date.now(),
        isSystem: false,
        isBid: true,
        bidAmount: amount
      });

      return {
        success: true,
        message: `Successfully bid ${amount} JOD! You are currently the highest bidder.`,
        amount,
        finalEndTime
      };
    });
  } catch (error) {
    console.error('Error during transaction:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Transaction failed.');
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
  const { price, plan, paymentProofUrl, paymentProofImage, transferFullName, transferPhone } = data;

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
      plan: plan || 'monthly',
      price: price || 15,
      paymentProofUrl: proofUrl,
      paymentProofImage: proofUrl,
      transferFullName: transferFullName || '',
      transferPhone: transferPhone || '',
      subscriptionStatus: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const batch = db.batch();
    
    // 1. Create the subscription request document inside subscriptionRequests
    const reqRef = db.collection('subscriptionRequests').doc(reqId);
    batch.set(reqRef, newRequest);

    // 2. Set user status to pending on user document
    batch.set(userRef, {
      subscriptionStatus: 'pending',
      subscriptionPlan: plan || 'monthly',
      paymentProofUrl: proofUrl,
      paymentProofImage: proofUrl,
      transferFullName: transferFullName || '',
      transferPhone: transferPhone || ''
    }, { merge: true });

    await batch.commit();

    return { success: true, reqId, message: 'Subscription request registered successfully.' };

  } catch (error) {
    console.error('Error in requestSubscription:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
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

    return { success: true, message: `Successfully created repaired order for auction ${auctionId}.`, orderId: auctionId };

  } catch (error) {
    console.error('Error in repairEndedAuctionOrder:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Operation failed.');
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

      if (!escrowRef || !escrowData) {
        throw new functions.https.HttpsError('not-found', 'المبلغ غير محجوز أو تم تحريره سابقاً');
      }

      // 4. Read wallets
      const buyerWalletRef = db.collection('wallets').doc(buyerId);
      const sellerWalletRef = db.collection('wallets').doc(sellerId);

      const buyerWalletSnap = await transaction.get(buyerWalletRef);
      const sellerWalletSnap = await transaction.get(sellerWalletRef);

      // 5. Determine amount: Use the escrow amount as the source of truth
      let amountFils = escrowData.amountFils;
      if (!amountFils && escrowData.amount) {
        amountFils = Math.round(escrowData.amount * 1000);
      }
      if (!amountFils && orderData.winningBidAmount) {
        amountFils = Math.round(orderData.winningBidAmount * 1000);
      }

      if (!amountFils || amountFils <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'قيمة العملية غير صالحة');
      }

      const winningAmountJOD = amountFils / 1000;

      // 6. Validate balances
      const oldBuyerEscrow = buyerWalletSnap.exists ? (buyerWalletSnap.data().escrowBalance || 0) : 0;
      const oldBuyerAvail = buyerWalletSnap.exists ? (buyerWalletSnap.data().availableBalance || 0) : 0;

      if (oldBuyerEscrow < amountFils) {
        throw new functions.https.HttpsError('failed-precondition', 'رصيد المشتري المحجوز غير كافٍ');
      }

      // 7. Apply wallet movement
      const newBuyerEscrow = Math.max(0, oldBuyerEscrow - amountFils);
      const newBuyerTotal = oldBuyerAvail + newBuyerEscrow;

      const oldSellerAvail = sellerWalletSnap.exists ? (sellerWalletSnap.data().availableBalance || 0) : 0;
      const oldSellerEscrow = sellerWalletSnap.exists ? (sellerWalletSnap.data().escrowBalance || 0) : 0;
      const newSellerAvail = oldSellerAvail + amountFils;
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

      // 9. Update order status
      transaction.update(orderRef, {
        status: 'completed',
        escrowStatus: 'released',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowReleasedBy: callerUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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

      transaction.set(sellerLedgerRef, {
        id: sellerLedgerRef.id,
        userId: sellerId,
        orderId: orderId,
        auctionId: auctionId,
        amount: winningAmountJOD,
        amountFils: amountFils,
        type: 'sale_payment_received',
        direction: 'credit',
        titleAr: 'تحصيل دفعة مبيعات',
        titleEn: 'Sale Payment Received',
        descriptionAr: `تم استلام مبلغ ${winningAmountJOD} د.أ في رصيدك بعد تحرير ضمان المبيعات.`,
        descriptionEn: `Received ${winningAmountJOD} JOD into your available balance from order escrow.`,
        timestamp: Date.now()
      });

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

      if (isCallerAdmin) {
        const adminActionsRef = db.collection('adminActions').doc();
        transaction.set(adminActionsRef, {
          id: adminActionsRef.id,
          orderId: orderId,
          action: action || 'release_escrow',
          adminId: callerUserId,
          adminName: callerData.name || 'Admin',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: `Force released escrow of ${winningAmountJOD} JOD to seller for order ${orderId}`
        });
      }

      // Write Order Activity record
      const activityRef = orderRef.collection('activity').doc();
      const messageAr = isCallerAdmin 
        ? `قام المشرف بفرض إغلاق الطلب وتحرير الضمان المالي بقيمة ${winningAmountJOD} د.أ للبائع.`
        : `تم الإفراج عن الضمان المالي بقيمة ${winningAmountJOD} د.أ وتحويله إلى محفظة البائع بنجاح.`;
      const messageEn = isCallerAdmin
        ? `Admin forced close order and released secure Escrow funds of ${winningAmountJOD} JOD to seller.`
        : `Escrow funds of ${winningAmountJOD} JOD released and securely deposited into seller's wallet.`;

      transaction.set(activityRef, {
        id: activityRef.id,
        type: 'Escrow Released',
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
        description: `الطلب رقم ${orderId.substring(0, 8)} مكتمل. تم تحويل الضمان للبائع.`,
        descriptionAr: `الطلب رقم ${orderId.substring(0, 8)} مكتمل. تم تحويل الضمان للبائع.`,
        descriptionEn: `Order #${orderId.substring(0, 8)} has been completed. Escrow funds transferred to seller.`,
        type: 'info',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      transaction.set(sellerNotifRef, {
        id: sellerNotifRef.id,
        userId: sellerId,
        title: 'تحصيل رصيد مبيعات 🎉',
        titleAr: 'تحصيل رصيد مبيعات 🎉',
        titleEn: 'Sales Funds Collected 🎉',
        description: `تم الإفراج عن مبلغ ${winningAmountJOD} د.أ وإضافته لرصيدك المتاح بنجاح!`,
        descriptionAr: `تم الإفراج عن مبلغ ${winningAmountJOD} د.أ وإضافته لرصيدك المتاح بنجاح!`,
        descriptionEn: `Funds of ${winningAmountJOD} JOD have been released to your available wallet balance.`,
        type: 'win',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      return { 
        success: true, 
        message: `تم تحرير مبلغ ${winningAmountJOD} د.أ بنجاح للبائع.` 
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

      if (!escrowRef || !escrowData) {
        throw new functions.https.HttpsError('not-found', 'المبلغ غير محجوز أو تم تحريره/استرداده سابقاً');
      }

      // 4. Read wallets (only buyer is credited)
      const buyerWalletRef = db.collection('wallets').doc(buyerId);
      const buyerWalletSnap = await transaction.get(buyerWalletRef);

      // 5. Determine amount: Use the escrow amount as the source of truth
      let amountFils = escrowData.amountFils;
      if (!amountFils && escrowData.amount) {
        amountFils = Math.round(escrowData.amount * 1000);
      }
      if (!amountFils && orderData.winningBidAmount) {
        amountFils = Math.round(orderData.winningBidAmount * 1000);
      }

      if (!amountFils || amountFils <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'قيمة العملية غير صالحة');
      }

      const winningAmountJOD = amountFils / 1000;

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

      // 9. Update order status
      transaction.update(orderRef, {
        status: 'refunded',
        escrowStatus: 'refunded',
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowRefundedAt: admin.firestore.FieldValue.serverTimestamp(),
        escrowRefundedBy: callerUserId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

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

      // Admin Action Log
      const adminActionsRef = db.collection('adminActions').doc();
      transaction.set(adminActionsRef, {
        id: adminActionsRef.id,
        orderId: orderId,
        action: action || 'refund_order_escrow',
        adminId: callerUserId,
        adminName: callerData.name || 'Admin',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: `Force refunded escrow of ${winningAmountJOD} JOD to buyer for order ${orderId}`
      });

      // Write Order Activity record
      const activityRef = orderRef.collection('activity').doc();
      const messageAr = `قام المشرف بفرض إلغاء الطلب واسترداد الضمان المالي بقيمة ${winningAmountJOD} د.أ للمشتري.`;
      const messageEn = `Admin forced refund. Escrow funds of ${winningAmountJOD} JOD returned to buyer's available wallet.`;

      transaction.set(activityRef, {
        id: activityRef.id,
        type: 'Escrow Refunded',
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
        title: 'استرداد الضمان المالي للطلب 💸',
        titleAr: 'استرداد الضمان المالي للطلب 💸',
        titleEn: 'Order Escrow Refunded 💸',
        description: `تم إرجاع مبلغ الضمان بقيمة ${winningAmountJOD} د.أ إلى رصيدك المتاح بنجاح لعدم اكتمال الطلب.`,
        descriptionAr: `تم إرجاع مبلغ الضمان بقيمة ${winningAmountJOD} د.أ إلى رصيدك المتاح بنجاح لعدم اكتمال الطلب.`,
        descriptionEn: `A pending escrow of ${winningAmountJOD} JOD has been returned to your wallet available balance.`,
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
        description: `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} واسترجاع الضمان المالي للمشتري.`,
        descriptionAr: `تم إلغاء الطلب رقم ${orderId.substring(0, 8)} واسترجاع الضمان المالي للمشتري.`,
        descriptionEn: `Order #${orderId.substring(0, 8)} has been cancelled and funds refunded to the buyer.`,
        type: 'alert',
        timestamp: Date.now(),
        read: false,
        orderId: orderId
      });

      return { 
        success: true, 
        message: `تم استرداد مبلغ ${winningAmountJOD} د.أ بنجاح للمشتري.` 
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






