import React, { useState } from 'react';
import { ViewingSelector } from './ViewingSelector';
import { formatNumeral } from '../../utils/arabicNumerals';
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

/**
 * U+2068 FIRST STRONG ISOLATE / U+2069 POP DIRECTIONAL ISOLATE.
 *
 * The summary is one line of mixed content, and two of its parts are free text
 * the admin typed. The default condition is the Arabic 'جديدة كلياً' (deliberate
 * — it is buyer-facing and publishes in the caption), so on the English line the
 * bidi algorithm treated it as an RTL run and dragged the neutral/numeric text
 * either side of it into its own order: the shipped line read
 * "30 · جديدة كلياً min · pay within 24h · …" — "30" and "min" split around it.
 *
 * Wrapping the value in FSI…PDI makes it an independent run whose direction is
 * decided by its own first strong character and which counts as a single
 * neutral object to the text around it, so it cannot reorder its neighbours in
 * either direction. Unicode isolates rather than a CSS `unicode-bidi: isolate`
 * span because this function returns a STRING — the drawer renders it as one
 * text node and the unit tests assert on it — so a span would mean changing the
 * signature and the whole test surface with it, to buy the same behaviour.
 *
 * Applied only to values the admin typed. Every other part is one of our own
 * localised literals, which by construction matches the direction of the line
 * it is on.
 */
// Written as escapes on purpose: both characters are invisible, and a literal
// pair in the source is impossible to review or to spot when one goes missing.
const FSI = '\u2068';
const PDI = '\u2069';
const isolate = (value: string) => `${FSI}${value}${PDI}`;

export function summarizeSettings(v: DropFormValues, isAr: boolean): string {
  const parts: string[] = [];
  // Every number on this line goes through the one formatter. It used to
  // hardcode '٢٤' for the default payment window while the duration and the
  // anti-snipe window either side of it interpolated Western digits, so the
  // shipped default read "… 30 دقيقة · مهلة الدفع ٢٤ ساعة · حماية من القنص 30 ثانية".
  const num = (value: number) => formatNumeral(value, isAr);

  // The condition the admin typed, isolated. The "not set" fallback is our own
  // literal in the line's own language, so it needs no fence.
  const condition = v.condition.trim();
  parts.push(condition ? isolate(condition) : (isAr ? 'الحالة غير محددة' : 'condition not set'));
  const minutes = num(Math.round(v.durationSeconds / 60));
  parts.push(isAr ? `${minutes} دقيقة` : `${minutes} min`);
  parts.push(isAr ? `مهلة الدفع ${num(v.paymentWindowHours)} ساعة` : `pay within ${num(v.paymentWindowHours)}h`);
  parts.push(isAr ? `حماية من القنص ${num(v.antiSnipeSec)} ثانية` : `anti-snipe ${num(v.antiSnipeSec)}s`);

  const reserve = Number(v.reservePrice);
  parts.push(
    reserve > 0
      ? (isAr ? `سعر احتياطي ${num(reserve)} دينار` : `reserve ${num(reserve)} JOD`)
      : (isAr ? 'بدون سعر احتياطي' : 'no reserve'),
  );

  parts.push(
    v.viewing
      ? (isAr ? VIEWING_SUMMARY[v.viewing].ar : VIEWING_SUMMARY[v.viewing].en)
      : (isAr ? 'المعاينة غير محددة' : 'viewing not stated'),
  );

  if (v.autoRelist) parts.push(isAr ? 'إعادة إدراج تلقائية' : 'auto-relist');
  // Vendor is free text too, and it is the mirror case: a Latin name on the
  // Arabic line. Same fence, same reason.
  const vendor = v.vendorName.trim();
  if (vendor) parts.push(`${isAr ? 'المورّد' : 'vendor'} ${isolate(vendor)}`);

  return parts.join(' · ');
}

export interface MoreSettingsDrawerProps {
  isAr: boolean;
  values: DropFormValues;
  onChange: <K extends keyof DropFormValues>(key: K, value: DropFormValues[K]) => void;
}

const label = 'block text-sm font-bold text-fg';
const field =
  'mt-1 w-full border border-line rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#FF6B00]';

export const MoreSettingsDrawer: React.FC<MoreSettingsDrawerProps> = ({
  isAr,
  values,
  onChange,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-surface-raised border border-line rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-start px-4 py-3 hover:bg-surface-sunken transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-black text-fg">
          {/* A VERTICAL disclosure pair, not a rotated ▸. CSS `rotate-90` is a
              geometric transform: it is not mirrored by `direction: rtl`, so
              the collapsed arrow pointed rightwards — into the Arabic text it
              was labelling — instead of away from it. ▾/▴ point along the
              vertical axis, which RTL does not flip, so the same two glyphs
              read correctly in both languages with no direction-aware CSS at
              all. aria-hidden because `aria-expanded` on the button already
              says open/closed to assistive tech. */}
          <span aria-hidden="true" className="text-[10px] leading-none">{open ? '▴' : '▾'}</span>
          {isAr ? 'إعدادات إضافية' : 'More settings'}
        </span>
        <span className="block mt-1 text-[11px] text-fg-muted leading-relaxed">
          {summarizeSettings(values, isAr)}
        </span>
      </button>

      {open && (
        <div className="border-t border-line p-4 space-y-4">
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
            <span className="mt-1 block text-[11px] text-fg-muted">
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
            <span className="mt-1 block text-[11px] text-fg-muted">
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
            <span className="mt-1 block text-[11px] text-fg-muted">
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
            <span className="mt-1 block text-[11px] text-fg-muted">
              {isAr
                ? 'المزايدات في الثواني الأخيرة تُمدّد الوقت. الافتراضي 30 ثانية.'
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
            <span className="font-bold text-fg">
              {isAr ? 'إعادة الإدراج تلقائياً إن لم يُبع (حتى مرتين)' : 'Auto-relist if unsold (up to 2×)'}
              <span className="mt-0.5 block text-[11px] font-normal text-fg-muted">
                {isAr
                  ? 'يُعاد إدراج المنتج تلقائياً بعد 24 ساعة إن انتهى دون بيع.'
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
