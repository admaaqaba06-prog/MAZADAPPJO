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

      // 4. Convert bid amount to fils (integers)
      const amountFils = Math.round(amount * 1000);

      const currentPriceFils = Math.round((auctionData.currentPrice || auctionData.startingPrice || 0) * 1000);
      const minIncrementFils = Math.round((auctionData.minIncrement || 10) * 1000);
      
      const totalBids = auctionData.totalBids || 0;
      const minRequiredFils = totalBids > 0 ? (currentPriceFils + minIncrementFils) : currentPriceFils;

      if (amountFils < minRequiredFils) {
        return { success: false, message: `Minimum bid of ${(minRequiredFils / 1000).toLocaleString()} JOD required.` };
      }

      // 5. Query if the bidder has an existing locked escrow for this auction
      const existingEscrowsQuery = await db.collection('escrows')
        .where('auctionId', '==', auctionId)
        .where('bidderId', '==', userId)
        .where('status', '==', 'locked')
        .get();
      
      let existingEscrowDoc = null;
      let previousCommittedAmountFils = 0;
      if (!existingEscrowsQuery.empty) {
        existingEscrowDoc = existingEscrowsQuery.docs[0];
        const prevEscData = existingEscrowDoc.data();
        previousCommittedAmountFils = prevEscData.amountFils || Math.round((prevEscData.amount || 0) * 1000);
      }

      // Query if there is a previous locked escrow belonging to the outbid user
      const outbidUserId = auctionData.currentBidderId;
      let prevEscrowDoc = null;
      let prevRefundFils = 0;
      let prevWalletSnap = null;
      let prevWalletRef = null;

      if (outbidUserId && outbidUserId !== userId) {
        const prevEscrowsQuery = await db.collection('escrows')
          .where('auctionId', '==', auctionId)
          .where('bidderId', '==', outbidUserId)
          .where('status', '==', 'locked')
          .get();

        if (!prevEscrowsQuery.empty) {
          prevEscrowDoc = prevEscrowsQuery.docs[0];
          const prevEscrow = prevEscrowDoc.data();
          prevRefundFils = prevEscrow.amountFils || Math.round((prevEscrow.amount || 0) * 1000);

          // Get the outbid user's wallet BEFORE any sets/updates are done in the transaction
          prevWalletRef = db.collection('wallets').doc(outbidUserId);
          prevWalletSnap = await transaction.get(prevWalletRef);
        }
      }

      // Incremental delta calculation in fils
      const incrementalDeltaFils = amountFils - previousCommittedAmountFils;

      if (walletData.availableBalance < incrementalDeltaFils) {
        return { success: false, message: `Insufficient Wallet Funds! You need ${((incrementalDeltaFils - walletData.availableBalance) / 1000).toLocaleString()} JOD more.` };
      }

      // 6. Update current bidder's wallet (All reads are now done! Safe to start writing)
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
  const { amount, alias, paymentProofUrl } = data; // amount is in JOD (double)

  if (typeof amount !== 'number' || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid top-up amount.');
  }

  try {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userSnap.data();

    const escrowId = `cliq-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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
    if (handlerData.role !== 'admin' && !context.auth.token.admin && handlerData.email !== 'admaaqaba06@gmail.com') {
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



