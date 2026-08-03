import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Loader2, Info } from 'lucide-react';
import { BidConfirm, WinningPill, FirstBidCoach, Pressable } from '../feedback';
import { totalWithPremium } from '../../utils/bidMath';
import { validateCustomBid } from '../../utils/auctionBid';

/* ======================================================================
   BidSheet — the mobile Place-Bid bottom sheet (mockup frame 2).

   Presentational + local input state ONLY. All money/gate/confirm logic
   lives in the parent's useBidFlow(onBidExecute): the sheet just STAGES an
   amount (`onStage` = startBid) and renders the shared BidConfirm overlay
   against the parent's `pendingBid`. No bespoke confirm copy, no optimistic
   price layer, no new bid route — a bid can still only ever go through
   onBidExecute, identical to today.

   Two ways to stage:
     - a quick-step chip (minNext, minNext+inc, minNext+2·inc) — instant
     - the "enter amount" field, validated by validateCustomBid, then Confirm
   ====================================================================== */

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

interface BidSheetProps {
  open: boolean;
  onClose: () => void;
  isAr: boolean;
  reduce: boolean;
  currentPrice: number;
  minNext: number;
  inc: number;
  submitting: boolean;
  /** Stage an amount through the shared gate (parent's startBid). */
  onStage: (amount: number) => void;
  /** Shared confirm surface, driven by the parent's useBidFlow. */
  pendingBid: number | null;
  priceMoved: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
  /** First-bid coach gate (active member who has never bid). */
  showCoach: boolean;
  /** Pop the "you're winning" pill over the sheet on a successful bid. */
  showWinPill: boolean;
  /** E4 — open the Auction Rules modal from the subtle "Rules" affordance. */
  onOpenRules?: () => void;
}

export const BidSheet: React.FC<BidSheetProps> = ({
  open,
  onClose,
  isAr,
  reduce,
  currentPrice,
  minNext,
  inc,
  submitting,
  onStage,
  pendingBid,
  priceMoved,
  onConfirm,
  onCancel,
  showCoach,
  showWinPill,
  onOpenRules,
}) => {
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<'too_low' | 'invalid' | null>(null);

  // Reset the custom field each time the sheet opens so it never reopens with a
  // stale amount from a previous bid.
  useEffect(() => {
    if (open) {
      setCustomValue('');
      setCustomError(null);
    }
  }, [open]);

  // Quick-step chips: minNext, minNext+inc, minNext+2·inc.
  const chips = useMemo(
    () => [minNext, minNext + inc, minNext + 2 * inc],
    [minNext, inc]
  );

  // The amount whose premium/confirm the sheet reflects: a valid custom entry
  // if typed, otherwise the minimum next bid.
  const parsedCustom = customValue.trim() === '' ? NaN : Number(customValue);
  const customIsValid =
    customValue.trim() !== '' && validateCustomBid(parsedCustom, minNext).ok;
  const chosen = customIsValid ? parsedCustom : minNext;

  const stageCustom = () => {
    if (submitting) return;
    // Empty/untouched field: the CTA shows `chosen` (= minNext), so tapping it
    // must stage that default min-next amount — never run validateCustomBid('')
    // (which coerces to 0 → "invalid" and dead-ends the primary CTA).
    if (customValue.trim() === '') {
      setCustomError(null);
      onStage(minNext);
      return;
    }
    const result = validateCustomBid(Number(customValue), minNext);
    if (result.ok === false) {
      setCustomError(result.reason);
      return;
    }
    setCustomError(null);
    onStage(result.amount);
  };

  const errorText =
    customError === 'too_low'
      ? isAr
        ? `الحد الأدنى ${fmt(minNext)} د.أ`
        : `Minimum bid is ${fmt(minNext)} JOD`
      : customError === 'invalid'
        ? isAr
          ? 'أدخل مبلغاً صحيحاً'
          : 'Enter a valid amount'
        : null;

  const enter = reduce ? { y: 0 } : { y: 0 };
  const from = reduce ? { y: 0, opacity: 1 } : { y: '100%', opacity: 1 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={onClose}
          dir={isAr ? 'rtl' : 'ltr'}
          id="mobile-bid-sheet"
        >
          <motion.div
            className="relative bg-surface-raised text-fg font-alexandria rounded-t-[26px] px-4 pt-[18px] pb-5 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
            initial={from}
            animate={enter}
            exit={from}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab handle + close */}
            <div className="w-[38px] h-1 rounded-full bg-[#ddd] mx-auto mb-3.5" />
            <button
              type="button"
              onClick={onClose}
              aria-label={isAr ? 'إغلاق' : 'Close'}
              className="absolute top-3 w-8 h-8 rounded-full bg-surface flex items-center justify-center text-fg-muted active:scale-95 transition-transform cursor-pointer"
              style={{ insetInlineEnd: '12px' }}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-black text-fg">
                {isAr ? 'قدّم مزايدتك' : 'Place your bid'}
              </h3>
              {onOpenRules && (
                <button
                  type="button"
                  onClick={onOpenRules}
                  className="flex items-center gap-1 text-[11px] font-bold text-fg-muted hover:text-[#F05123] transition-colors cursor-pointer shrink-0"
                  id="bidsheet-rules-link"
                >
                  <Info className="w-3.5 h-3.5" />
                  {isAr ? 'القواعد' : 'Rules'}
                </button>
              )}
            </div>
            <p className="text-[12px] text-fg-muted font-semibold mt-0.5" dir="ltr">
              {isAr
                ? `المزايدة الحالية ${fmt(currentPrice)} د.أ · الحد الأدنى التالي ${fmt(minNext)} د.أ`
                : `Current bid ${fmt(currentPrice)} JOD · min next ${fmt(minNext)} JOD`}
            </p>

            {/* Quick-step chips — instant stage through the shared gate. */}
            <div className="flex gap-2 mt-3.5">
              {chips.map((amount, i) => {
                const raise = amount - currentPrice; // increment over the current bid
                return (
                  <button
                    key={amount}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setCustomValue('');
                      setCustomError(null);
                      onStage(amount);
                    }}
                    className={`flex-1 text-center py-3 px-1.5 rounded-[13px] border-[1.5px] font-extrabold text-[13px] transition-colors active:scale-95 cursor-pointer disabled:opacity-50 ${
                      i === 0
                        ? 'border-[#F05123] bg-[#F05123]/[0.06] text-[#F05123]'
                        : 'border-line text-fg'
                    }`}
                  >
                    <small
                      className={`block text-[9.5px] font-bold mb-0.5 ${
                        i === 0 ? 'text-[#F05123]' : 'text-fg-muted'
                      }`}
                      dir="ltr"
                    >
                      +{fmt(raise)}
                    </small>
                    <span dir="ltr">{fmt(amount)}</span>
                  </button>
                );
              })}
            </div>

            {/* Or enter a custom amount — validated by validateCustomBid. */}
            <div
              className={`flex items-center justify-between mt-3 border-[1.5px] rounded-[13px] px-3.5 py-2.5 ${
                customError ? 'border-[#F04438]' : 'border-line'
              }`}
            >
              <span className="text-[12px] text-fg-muted font-bold">
                {isAr ? 'أو أدخل مبلغاً' : 'Or enter amount'}
              </span>
              <div className="flex items-baseline gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  value={customValue}
                  min={minNext}
                  disabled={submitting}
                  onChange={(e) => {
                    setCustomValue(e.target.value);
                    if (customError) setCustomError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') stageCustom();
                  }}
                  placeholder={fmt(minNext)}
                  className="w-[92px] text-end bg-transparent outline-none text-[20px] font-black text-fg tabular-nums placeholder-[#ccc]"
                />
                <span className="text-[12px] text-fg-muted font-bold">
                  {isAr ? 'د.أ' : 'JOD'}
                </span>
              </div>
            </div>
            {errorText && (
              <p className="text-[11px] font-bold text-[#F04438] mt-1.5" dir={isAr ? 'rtl' : 'ltr'}>
                {errorText}
              </p>
            )}

            {/* Premium total for the chosen amount (5% buyer's premium). */}
            <p className="text-center text-[11px] text-fg-muted font-semibold my-3" dir={isAr ? 'rtl' : 'ltr'}>
              {isAr
                ? `المجموع عند الفوز: ${fmt(totalWithPremium(chosen))} د.أ (شامل عمولة المشتري ٥٪)`
                : `Total if you win: ${fmt(totalWithPremium(chosen))} JOD (incl. 5% buyer's premium)`}
            </p>

            {/* Confirm button — stages the chosen (custom-or-min) amount. */}
            <Pressable
              disabled={submitting}
              onClick={stageCustom}
              className="w-full py-3.5 rounded-2xl bg-[#F05123] text-white font-black text-[15px] flex items-center justify-center gap-2 shadow-[0_10px_24px_rgba(240,81,35,0.32)] disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {isAr ? 'تأكيد المزايدة' : 'Confirm bid'}
              </span>
              <small className="font-bold opacity-85 text-[12px]" dir="ltr">
                · {fmt(chosen)} {isAr ? 'د.أ' : 'JOD'}
              </small>
            </Pressable>

            {/* First-bid coach for an active member who has never bid. */}
            <div className="mt-3">
              <FirstBidCoach show={showCoach && pendingBid == null} isAr={isAr} />
            </div>

            {/* Shared confirm overlay (no bespoke copy) — anchored over the sheet. */}
            <BidConfirm
              amount={pendingBid}
              isAr={isAr}
              priceMoved={priceMoved}
              onConfirm={onConfirm}
              onCancel={onCancel}
            />

            {/* "You're winning" pill on a successful bid. */}
            <WinningPill show={showWinPill} isAr={isAr} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BidSheet;
