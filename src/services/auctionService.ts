import { db, auth } from './firebase';
import { doc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDoc, runTransaction } from 'firebase/firestore';

export interface FirebaseAuction {
  id: string;
  title: string;
  description: string;
  currentPrice: number;
  currency: string;
  totalBids: number;
  winnerId?: string;
  winnerName?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  endsAt?: any;
  sellerName?: string;
  status?: string;
  minIncrement?: number;
  previousBidderId?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  // Clean, high-fidelity logging for backend telemetry, avoiding clutter
  console.error('[Firestore Diagnostics Error]', {
    error: errMessage,
    operationType,
    path,
    userId: auth.currentUser?.uid,
    authEmail: auth.currentUser?.email
  });
  
  throw new Error(errMessage);
}

export async function placeAuctionBid(
  auctionId: string,
  amount: number,
  userId: string,
  userName: string
): Promise<void> {
  console.log(`[Firebase placeAuctionBid] Initiating write via runTransaction... Auction: ${auctionId}, Amt: ${amount}`);
  const pathForWrite = `auctions/${auctionId}/bids`;
  
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Enforce Subscription and Rate Limiting on User document (Server-side & Transactional)
      const userDocRef = doc(db, 'users', userId);
      const userSnap = await transaction.get(userDocRef);
      
      let isSubscribed = false;
      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // Enforce Account-lockout Check
        if (userData.isBlocked === true) {
          throw new Error('عذراً، جرى تقييد هذا الحساب من قِبل الإدارة بسبب مخالفة سياسات المنصة.');
        }

        // Subscription validation
        const subStatus = userData.subscriptionStatus || 'none';
        const subTier = userData.subscriptionTier || 'none';
        const subActive = userData.subscriptionActive === true;

        if (subStatus === 'active' || subActive || subTier === 'pro' || subTier === 'business' || subStatus === 'pro' || subStatus === 'business') {
          isSubscribed = true;
        }

        // Validate expiration timestamp/date if present
        if (userData.subscriptionExpiry) {
          const expiryTime = typeof userData.subscriptionExpiry === 'number' 
            ? userData.subscriptionExpiry 
            : new Date(userData.subscriptionExpiry).getTime();
            
          if (!isNaN(expiryTime) && Date.now() > expiryTime) {
            isSubscribed = false;
          }
        }

        if (!isSubscribed) {
          throw new Error('عذراً، يجب ترقية الحساب إلى اشتراك فعال لتتمكن من تقديم عرض السعر.');
        }

        // Rate Limit Guard: 3000ms cool-down
        const lastBidTime = userData.lastBidTime || 0;
        const now = Date.now();
        if (now - lastBidTime < 3000) {
          throw new Error('⚠️ الرجاء الانتظار قليلاً! يرجى ترك مهلة 3 ثوانٍ على الأقل بين العروض المتتالية.');
        }

        // Synchronously register the current bid write action
        transaction.set(userDocRef, {
          lastBidTime: now
        }, { merge: true });
      }

      // 2. Enforce Auction state check, price matching, and expiry
      const auctionDocRef = doc(db, 'auctions', auctionId);
      const auctionSnap = await transaction.get(auctionDocRef);
      
      if (!auctionSnap.exists()) {
        throw new Error('عذراً، هذا المزاد غير متوفر في النظام حالياً.');
      }

      const auctionData = auctionSnap.data();
      
      // Enforce Status check
      if (auctionData.status === 'completed' || auctionData.status === 'ended' || auctionData.status === 'rejected') {
        throw new Error('⚠️ هذا المزاد تم إغلاقه بالفعل أو انتهى وقت المزايدة عليه.');
      }

      // Enforce Time Expiration check
      let endsAtMs = 0;
      if (auctionData.endsAt) {
        if (typeof auctionData.endsAt.toMillis === 'function') {
          endsAtMs = auctionData.endsAt.toMillis();
        } else if (auctionData.endsAt.seconds) {
          endsAtMs = auctionData.endsAt.seconds * 1000;
        } else {
          endsAtMs = new Date(auctionData.endsAt).getTime();
        }
      }

      if (endsAtMs > 0 && Date.now() > endsAtMs) {
        throw new Error('⚠️ انتهى الوقت المحدد للمزاد رسمياً، لا يمكن إرسال المزيد من المزايدات.');
      }

      // Price calculation
      let nextMinBid = auctionData.startingPrice || 0;
      const totalBids = auctionData.totalBids || 0;
      const currentPrice = auctionData.currentPrice || 0;
      const minIncrement = auctionData.minIncrement || 0;

      nextMinBid = currentPrice + (totalBids > 0 ? minIncrement : 0);

      if (amount < nextMinBid) {
        throw new Error(`عذراً، عرض السعر غير كافٍ. الحد الأدنى المطلوب هو ${nextMinBid} JOD`);
      }

      // Preserve previous bidder information to enable FCM outbid triggers
      const previousBidderId = auctionData.currentBidderId || null;
      const previousBidderName = auctionData.currentBidderName || null;

      // 3. Record new bid in the auctions/{id}/bids subcollection
      const newBidRef = doc(collection(db, 'auctions', auctionId, 'bids'));
      transaction.set(newBidRef, {
        auctionId,
        amount,
        bidderId: userId,
        bidderName: userName,
        timestamp: serverTimestamp()
      });

      // 4. Update the auction document with leading bids stats
      transaction.set(auctionDocRef, {
        id: auctionId,
        currentPrice: amount,
        currentBidderId: userId,
        currentBidderName: userName,
        previousBidderId: previousBidderId,
        previousBidderName: previousBidderName,
        totalBids: totalBids + 1,
        lastUpdatedAt: serverTimestamp()
      }, { merge: true });
    });

    console.log(`[Firebase success] Transaction committed successfully: Bid of ${amount} JOD recorded.`);
  } catch (err: any) {
    console.warn(`[Firebase Transaction Error] Details: ${err.message}`);
    handleFirestoreError(err, OperationType.WRITE, pathForWrite);
  }
}

