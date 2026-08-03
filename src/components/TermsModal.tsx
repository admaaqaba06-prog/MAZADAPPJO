import React from 'react';
import { motion } from 'motion/react';
import { Scale, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  LEGAL_HEADER,
  LEGAL_SECTIONS,
  LEGAL_FOOTER,
  type LegalLine,
} from '../content/legalTerms';

/**
 * The formal terms, opened from the footer link.
 *
 * The copy moved to `content/legalTerms.ts` so it could be translated: this was
 * the largest English-only surface left in an Arabic-first app, and it was also
 * hardcoded `dir="ltr"`, so even the Arabic that did reach it would have
 * rendered left-to-right. Three factual corrections were made in that move and
 * are documented there.
 *
 * This modal RECORDS NOTHING. It is reference material; the real acceptance
 * gate is the auction rules, which carry a version and store consent. Its
 * button used to read "I Accept and Agree to the Bidding Policies" while doing
 * nothing but closing — it now says Close, which is what it does.
 */
interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TONE_TEXT: Record<NonNullable<LegalLine['tone']>, string> = {
  default: 'text-fg',
  warn: 'text-amber-700',
  danger: 'text-red-600',
  good: 'text-emerald-700',
};

const TONE_DOT: Record<NonNullable<LegalLine['tone']>, string> = {
  default: 'bg-[#FF6B00]',
  warn: 'bg-amber-500',
  danger: 'bg-red-500',
  good: 'bg-emerald-500',
};

export default function TermsModal({ isOpen, onClose }: TermsModalProps) {
  const { language } = useApp();
  const isAr = language === 'ar';
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`bg-surface-raised border border-line rounded-[24px] w-full max-w-lg shadow-[0_24px_50px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col my-auto max-h-[85vh] ${isAr ? 'text-right' : 'text-left'}`}
      >
        {/* Header */}
        <div className="bg-surface-sunken p-5 border-b border-line shrink-0 flex justify-between items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-[#FF6B00]/10 p-2 rounded-xl border border-[#FF6B00]/20 shrink-0">
              <Scale className="w-5 h-5 text-[#FF6B00]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-fg font-sans">
                {isAr ? LEGAL_HEADER.titleAr : LEGAL_HEADER.titleEn}
              </h2>
              <p className="text-[10px] text-fg-muted mt-0.5">
                {isAr ? LEGAL_HEADER.subtitleAr : LEGAL_HEADER.subtitleEn}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? LEGAL_FOOTER.closeAr : LEGAL_FOOTER.closeEn}
            className="w-8 h-8 shrink-0 rounded-full bg-surface-sunken border border-line flex items-center justify-center text-fg-muted hover:text-fg active:scale-95 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document body */}
        <div className="p-6 overflow-y-auto space-y-7 text-fg text-xs font-sans leading-relaxed scrollbar-thin">
          {LEGAL_SECTIONS.map((section) => (
            <section key={section.id} className="space-y-2.5">
              <h3 className="font-black text-fg text-xs flex items-center gap-2 pb-1 border-b border-line font-sans">
                <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full shrink-0" />
                <span>
                  {section.icon} {isAr ? section.titleAr : section.titleEn}
                </span>
              </h3>
              <ul className="space-y-2 list-none pl-0">
                {section.lines.map((line, i) => {
                  const tone = line.tone ?? 'default';
                  return (
                    <li key={i} className={`flex items-start gap-1.5 ${TONE_TEXT[tone]}`}>
                      <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${TONE_DOT[tone]}`} />
                      <span className="leading-relaxed">{isAr ? line.ar : line.en}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="text-center text-fg-muted text-[10px] space-y-1 pt-3 border-t border-line/80">
            <p className="font-mono">{isAr ? LEGAL_FOOTER.revisionAr : LEGAL_FOOTER.revisionEn}</p>
            <p className="font-sans font-extrabold text-[#FF6B00]">
              {isAr ? LEGAL_FOOTER.rightsAr : LEGAL_FOOTER.rightsEn}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-surface-sunken p-4 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-[#FF6B00] text-white hover:bg-[#e05e00] font-black py-3 rounded-2xl text-center text-xs transition-all active:scale-95 cursor-pointer shadow-md select-none"
          >
            {isAr ? LEGAL_FOOTER.closeAr : LEGAL_FOOTER.closeEn}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
