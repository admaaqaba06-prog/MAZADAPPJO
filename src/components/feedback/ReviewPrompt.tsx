import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Star, X } from 'lucide-react';
import Pressable from './Pressable';
import { useToast } from './Toast';
import { useApp } from '../../context/AppContext';
import type { Order } from '../../types';

type ReviewPromptProps = {
  order: Order;
  /** The signed-in buyer's uid — firestore.rules requires create.buyerId == auth.uid. */
  buyerId: string;
  /** Internal vendor slug carried on the auction/order; null when unknown. */
  vendorId?: string | null;
  language: 'ar' | 'en';
  onClose: () => void;
  onSubmitted?: () => void;
};

/**
 * Post-win review prompt: a compact modal with 5 tappable stars and an
 * optional text field. Writes a `buyer_rates_auction` doc to `reviews`.
 * One screen, ten seconds — the investment step of the habit loop.
 */
export default function ReviewPrompt({
  order,
  buyerId,
  vendorId = null,
  language,
  onClose,
  onSubmitted,
}: ReviewPromptProps) {
  const isAr = language === 'ar';
  const { showToast } = useToast();
  const { rateAuction } = useApp();
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (stars < 1 || submitting || submitted) return;
    setSubmitting(true);
    try {
      // Order-verified server callable is the sole writer of buyer_rates_auction docs;
      // it derives sellerId/auctionId/buyerId from the real order (never client-supplied),
      // enforces buyer-only + completed/delivered + one-per-order, and moves no money.
      await rateAuction(order.id, { stars, comment: text.trim() });
      setSubmitted(true);
      showToast({
        type: 'success',
        title: isAr ? 'شكراً لك! تم تسجيل تقييمك ⭐' : 'Thank you! Your rating is in ⭐',
      });
      // Let the star pop play before closing.
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 850);
    } catch (err: any) {
      console.error('Review submit failed:', err);
      showToast({
        type: 'warn',
        title: isAr ? 'تعذر إرسال التقييم — حاول مجدداً' : 'Could not submit rating — try again',
      });
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="review-prompt-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed inset-0 z-[9980] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={submitted ? undefined : onClose}
        id="review-prompt-overlay"
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="bg-surface-raised rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-2xl relative"
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
          onClick={(e) => e.stopPropagation()}
          id="review-prompt-card"
        >
          {!submitted && (
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'إغلاق' : 'Close'}
              className={`absolute top-4 ${isAr ? 'left-4' : 'right-4'} text-gray-300 hover:text-fg-muted transition-colors cursor-pointer`}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Order context */}
          <div className="flex items-center gap-3">
            <img
              src={order.auctionImage || ''}
              alt={order.auctionTitle}
              className="w-12 h-12 rounded-2xl object-cover border border-line shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 space-y-0.5">
              <h3 className="font-black text-fg text-sm leading-snug">
                {isAr ? 'قيّم تجربتك ⭐' : 'Rate your experience ⭐'}
              </h3>
              <p className="text-[11px] text-fg-muted truncate">{order.auctionTitle}</p>
            </div>
          </div>

          {/* Stars */}
          <div className="flex items-center justify-center gap-2 py-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = n <= stars;
              return (
                <Pressable
                  key={n}
                  onClick={() => !submitted && setStars(n)}
                  aria-label={`${n} ${isAr ? 'نجوم' : 'stars'}`}
                  className="p-1 cursor-pointer"
                >
                  <motion.span
                    className="block"
                    animate={
                      submitted && active
                        ? { scale: [1, 1.35, 1] }
                        : { scale: active ? 1.08 : 1 }
                    }
                    transition={
                      submitted && active
                        ? { duration: 0.5, ease: 'easeOut', delay: n * 0.05 }
                        : { duration: 0.15, ease: 'easeOut' }
                    }
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${
                        active ? 'text-amber-400 fill-amber-400' : 'text-gray-200'
                      }`}
                      strokeWidth={1.75}
                    />
                  </motion.span>
                </Pressable>
              );
            })}
          </div>

          {/* Optional text */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitted}
            maxLength={500}
            rows={3}
            placeholder={isAr ? 'شاركنا تجربتك (اختياري)' : 'Tell us about your experience (optional)'}
            className="w-full bg-surface-sunken border border-line focus:border-[#FF6B00]/50 rounded-2xl p-3 text-xs font-bold text-fg placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/30 transition-all resize-none"
            id="review-prompt-text"
          />

          {/* Submit */}
          <Pressable
            onClick={handleSubmit}
            disabled={stars < 1 || submitting || submitted}
            className="w-full bg-[#FF6B00] hover:bg-[#FF8000] disabled:opacity-40 text-white font-black py-3.5 rounded-2xl text-xs transition-all tracking-wider uppercase font-mono cursor-pointer shadow-md shadow-orange-500/10"
          >
            {submitted
              ? (isAr ? 'تم التقييم ⭐' : 'Rated ⭐')
              : submitting
                ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...')
                : (isAr ? 'قيّم' : 'Rate')}
          </Pressable>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
