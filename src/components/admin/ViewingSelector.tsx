import React, { useId } from 'react';
import type { ViewingMode } from '../../utils/viewing';

/**
 * Admin control for per-lot viewing. Shared by the approval card
 * (LaunchSection) and the drop-builder so the two cannot drift.
 *
 * Deliberately OPTIONAL: `value === ''` means "not stated", and a lot approved
 * that way renders no viewing claim at all. Tapping the selected chip clears
 * back to that state — an admin who mis-clicks must be able to un-state it.
 */

const OPTIONS: { id: ViewingMode; ar: string; en: string }[] = [
  { id: 'office', ar: 'بمكاتبنا', en: 'Our office' },
  { id: 'store', ar: 'عند البائع', en: 'Seller store' },
  { id: 'private', ar: 'بدون معاينة', en: 'No viewing' },
];

/**
 * Enough for a shop name plus a street/area line, short enough that the
 * buyer-facing `معاينة عند البائع · {place}` label stays on one or two lines.
 * Same spirit as the 300-char cap on the rejection reason next door.
 *
 * Exported so the render surfaces that clamp this text
 * (DesktopLiveAuctionLayout / MobileAuctionView) can point at the symbol
 * instead of restating the number in a comment that nothing keeps true.
 */
export const PLACE_MAX_LENGTH = 120;

export interface ViewingSelectorProps {
  value: ViewingMode | '';
  onChange: (next: ViewingMode | '') => void;
  place: string;
  onPlaceChange: (next: string) => void;
  isAr: boolean;
  /** Selected-chip classes — the two admin surfaces use different accents. */
  accentClass?: string;
  /**
   * Focus classes for the store-place input. Paired with `accentClass`: a
   * consumer that passes its own accent must be able to match the focus ring
   * too, otherwise the control shows two different accents at once.
   */
  focusClass?: string;
}

export const ViewingSelector: React.FC<ViewingSelectorProps> = ({
  value,
  onChange,
  place,
  onPlaceChange,
  isAr,
  accentClass = 'bg-emerald-600 text-white border-emerald-600',
  focusClass = 'focus:border-emerald-500',
}) => {
  // Unique per instance: the approval list renders one selector per pending
  // card, so a hardcoded id would be duplicated across the page.
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[10px] font-bold text-fg-muted uppercase">
        {isAr ? 'المعاينة (اختياري)' : 'Viewing (optional)'}
        {/* Toggle-to-clear is the mis-click escape hatch and the way back to the
            load-bearing "not stated" default; nothing else on screen says so. */}
        {value && (
          <span className="font-medium normal-case">
            {isAr ? ' · اضغط مرة أخرى للإلغاء' : ' · tap again to clear'}
          </span>
        )}
      </span>
      <div className="flex gap-1.5" role="group" aria-labelledby={labelId}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-pressed={value === opt.id}
            onClick={() => onChange(value === opt.id ? '' : opt.id)}
            className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-all ${
              value === opt.id
                ? accentClass
                : 'bg-surface-raised text-fg-muted border-line hover:bg-surface-sunken'
            }`}
          >
            {isAr ? opt.ar : opt.en}
          </button>
        ))}
      </div>
      {value === 'store' && (
        <input
          type="text"
          value={place}
          onChange={(e) => onPlaceChange(e.target.value)}
          placeholder={isAr ? 'اسم المحل والموقع' : 'Store name and location'}
          // The place is rendered inline into the buyer-facing viewing label, so
          // an unbounded paste would blow out that line on the auction page.
          maxLength={PLACE_MAX_LENGTH}
          className={`w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-line outline-none ${focusClass}`}
        />
      )}
    </div>
  );
};
