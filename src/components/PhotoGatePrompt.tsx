import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAvatarUpload } from '../hooks/useAvatarUpload';
import { Camera, ShieldCheck, X, Loader2, CheckCircle } from 'lucide-react';

interface PhotoGatePromptProps {
  onClose: () => void;
}

/**
 * Trust gate sheet — shown when a member without a real profile photo taps
 * bid or sell. Mirrors SubscriptionPromptModal's look, but its primary action
 * is an inline avatar uploader (reuses useAvatarUpload). On a successful upload
 * it dismisses so the user can retry the action they were doing.
 */
export const PhotoGatePrompt: React.FC<PhotoGatePromptProps> = ({ onClose }) => {
  const { language } = useApp();
  const isAr = language === 'ar';
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error, uploadAvatar } = useAvatarUpload();
  const [done, setDone] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const res = await uploadAvatar(file);
    if (res.success) {
      setDone(true);
      // Brief success beat, then dismiss so the user can retry their action.
      setTimeout(() => onClose(), 900);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative bg-surface-raised text-fg w-full max-w-sm rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="photo-gate-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isAr ? 'أضف صورتك الشخصية' : 'Add your profile photo'}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={isAr ? 'إغلاق' : 'Close'}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-surface-sunken text-fg-muted min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Headline */}
        <div className="text-center space-y-3 mb-6 mt-2">
          <div className="mx-auto w-11 h-11 rounded-full bg-accent-weak border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <ShieldCheck className="w-6 h-6 fill-current text-white stroke-[#FF6B00]" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-fg tracking-tight leading-snug">
            {isAr ? 'أضِف صورتك عشان تزايد 📸' : 'Add your photo to bid 📸'}
          </h2>
          <p className="text-xs text-fg-muted max-w-xs mx-auto leading-normal">
            {isAr
              ? 'الصور الحقيقية تحافظ على ثقة مزادات مزاد — المشترون والبائعون يتعاملون مع أشخاص حقيقيين. أضِف صورتك لتزايد أو تبيع.'
              : "Real photos keep Mazad's auctions trustworthy — buyers and sellers deal with real people. Add yours to bid or sell."}
          </p>
        </div>

        {/* Hidden file input (camera allowed on mobile) */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Primary CTA: pick/take a photo */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || done}
          className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 disabled:opacity-60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          id="photo-gate-add-cta"
        >
          {done ? (
            <>
              <CheckCircle className="w-4 h-4" />
              <span>{isAr ? 'تم! جاري المتابعة' : 'Done! Continuing'}</span>
            </>
          ) : uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isAr ? `جاري الرفع ${Math.round(progress)}%` : `Uploading ${Math.round(progress)}%`}</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>{isAr ? 'أضف صورة' : 'Add photo'}</span>
            </>
          )}
        </button>

        {/* Upload progress bar */}
        {uploading && (
          <div className="mt-3 h-1.5 w-full bg-surface-sunken rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FF6B00] transition-all duration-200"
              style={{ width: `${Math.max(4, Math.round(progress))}%` }}
            />
          </div>
        )}

        {/* Error */}
        {error && !uploading && (
          <p className="mt-3 text-[11px] font-bold text-rose-600 text-center leading-normal">{error}</p>
        )}

        {/* Secondary: not now */}
        <button
          onClick={onClose}
          disabled={uploading}
          className="w-full mt-3 text-[11px] font-semibold text-fg-muted hover:text-fg underline underline-offset-2 decoration-gray-200 hover:decoration-gray-400 transition-colors cursor-pointer disabled:opacity-50"
          id="photo-gate-not-now"
        >
          {isAr ? 'لاحقاً' : 'Not now'}
        </button>
      </div>
    </div>
  );
};
