import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyDpGyYrneZqX578TcD95LogNPsDwOHX1EA",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "mazadjoapp.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "mazadjoapp",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "mazadjoapp.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "622832200971",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:622832200971:web:f0dcf4d08a22fdcc29460e",
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Lazy loaders to prevent firebase/storage and firebase/functions from being bundled on initial page load
export async function getFirebaseStorage() {
  const { getStorage } = await import("firebase/storage");
  return getStorage(app);
}

export async function getFirebaseFunctions() {
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(app);
}

export async function getCallableFunction<TRequest = any, TResponse = any>(name: string) {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const functionsInstance = getFunctions(app);
  return httpsCallable<TRequest, TResponse>(functionsInstance, name);
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
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
