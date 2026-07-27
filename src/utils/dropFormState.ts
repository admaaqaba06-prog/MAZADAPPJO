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
