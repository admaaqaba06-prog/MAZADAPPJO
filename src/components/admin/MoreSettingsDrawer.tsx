import React, { useState } from 'react';
import { ViewingSelector } from './ViewingSelector';
import type { DropFormValues } from '../../utils/dropFormState';
import type { ViewingMode } from '../../utils/viewing';

/**
 * The ten set-and-forget fields, folded away.
 *
 * Nothing is removed — the summary line renders the current values whether the
 * drawer is open or shut, so an admin who never opens it can still see what
 * their drop will ship with. That is the whole point: the previous form gave
 * all fifteen fields equal weight when only five change between drops.
 *
 * `condition` leads the summary deliberately. It is the one folded field that
 * is BUYER-facing and is also kept across a "create another" (unlike the
 * internal-only vendorName), so a stale "جديدة كلياً" could otherwise ride onto
 * a used lot without anyone re-confirming it. First position, always rendered.
 */

const PAYMENT_WINDOW_PRESETS = [
  { hours: 12, label: '12 ساعة', en: '12 hours' },
  { hours: 24, label: '24 ساعة', en: '24 hours' },
  { hours: 48, label: '48 ساعة', en: '48 hours' },
  { hours: 72, label: '72 ساعة', en: '72 hours' },
];

const ANTI_SNIPE_PRESETS = [
  { sec: 15, label: '15 ثانية', en: '15s' },
  { sec: 30, label: '30 ثانية', en: '30s' },
  { sec: 60, label: '60 ثانية', en: '60s' },
];

const VIEWING_SUMMARY: Record<ViewingMode, { en: string; ar: string }> = {
  office: { en: 'viewing at our office', ar: 'معاينة بمكاتبنا' },
  store: { en: 'viewing at the seller', ar: 'معاينة عند البائع' },
  private: { en: 'no viewing', ar: 'بدون معاينة' },
};

export function summarizeSettings(v: DropFormValues, isAr: boolean): string {
  const parts: string[] = [];

  parts.push(v.condition.trim() || (isAr ? 'الحالة غير محددة' : 'condition not set'));
  parts.push(isAr ? `${Math.round(v.durationSeconds / 60)} دقيقة` : `${Math.round(v.durationSeconds / 60)} min`);
  parts.push(isAr ? `مهلة الدفع ${v.paymentWindowHours === 24 ? '٢٤' : v.paymentWindowHours} ساعة` : `pay within ${v.paymentWindowHours}h`);
  parts.push(isAr ? `حماية من القنص ${v.antiSnipeSec} ثانية` : `anti-snipe ${v.antiSnipeSec}s`);

  const reserve = Number(v.reservePrice);
  parts.push(
    reserve > 0
      ? (isAr ? `سعر احتياطي ${reserve} دينار` : `reserve ${reserve} JOD`)
      : (isAr ? 'بدون سعر احتياطي' : 'no reserve'),
  );

  parts.push(
    v.viewing
      ? (isAr ? VIEWING_SUMMARY[v.viewing].ar : VIEWING_SUMMARY[v.viewing].en)
      : (isAr ? 'المعاينة غير محددة' : 'viewing not stated'),
  );

  if (v.autoRelist) parts.push(isAr ? 'إعادة إدراج تلقائية' : 'auto-relist');
  if (v.vendorName.trim()) parts.push(`${isAr ? 'المورّد' : 'vendor'} ${v.vendorName.trim()}`);

  return parts.join(' · ');
}

export interface MoreSettingsDrawerProps {
  isAr: boolean;
  values: DropFormValues;
  onChange: <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) => void;
}

const label = 'block text-sm font-bold text-gray-800';
const field =
  'mt-1 w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';

export const MoreSettingsDrawer: React.FC<MoreSettingsDrawerProps> = ({
  isAr,
  values,
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-start px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-black text-gray-900">
          <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          {isAr ? 'إعدادات إضافية' : 'More settings'}
        </span>
        <span className="block mt-1 text-[11px] text-gray-400 leading-relaxed">
          {summarizeSettings(values, isAr)}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <label className={label}>
            {isAr ? 'الحالة' : 'Condition'}
            <input
              className={field}
              value={values.condition}
              onChange={(e) => onChange('condition', e.target.value)}
            />
          </label>

          <label className={label}>
            {isAr ? 'المواصفات (سطر لكل مواصفة)' : 'Specs (one per line)'}
            <textarea
              className={`${field} h-28`}
              value={values.specsText}
              onChange={(e) => onChange('specsText', e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr ? 'تظهر في نص المنشور فقط' : 'Appears in the post caption only'}
            </span>
          </label>

          <label className={label}>
            {isAr ? 'المورّد (داخلي)' : 'Vendor (internal)'}
            <input
              className={field}
              value={values.vendorName}
              onChange={(e) => onChange('vendorName', e.target.value)}
              placeholder={isAr ? 'اختياري — لا يظهر للمشترين' : 'Optional — never shown to buyers'}
            />
          </label>

          <label className={label}>
            {isAr ? 'سعر السوق (اختياري)' : 'Market price (optional)'}
            <input
              type="number"
              className={field}
              value={values.marketPrice}
              onChange={(e) => onChange('marketPrice', e.target.value)}
            />
          </label>

          <label className={label}>
            {isAr ? 'السعر الاحتياطي (مخفي عن المزايدين)' : 'Reserve price (hidden from bidders)'}
            <input
              type="number"
              className={field}
              value={values.reservePrice}
              onChange={(e) => onChange('reservePrice', e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr ? 'لن يُباع المنتج إذا لم تصل المزايدة لهذا السعر' : "Item won't sell if bidding doesn't reach this"}
            </span>
          </label>

          <ViewingSelector
            value={values.viewing}
            onChange={(next) => onChange('viewing', next)}
            place={values.viewingPlace}
            onPlaceChange={(next) => onChange('viewingPlace', next)}
            isAr={isAr}
            accentClass="bg-[#F05123] text-white border-[#F05123]"
            focusClass="focus:border-[#F05123]"
          />

          <label className={label}>
            {isAr ? 'مهلة الدفع' : 'Payment window'}
            <select
              className={field}
              value={values.paymentWindowHours}
              onChange={(e) => onChange('paymentWindowHours', Number(e.target.value))}
            >
              {PAYMENT_WINDOW_PRESETS.map((p) => (
                <option key={p.hours} value={p.hours}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr
                ? 'الوقت المتاح للفائز للدفع قبل تقييد الحساب. الافتراضي 24 ساعة.'
                : 'Time the winner has to pay before their account is restricted. Default 24h.'}
            </span>
          </label>

          <label className={label}>
            {isAr ? 'الحماية من القنص' : 'Anti-snipe'}
            <select
              className={field}
              value={values.antiSnipeSec}
              onChange={(e) => onChange('antiSnipeSec', Number(e.target.value))}
            >
              {ANTI_SNIPE_PRESETS.map((p) => (
                <option key={p.sec} value={p.sec}>{isAr ? p.label : p.en}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-gray-400">
              {isAr
                ? 'المزايدات في الثواني الأخيرة تُمدّد الوقت. الافتراضي ٣٠ ثانية.'
                : 'Bids in the final seconds extend the clock. Default 30s.'}
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.autoRelist}
              onChange={(e) => onChange('autoRelist', e.target.checked)}
            />
            <span className="font-bold text-gray-800">
              {isAr ? 'إعادة الإدراج تلقائياً إن لم يُبع (حتى مرتين)' : 'Auto-relist if unsold (up to 2×)'}
              <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                {isAr
                  ? 'يُعاد إدراج المنتج تلقائياً بعد ٢٤ ساعة إن انتهى دون بيع.'
                  : 'The item is automatically relisted 24h after it ends unsold.'}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
};

export default MoreSettingsDrawer;
