import React from 'react';
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

export interface ViewingSelectorProps {
  value: ViewingMode | '';
  onChange: (next: ViewingMode | '') => void;
  place: string;
  onPlaceChange: (next: string) => void;
  isAr: boolean;
  /** Selected-chip classes — the two admin surfaces use different accents. */
  accentClass?: string;
}

export const ViewingSelector: React.FC<ViewingSelectorProps> = ({
  value,
  onChange,
  place,
  onPlaceChange,
  isAr,
  accentClass = 'bg-emerald-600 text-white border-emerald-600',
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] font-bold text-gray-400 uppercase">
      {isAr ? 'المعاينة (اختياري)' : 'Viewing (optional)'}
    </span>
    <div className="flex gap-1.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? '' : opt.id)}
          className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-all ${
            value === opt.id
              ? accentClass
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
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
        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-500"
      />
    )}
  </div>
);
