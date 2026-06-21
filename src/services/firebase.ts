import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDpGyYrneZqX578TcD95LogNPsDwOHX1EA",
  authDomain: "mazadjoapp.firebaseapp.com",
  projectId: "mazadjoapp",
  storageBucket: "mazadjoapp.firebasestorage.app",
  messagingSenderId: "622832200971",
  appId: "1:622832200971:web:95a4095b06d2ee8029460e",
  measurementId: "G-HP0SNWRM9D"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
