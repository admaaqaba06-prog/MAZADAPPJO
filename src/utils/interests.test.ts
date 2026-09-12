import { describe, it, expect } from 'vitest';
import {
  needsInterestsOnboarding,
  interestCategoriesFrom,
  sanitizeSelection,
  canContinue,
  SEED_CATEGORIES,
  DEFAULT_NOTIFY_PREFS,
  UNAUTHENTICATED_ID,
} from './interests';
import { CATEGORIES } from './categories';

describe('interests gate', () => {
  it('sends a brand-new user through the screen', () => {
    expect(needsInterestsOnboarding({})).toBe(true);
    expect(needsInterestsOnboarding({ interests: undefined })).toBe(true);
    expect(needsInterestsOnboarding({ interests: [] })).toBe(true);
  });

  it('never blocks a returning user who already saved interests', () => {
    expect(needsInterestsOnboarding({ interests: ['Vehicles'] })).toBe(false);
    expect(needsInterestsOnboarding({ interests: ['Vehicles', 'Phones'] })).toBe(false);
  });

  it('treats a skip as answered, not as never-asked', () => {
    // The skip writes `interests: []`, which on its own is identical to a user
    // who was never asked. Without the second flag every skipper gets the
    // screen again on their next login, which is the nag the flag exists to
    // prevent.
    expect(needsInterestsOnboarding({ interests: [], interestsSkipped: true })).toBe(false);
  });

  it('ignores junk that would otherwise read as a real selection', () => {
    // An array of empty strings is not a selection. This matters because the
    // digest intersects on these ids: a user whose interests are [''] would be
    // counted as opted-in and then match no auction, forever silently.
    expect(needsInterestsOnboarding({ interests: ['', '  '] })).toBe(true);
    expect(needsInterestsOnboarding({ interests: 'Vehicles' as unknown })).toBe(true);
  });

  it('does not fire for a signed-out visitor', () => {
    expect(needsInterestsOnboarding(null)).toBe(false);
    expect(needsInterestsOnboarding(undefined)).toBe(false);
  });

  it('does not fire for the signed-out SENTINEL, which is an object', () => {
    // AppContext models a guest as { id: 'unauthenticated', ... }, not null.
    // Without this the null check above passes straight over them and every
    // guest reads as a brand-new signup owing us their interests — which in
    // the app rewrote the URL to /onboarding/interests for the entire
    // guest-browsing audience.
    expect(needsInterestsOnboarding({ id: UNAUTHENTICATED_ID })).toBe(false);
    expect(needsInterestsOnboarding({ id: UNAUTHENTICATED_ID, interests: [] })).toBe(false);
  });
});

describe('category list', () => {
  it('keys every seed category by the value auctions actually store', () => {
    // The load-bearing assertion for CR-02. `users/{uid}.interests` holds these
    // ids and the digest intersects them against `auctions/{id}.category`. If
    // the ids ever drift from the taxonomy, the intersection is empty and the
    // nightly send goes out to nobody without throwing a single error.
    expect(SEED_CATEGORIES.map(c => c.id)).toEqual(CATEGORIES.map(c => c.value));
  });

  it('sorts by order, then id, so equal orders cannot swap between renders', () => {
    const out = interestCategoriesFrom([
      { id: 'b', nameAr: 'ب', nameEn: 'B', icon: 'X', order: 20, active: true },
      { id: 'a', nameAr: 'أ', nameEn: 'A', icon: 'X', order: 10, active: true },
      { id: 'c', nameAr: 'ج', nameEn: 'C', icon: 'X', order: 10, active: true },
    ]);
    expect(out.map(c => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('drops inactive categories', () => {
    const out = interestCategoriesFrom([
      { id: 'a', nameAr: 'أ', nameEn: 'A', icon: 'X', order: 1, active: true },
      { id: 'b', nameAr: 'ب', nameEn: 'B', icon: 'X', order: 2, active: false },
    ]);
    expect(out.map(c => c.id)).toEqual(['a']);
  });

  it('falls back to the taxonomy rather than rendering an empty grid', () => {
    // Continue is disabled until at least one card is picked, so an empty grid
    // is a locked-out new user, not a cosmetic bug.
    expect(interestCategoriesFrom([]).length).toBe(SEED_CATEGORIES.length);
    expect(interestCategoriesFrom(null).length).toBe(SEED_CATEGORIES.length);
    expect(interestCategoriesFrom([{ nameEn: 'no id' }]).length).toBe(SEED_CATEGORIES.length);
  });

  it('renders a server-added category it has no local knowledge of', () => {
    // The whole point of reading the collection: a new category must appear
    // without a deploy, including one this build has never heard of.
    const out = interestCategoriesFrom([
      { id: 'Jewellery', nameAr: 'مجوهرات', nameEn: 'Jewellery', icon: 'Gem', order: 5, active: true },
    ]);
    expect(out.map(c => c.id)).toEqual(['Jewellery']);
  });

  it('never renders a nameless card', () => {
    const out = interestCategoriesFrom([{ id: 'Odd', order: 1, active: true }]);
    expect(out[0].nameAr).toBe('Odd');
    expect(out[0].nameEn).toBe('Odd');
    expect(out[0].icon).toBe('Package');
  });
});

describe('selection', () => {
  it('requires at least one pick', () => {
    expect(canContinue([])).toBe(false);
    expect(canContinue(['Vehicles'])).toBe(true);
  });

  it('drops ids that are no longer offered, and de-duplicates', () => {
    // A category deactivated while the screen was open must not be saved.
    const out = sanitizeSelection(['Vehicles', 'Vehicles', 'Ghost'], [...SEED_CATEGORIES]);
    expect(out).toEqual(['Vehicles']);
  });
});

describe('notification defaults', () => {
  it('ships the consent toggle ON, on WhatsApp, for both digests', () => {
    expect(DEFAULT_NOTIFY_PREFS).toEqual({
      notifyDaily: true,
      notifyFeatured: true,
      notifyChannel: 'whatsapp',
    });
  });
});
