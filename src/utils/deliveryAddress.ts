/**
 * Wave 2 (W4) — per-order delivery address + phone collected at the post-win
 * payment step. Kept as a pure, dependency-light util so the validation is
 * unit-tested (node env) and reused by the OrderDetailsView pay flow.
 *
 * The governorate reuses the canonical 12-governorate list (jordanCities.ts),
 * consistent with ProfileCompletionModal. The phone reuses the same E.164
 * Jordan normalizer as login (phoneNumber.ts), with Arabic-Indic digits mapped
 * to ASCII first so a buyer who types ٠٧٩… is not silently rejected.
 */
import { isValidCityId } from './jordanCities';
import { toE164Jordan } from './phoneNumber';

export interface DeliveryAddress {
  /** Canonical governorate id from JORDAN_GOVERNORATES. */
  governorate: string;
  /** Area / neighbourhood / street line (required). */
  area: string;
  /** Building / floor / apartment (optional). */
  building?: string;
  /** Extra delivery notes / landmark (optional). */
  notes?: string;
}

export interface DeliveryValidationResult {
  valid: boolean;
  errors: {
    governorate?: boolean;
    area?: boolean;
    phone?: boolean;
  };
  /** E.164 phone when valid, else null. */
  normalizedPhone: string | null;
}

/** Map Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII 0-9. */
export function normalizeDigits(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return String(code - 0x06f0);
  });
}

/**
 * Validate a per-order delivery address + phone.
 * Required: governorate (from the canonical list), area, a valid JO mobile.
 * Optional: building, notes.
 */
export function validateDeliveryAddress(
  addr: Partial<DeliveryAddress> | null | undefined,
  phone: string | null | undefined
): DeliveryValidationResult {
  const errors: DeliveryValidationResult['errors'] = {};

  const governorate = addr?.governorate;
  if (!isValidCityId(governorate)) errors.governorate = true;

  const area = typeof addr?.area === 'string' ? addr.area.trim() : '';
  if (!area) errors.area = true;

  const normalizedPhone = toE164Jordan(normalizeDigits(phone ?? ''));
  if (!normalizedPhone) errors.phone = true;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalizedPhone,
  };
}

/**
 * Trim all fields and drop empty optionals so the persisted order doc only
 * carries meaningful values (no stray empty `building`/`notes`).
 * Callers should validate first — this does not enforce required fields.
 */
export function sanitizeDeliveryAddress(addr: DeliveryAddress): DeliveryAddress {
  const out: DeliveryAddress = {
    governorate: addr.governorate,
    area: (addr.area ?? '').trim(),
  };
  const building = (addr.building ?? '').trim();
  const notes = (addr.notes ?? '').trim();
  if (building) out.building = building;
  if (notes) out.notes = notes;
  return out;
}
