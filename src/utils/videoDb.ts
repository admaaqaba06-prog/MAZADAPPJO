// IndexedDB helper to persist custom uploaded video files across browser reloads.
// Since localStorage cannot store large binary blobs (and has a 5MB size limit),
// IndexedDB is the perfect browser API for caching and playing custom videos.

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';

export async function uploadVideoToStorage(auctionId: string, blob: Blob): Promise<string> {
  const storageRef = ref(storage, `auction-videos/${auctionId}_${Date.now()}.mp4`);
  await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

const DB_NAME = 'MazadJoVideoStore';
const STORE_NAME = 'customVideos';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveVideoBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error saving video to IndexedDB:', err);
  }
}

export async function getVideoBlob(id: string): Promise<Blob | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error getting video from IndexedDB:', err);
    return null;
  }
}

export async function deleteVideoBlob(id: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Error deleting video from IndexedDB:', err);
  }
}

export async function resolveVideoUrl(id: string, fbVideoUrl: string, category?: string): Promise<string> {
  if (fbVideoUrl && fbVideoUrl.startsWith('blob:')) {
    try {
      const blob = await getVideoBlob(id);
      if (blob) {
        return URL.createObjectURL(blob);
      }
    } catch (e) {
      console.error('Error resolving video url for id', id, e);
    }
  }

  // Fallback map if the blob is missing or starts with 'blob:' but not in this browser's IndexedDB
  if (!fbVideoUrl || fbVideoUrl.startsWith('blob:')) {
    const cat = (category || '').toLowerCase();
    if (cat.includes('vehicle') || cat.includes('car') || cat.includes('سيارات') || cat.includes('مركبات')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';
    } else if (cat.includes('luxury') || cat.includes('watch') || cat.includes('ساعات') || cat.includes('فاخر')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
    } else if (cat.includes('electronic') || cat.includes('phone') || cat.includes('هواتف') || cat.includes('أجهزة')) {
      return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4';
    }
    return 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4';
  }

  return fbVideoUrl;
}
