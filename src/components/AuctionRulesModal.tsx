import React from 'react';
import { motion } from 'motion/react';
import { Gavel, X } from 'lucide-react';
import { AUCTION_RULES, RULES_VERSION } from '../content/auctionRules';

interface AuctionRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Language toggle — the shared content is bilingual; render the matching side. */
  isAr: boolean;
}

/**
 * Plain-language Auction Rules (E4). Presents the shared AUCTION_RULES content as
 * a clean numbered list — the primary, discoverable rules surface (the formal ToC
 * lives in TermsModal). Mirrors the TermsModal structure/close-button style but on
 * the app's orange/cream theme. Bilingual: renders rule.ar or rule.en per isAr.
 *
 * Mobile-safe: no min-h-screen (it renders inside the overflow-hidden app frame);
 * the panel is capped at max-h-[85vh] and scrolls internally, honoring safe areas.
 */
export default function AuctionRulesModal({ isOpen, onClose, isAr }: AuctionRulesModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="bg-surface-raised border border-line rounded-[24px] w-full max-w-lg shadow-[0_24px_50px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col my-auto max-h-[85vh] font-sans"
        style={{ textAlign: isAr ? 'right' : 'left' }}
      >
        {/* Header */}
        <div className="bg-accent-weak p-5 border-b border-line shrink-0 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-[#FF6B00]/10 p-2 rounded-xl border border-[#FF6B00]/20 shrink-0">
              <Gavel className="w-5 h-5 text-[#FF6B00]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-fg">
                {isAr ? 'قواعد المزاد' : 'Auction Rules'}
              </h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {isAr ? 'مزادو — القواعد المبسّطة' : 'Mazzado — the plain-language rules'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="w-8 h-8 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-zinc-500 hover:text-fg hover:bg-surface-sunken active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable numbered rules */}
        <div className="p-5 overflow-y-auto scrollbar-thin">
          <ol className="space-y-2.5 list-none p-0 m-0">
            {AUCTION_RULES.map((rule, i) => (
              <li
                key={i}
                className="flex items-start gap-3 bg-surface-sunken border border-line rounded-2xl p-3.5"
              >
                <span className="shrink-0 w-6 h-6 rounded-lg bg-[#FF6B00] text-white text-[11px] font-black font-mono flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-fg leading-relaxed font-medium">
                  {isAr ? rule.ar : rule.en}
                </span>
              </li>
            ))}
          </ol>

          <p className="text-center text-[10px] text-zinc-400 font-mono mt-4">
            {isAr
              ? `إصدار القواعد ${RULES_VERSION} · مزادو`
              : `Rules version ${RULES_VERSION} · Mazzado`}
          </p>
        </div>

        {/* Footer action */}
        <div className="bg-surface-sunken p-4 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[#FF6B00] text-white hover:bg-[#e05e00] font-black py-3 rounded-2xl text-center text-xs transition-all active:scale-95 cursor-pointer shadow-md select-none"
          >
            {isAr ? 'فهمت' : 'Got it'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
