const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * 1. scheduledAuctionCloser (BUG #2 & BUG #6 Compliance)
 * Runs every minute to sweep, settle & close expired auctions with transactional consistency.
 * Prevents client-reliant closing so that auctions always conclude on server-set time.
 */
exports.scheduledAuctionCloser = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    
    console.log('[scheduledAuctionCloser] Executing minute cron check for expired active listings...');

    try {
      // Query active/live auctions that have reached or passed their expiration threshold
      const expiredQuery = await db.collection('auctions')
        .where('status', 'in', ['active', 'live'])
        .where('endsAt', '<=', now)
        .get();

      if (expiredQuery.empty) {
        console.log('[scheduledAuctionCloser] No expired active listings found.');
        return null;
      }

      console.log(`[scheduledAuctionCloser] Found ${expiredQuery.size} expired listings. Settle process initiated...`);

      const promises = expiredQuery.docs.map(async (auctionDoc) => {
        const auctionId = auctionDoc.id;
        const auctionData = auctionDoc.data();
        const winnerId = auctionData.currentBidderId;
        const winnerName = auctionData.currentBidderName;
        const finalPrice = auctionData.currentPrice || auctionData.startingPrice;
        const totalBids = auctionData.totalBids || 0;

        return db.runTransaction(async (transaction) => {
          const freshDoc = await transaction.get(auctionDoc.ref);
          const freshData = freshDoc.data();

          // Double check status inside transaction to prevent double settlement
          if (freshData.status === 'completed' || freshData.status === 'ended') {
            return;
          }

          if (totalBids > 0 && winnerId) {
            // 1. Mark auction as completed successfully with final price & winner
            transaction.update(auctionDoc.ref, {
              status: 'completed',
              settledAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // 2. Increment wonCount for the lucky platform winner
            const winnerRef = db.collection('users').doc(winnerId);
            transaction.set(winnerRef, {
              wonCount: admin.firestore.FieldValue.increment(1)
            }, { merge: true });

            console.log(`[scheduledAuctionCloser] Settled auction ${auctionId} - Winner: ${winnerName} (${winnerId}) at ${finalPrice} JOD`);

            // 3. Dispatch victory notification to high-bidder
            const winnerSnap = await transaction.get(winnerRef);
            if (winnerSnap.exists() && winnerSnap.data().fcmToken) {
              const token = winnerSnap.data().fcmToken;
              await admin.messaging().send({
                token: token,
                notification: {
                  title: 'تهانينا! لقد فزت بالمزاد 🎉',
                  body: `مبروك! لقد انتهى المزاد على "${auctionData.title}" بعرضك الفائز بقيمة ${finalPrice.toLocaleString()} دينار أردني.`
                }
              }).catch(err => console.warn(`[scheduledAuctionCloser FCM Error] ${err.message}`));
            }
          } else {
            // 4. Close listing as ended without bidders
            transaction.update(auctionDoc.ref, {
              status: 'ended',
              settledAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[scheduledAuctionCloser] Expired auction ${auctionId} ended without any bids.`);
          }
        });
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
    const db = admin.firestore();

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
