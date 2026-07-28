import { validateOpens, type OpensMode } from './opensMode';
import type { DropChannel } from './dropChannel';
import type { ViewingMode } from './viewing';

/**
 * Every text and select value the drop builder holds. Media files live in the
 * component (they are File objects, not serialisable form state).
 */
export interface DropFormValues {
  productName: string;
  startingPrice: string;
  condition: string;
  specsText: string;
  vendorName: string;
  marketPrice: string;
  reservePrice: string;
  viewing: ViewingMode | '';
  viewingPlace: string;
  channel: DropChannel;
  opensMode: OpensMode;
  scheduledLocal: string;
  durationSeconds: number;
  paymentWindowHours: number;
  antiSnipeSec: number;
  autoRelist: boolean;
}

/** Defaults are the ones the previous form shipped with — unchanged. */
export const INITIAL_FORM: DropFormValues = {
  productName: '',
  startingPrice: '',
  condition: 'جديدة كلياً',
  specsText: '',
  vendorName: '',
  marketPrice: '',
  reservePrice: '',
  viewing: '',
  viewingPlace: '',
  channel: 'misc',
  opensMode: 'now',
  scheduledLocal: '',
  durationSeconds: 1800,
  paymentWindowHours: 24,
  antiSnipeSec: 30,
  autoRelist: false,
};

/**
 * "Create another" keeps the ops settings (the admin picked them for this
 * batch and the next lot almost certainly wants the same) and clears the
 * item.
 *
 * `viewing` is the deliberate exception: it is ALWAYS cleared. A carried-over
 * viewing value sits pre-selected on the next form looking like that lot's own
 * claim, and publishes a physical-location statement about a DIFFERENT item —
 * exactly the fabrication utils/viewing.ts exists to prevent. The next drop
 * has to state it deliberately.
 */
export function afterCreateAnother(prev: DropFormValues): DropFormValues {
  return {
    ...INITIAL_FORM,
    condition: prev.condition,
    vendorName: prev.vendorName,
    channel: prev.channel,
    opensMode: prev.opensMode,
    durationSeconds: prev.durationSeconds,
    paymentWindowHours: prev.paymentWindowHours,
    antiSnipeSec: prev.antiSnipeSec,
    autoRelist: prev.autoRelist,
  };
}

/**
 * Returns a field-keyed map of error codes; empty means valid. The required
 * set is unchanged from the previous form (name + starting price) — it is only
 * surfaced per-field now instead of as one combined message. Timing joins it
 * because `scheduled` no longer silently degrades to "open now".
 */
export function validateDropForm(
  v: DropFormValues,
  now: number,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!v.productName.trim()) errors.productName = 'REQUIRED';

  const price = Number(v.startingPrice);
  if (!Number.isFinite(price) || price <= 0) errors.startingPrice = 'REQUIRED';

  const opensError = validateOpens(v.opensMode, v.scheduledLocal, now);
  if (opensError) errors.scheduledLocal = opensError;

  return errors;
}

/**
 * The order the essential fields appear in the form, top to bottom. Declared
 * explicitly rather than read off `Object.keys(errors)[0]`: key order there is
 * an accident of the order validateDropForm happens to assign in, so reordering
 * two `if`s in a validator would silently start scrolling the admin to the
 * second problem instead of the first.
 */
const ERROR_FIELD_ORDER: (keyof DropFormValues)[] = [
  'productName',
  'startingPrice',
  'scheduledLocal',
];

/**
 * The field to scroll to and focus: the FIRST problem in visual order, so the
 * admin starts at the top of the form rather than wherever the validator
 * happened to look first. Returns null for a clean form.
 *
 * A key that isn't in ERROR_FIELD_ORDER still gets returned (after the ordered
 * ones) rather than swallowed — a future error with no id to scroll to should
 * be a visibly missing anchor, not a submit that goes quiet.
 */
export function firstErrorField(errors: Record<string, string>): string | null {
  for (const key of ERROR_FIELD_ORDER) {
    if (errors[key]) return key;
  }
  // Truthiness, not key presence, decides in both halves — an entry whose code
  // is empty is not an error, and the ordered loop above already skips it.
  return Object.keys(errors).find((key) => errors[key]) ?? null;
}

/**
 * Fields whose change invalidates an error keyed under a DIFFERENT name.
 *
 * `opensMode` is the only one today: the timing error is keyed `scheduledLocal`
 * (that is the input it renders under), but the Opens buttons are what decide
 * whether a start time is required at all. Switching to "Now" or "On first bid"
 * unmounts the picker entirely, so without this the error would be cleared by a
 * control the admin can no longer see — and switching BACK would reveal the
 * stale red message again.
 */
const LINKED_ERROR_FIELDS: Partial<Record<keyof DropFormValues, string[]>> = {
  opensMode: ['scheduledLocal'],
};

/**
 * The error map after `key` changed: that field's complaint is dropped, and so
 * is anything it invalidates.
 *
 * Errors are set wholesale by a submit and were only ever recomputed by the
 * next one, so typing a name into an empty Product name field left the red
 * "This field is required" sitting under text that plainly satisfies it. This
 * clears rather than re-validates on purpose: a running validator would light
 * fields up mid-typing (an empty price field is "invalid" after the first
 * backspace), which is a different and worse defect. The submit is still the
 * only thing that ASSERTS validity — validateDropForm runs in full on every
 * Create/Save, so nothing cleared here can slip past it.
 *
 * Returns the SAME object when there was nothing to clear, so a keystroke on a
 * form with no errors cannot cause a re-render.
 */
export function clearErrorsForField(
  errors: Record<string, string>,
  key: keyof DropFormValues,
): Record<string, string> {
  const targets = [key as string, ...(LINKED_ERROR_FIELDS[key] ?? [])];
  if (!targets.some((field) => errors[field])) return errors;
  const next = { ...errors };
  for (const field of targets) delete next[field];
  return next;
}

/**
 * Error code -> the sentence shown under the field. Both languages always: the
 * ops team is mixed and neither is a fallback.
 *
 * Anything that is not PAST reads as "required", which is deliberate — every
 * other code validateDropForm emits (currently only REQUIRED) means the field
 * is empty or unusable, and an unrecognised future code saying "this field is
 * required" is far better than an empty red span saying nothing at all.
 */
export function dropErrorText(code: string | undefined, isAr: boolean): string {
  if (!code) return '';
  if (code === 'PAST') {
    return isAr ? 'وقت البدء يجب أن يكون في المستقبل' : 'Start time must be in the future';
  }
  return isAr ? 'هذا الحقل مطلوب' : 'This field is required';
}
