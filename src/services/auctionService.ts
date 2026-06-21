import { db, auth, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
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
  console.log(`[Firebase placeAuctionBid] Redirecting call to Callable Cloud Function... Auction: ${auctionId}, Amt: ${amount}`);
  try {
    const placeBidCallable = httpsCallable<{ auctionId: string; amount: number }, { success: boolean; message: string }>(functions, 'placeBid');
    const result = await placeBidCallable({ auctionId, amount });
    if (!result.data.success) {
      throw new Error(result.data.message || 'Bidding failed.');
    }
  } catch (err: any) {
    console.error(`[placeAuctionBid Cloud Function Error]`, err);
    throw err;
  }
}

