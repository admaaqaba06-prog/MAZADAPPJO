/**
 * The delivery details an admin hands to a courier.
 *
 * WHY THIS FILE EXISTS. The admin drops card filled its gaps with invented
 * values: an absent phone rendered as `+962 7 9888 1234`, an absent email as
 * `winner@example.com`, and an absent city as `Amman` — each of them only when
 * `currentBidderId` existed, which made them look like resolved data rather
 * than placeholders. The phone was additionally wrapped in a `tel:` link, so an
 * admin could tap it and dial a number belonging to nobody, and the city was
 * pasted into a "dispatch confirmed" message.
 *
 * A real parcel could be sent to an invented address on the strength of that.
 *
 * The rule here is the opposite: a field that is not known comes back `null`,
 * and the caller must render the absence. Nothing is substituted, ever.
 */

export interface CourierContactInput {
  name?: unknown;
  phoneNumber?: unknown;
  phone?: unknown;
  transferPhone?: unknown;
  email?: unknown;
  city?: unknown;
}

export interface CourierContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  /** Everything a courier actually needs: someone to call, and where to go. */
  isDispatchable: boolean;
  /** Field keys that are missing, for a precise warning rather than a vague one. */
  missing: Array<'name' | 'phone' | 'city'>;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
};

/**
 * Resolve the winner's contact details, or report them missing.
 *
 * `user` is the user document when one was found, and null/undefined when it was
 * not — a missing document is a real state (a deleted account, a uid that never
 * had one) and must not be papered over.
 *
 * `fallbackName` is the masked bidder label carried on the auction. It is
 * accepted for the NAME only: it is a display string, and a courier can work
 * with an imperfect name but not with an imagined phone number.
 *
 * `transferPhone` (the CliQ number) is accepted as a phone of last resort
 * because it is a real number the buyer supplied for money — unlike the
 * constant it replaces.
 */
export function resolveCourierContact(
  user: CourierContactInput | null | undefined,
  fallbackName?: unknown,
): CourierContact {
  const name = clean(user?.name) ?? clean(fallbackName);
  const phone = clean(user?.phoneNumber) ?? clean(user?.phone) ?? clean(user?.transferPhone);
  const email = clean(user?.email);
  const city = clean(user?.city);

  const missing: CourierContact['missing'] = [];
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');
  if (!city) missing.push('city');

  return {
    name,
    phone,
    email,
    city,
    // Email is deliberately NOT required: couriers in Jordan work from a phone
    // and an address. Demanding it would block dispatches that can genuinely
    // proceed, which is its own kind of wrong.
    isDispatchable: missing.length === 0,
    missing,
  };
}

/**
 * The plain-text block an admin copies to send to the courier.
 *
 * Returns null when the contact is not dispatchable, so the caller cannot
 * announce a successful copy of something incomplete — the button that used to
 * claim «تم نسخ معلومات الفائز» did not copy anything at all.
 */
export function formatCourierBlock(
  contact: CourierContact,
  lot: { title?: unknown; auctionNumber?: unknown },
): string | null {
  if (!contact.isDispatchable) return null;
  const lines = [
    clean(lot.title) ? `الصنف: ${clean(lot.title)}` : null,
    lot.auctionNumber != null ? `رقم المزاد: ${lot.auctionNumber}` : null,
    `الاسم: ${contact.name}`,
    `الهاتف: ${contact.phone}`,
    contact.email ? `البريد: ${contact.email}` : null,
    `المدينة: ${contact.city}`,
  ].filter(Boolean);
  return lines.join('\n');
}
