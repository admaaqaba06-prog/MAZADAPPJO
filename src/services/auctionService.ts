import { db, auth } from './firebase';
import { doc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function placeAuctionBid(
  auctionId: string,
  amount: number,
  userId: string,
  userName: string
): Promise<void> {
  console.log(`[Firebase placeAuctionBid] Initiating write... Auction: ${auctionId}, Amt: ${amount}`);
  const pathForWrite = `bids/${auctionId}_${Date.now()}`;
  
  try {
    // 1. Create a log / bid record inside a 'bids' collection
    await setDoc(doc(db, 'bids', `${auctionId}_${Date.now()}`), {
      auctionId,
      amount,
      bidderId: userId,
      bidderName: userName,
      timestamp: serverTimestamp()
    });

    // 2. Update parent auction document current price and top bid details
    const auctionDocRef = doc(db, 'auctions', auctionId);
    await setDoc(auctionDocRef, {
      id: auctionId,
      currentPrice: amount,
      currentBidderId: userId,
      currentBidderName: userName,
      lastUpdatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`[Firebase success] Bid of ${amount} JOD recorded in Firestore.`);
  } catch (err: any) {
    console.warn(`[Firebase warning] Firestore operation returned with permission warning or lack of offline configuration. Saving bid locally. Details: ${err.message}`);
    // Capture error with full diagnostic context
    handleFirestoreError(err, OperationType.WRITE, pathForWrite);
  }
}

