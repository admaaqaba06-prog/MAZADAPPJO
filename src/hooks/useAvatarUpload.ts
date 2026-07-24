import { useCallback, useState } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { resizeImage } from '../utils/resizeImage';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — matches storage.rules
const AVATAR_DIMENSION = 512;

export interface AvatarUploadResult {
  success: boolean;
  url?: string;
  message?: string;
}

/**
 * Center-crop an image File/Blob to a square and scale it down to ~512px via an
 * offscreen <canvas>. Phone cameras shoot tall 12MP frames; an avatar wants a
 * small square. Never throws — falls back to the original file whenever a canvas
 * isn't available (e.g. Node) or decode fails, so it's always safe to await.
 */
function cropToSquare(file: File | Blob): Promise<File | Blob> {
  return new Promise((resolve) => {
    const type = (file as File).type || '';
    if (!type.startsWith('image/') || type === 'image/gif') {
      resolve(file);
      return;
    }
    if (
      typeof document === 'undefined' ||
      typeof Image === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      resolve(file);
      return;
    }

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }
    const cleanup = () => {
      try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ }
    };

    const img = new Image();
    img.onerror = () => { cleanup(); resolve(file); };
    img.onload = () => {
      try {
        const { width, height } = img;
        if (!width || !height) { cleanup(); resolve(file); return; }
        const side = Math.min(width, height);
        const sx = Math.round((width - side) / 2);
        const sy = Math.round((height - side) / 2);
        const target = Math.min(AVATAR_DIMENSION, side);

        const canvas = document.createElement('canvas');
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); resolve(file); return; }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
        canvas.toBlob((blob) => {
          cleanup();
          resolve(blob && blob.size > 0 ? blob : file);
        }, 'image/jpeg', 0.85);
      } catch {
        cleanup();
        resolve(file);
      }
    };
    img.src = objectUrl;
  });
}

/**
 * Shared avatar upload flow used by ProfileView and the PhotoGate. Validates the
 * file, center-crops to a square + compresses (cropToSquare, then the shared
 * resizeImage as a belt-and-braces compressor), uploads to
 * avatars/{uid}/avatar_{ts}.jpg via the same getFirebaseStorage +
 * uploadBytesResumable pattern the listing media uses, then writes the download
 * URL onto users/{uid}.avatar. Exposes progress + a friendly error message.
 */
export function useAvatarUpload() {
  const { currentUser, language } = useApp();
  const isAr = language === 'ar';
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
  }, []);

  const uploadAvatar = useCallback(async (file: File): Promise<AvatarUploadResult> => {
    setError(null);
    setProgress(0);

    const uid = currentUser?.id;
    if (!uid) {
      const message = isAr ? 'سجّل الدخول أولاً.' : 'Please sign in first.';
      setError(message);
      return { success: false, message };
    }
    if (!file.type || !file.type.startsWith('image/')) {
      const message = isAr ? 'الرجاء اختيار ملف صورة (JPG أو PNG).' : 'Please choose an image file (JPG or PNG).';
      setError(message);
      return { success: false, message };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const message = isAr ? 'الصورة كبيرة جداً — الحد الأقصى ١٠ ميغابايت.' : 'Image is too large — 10MB max.';
      setError(message);
      return { success: false, message };
    }

    setUploading(true);
    try {
      const { ref, uploadBytesResumable, getDownloadURL } = await import('firebase/storage');
      const { getFirebaseStorage } = await import('../services/firebase');

      // Square-crop then compress. Both helpers never throw and fall back to the
      // original file when a canvas isn't available.
      const squared = await cropToSquare(file);
      const optimized = await resizeImage(squared, { maxDimension: AVATAR_DIMENSION, quality: 0.85 });

      const storage = await getFirebaseStorage();
      const path = `avatars/${uid}/avatar_${Date.now()}.jpg`;
      const uploadTask = uploadBytesResumable(ref(storage, path), optimized, {
        contentType: (optimized as Blob).type || 'image/jpeg',
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          (err) => reject(err),
          () => resolve()
        );
      });

      const url = await getDownloadURL(uploadTask.snapshot.ref);
      await updateDoc(doc(db, 'users', uid), { avatar: url });
      setProgress(100);
      return { success: true, url };
    } catch (err: any) {
      console.error('Avatar upload failed:', err?.code, err?.message);
      const message = isAr
        ? 'تعذّر رفع الصورة. تحقق من اتصالك وحاول مجدداً.'
        : 'Could not upload the photo. Check your connection and try again.';
      setError(message);
      return { success: false, message };
    } finally {
      setUploading(false);
    }
  }, [currentUser?.id, isAr]);

  return { uploading, progress, error, uploadAvatar, reset };
}
