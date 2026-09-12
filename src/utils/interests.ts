// Interest capture (CR-01) — pure, SSR-safe helpers.
//
// WHY THE CATEGORY IDS ARE THE TAXONOMY'S OWN VALUES. The obvious shape for a
// `categories` collection is auto-ids, and it is the wrong one here. A user's
// interests only have meaning when they can be intersected with an auction's
// stored `category`, and that field carries the canonical values in
// utils/categories.ts — values that doc comment forbids renaming because
// legacy lots carry them. So `categories/{categoryId}` uses the SAME value as
// its id ('Vehicles', 'Phones', …) and `users/{uid}.interests` is an array of
// those ids. Auto-ids would have produced a set that intersects nothing, and
// the digest would have gone out empty every night without erroring once.
//
// The screen reads the collection, NOT this file — an admin has to be able to
// add a category without a deploy. CATEGORIES stays the seed source and the
// last-resort fallback; see interestCategoriesFrom().
import { CATEGORIES } from './categories';

/** A category as the onboarding grid needs it, read from Firestore. */
export interface InterestCategory {
  /** Doc id === the canonical `auctions/{id}.category` value. */
  id: string;
  nameAr: string;
  nameEn: string;
  /** Lucide icon name; the grid falls back to a generic glyph if unknown. */
  icon: string;
  order: number;
  active: boolean;
}

export type NotifyChannel = 'whatsapp' | 'push' | 'none';

/** The notification block written alongside the interests. */
export interface NotifyPrefs {
  notifyDaily: boolean;
  notifyFeatured: boolean;
  notifyChannel: NotifyChannel;
}

/** Consent toggle ships ON, and both digests follow it. */
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  notifyDaily: true,
  notifyFeatured: true,
  notifyChannel: 'whatsapp',
};

/** Exactly what one save of the interests step writes. */
export interface SaveInterestsInput extends NotifyPrefs {
  /** Category ids — see the note at the top of this file. */
  interests: string[];
  /** True when the user pressed "تخطي الآن" rather than picking. */
  interestsSkipped: boolean;
}

/** Icon name per canonical category, used when seeding the collection. */
const SEED_ICONS: Record<string, string> = {
  Vehicles: 'Car',
  Phones: 'Smartphone',
  Electronics: 'Cpu',
  Watches: 'Watch',
  Appliances: 'WashingMachine',
  'Home & Furniture': 'Sofa',
  'Real Estate': 'Building2',
  Fashion: 'Package',
};

/**
 * The taxonomy as `categories` documents. This is what the seed script writes,
 * and what the grid falls back to if the collection cannot be read.
 */
export const SEED_CATEGORIES: readonly InterestCategory[] = CATEGORIES.map((c, i) => ({
  id: c.value,
  nameAr: c.labelAr,
  nameEn: c.labelEn,
  icon: SEED_ICONS[c.value] ?? 'Package',
  order: (i + 1) * 10,
  active: true,
}));

/**
 * Normalise whatever the collection returned into a sorted, renderable list.
 *
 * Falls back to the local taxonomy when the collection yields nothing. That is
 * deliberate and it is NOT the hardcoding the spec rules out: Firestore stays
 * the source of truth, and this only decides what a brand-new user sees when
 * the read comes back empty — an unseeded project, a rules change, an offline
 * first load. The alternative is an empty grid on a screen whose Continue
 * button is disabled until something is picked, which locks the user out of
 * the app entirely at the moment they first sign up.
 */
export function interestCategoriesFrom(
  docs: readonly Partial<InterestCategory>[] | null | undefined,
): InterestCategory[] {
  const usable = (docs ?? [])
    .filter((d): d is InterestCategory => !!d && typeof d.id === 'string' && d.id.length > 0)
    .filter(d => d.active !== false)
    .map(d => ({
      id: d.id,
      nameAr: d.nameAr || d.nameEn || d.id,
      nameEn: d.nameEn || d.nameAr || d.id,
      icon: d.icon || 'Package',
      order: typeof d.order === 'number' ? d.order : Number.MAX_SAFE_INTEGER,
      active: true,
    }));
  if (usable.length === 0) return [...SEED_CATEGORIES];
  // Stable: `order`, then id, so two categories sharing an order never swap
  // places between renders.
  return usable.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The subset of the user doc this decision reads. */
export interface InterestsGateUser {
  /** AppContext represents a signed-out visitor with a sentinel user object
   *  whose id is 'unauthenticated', not with null. */
  id?: string;
  interests?: unknown;
  interestsSkipped?: boolean;
}

/** AppContext's signed-out sentinel. */
export const UNAUTHENTICATED_ID = 'unauthenticated';

/**
 * Should this user be sent through the interests screen?
 *
 * Missing or empty `interests` means "never asked". `interestsSkipped` is what
 * makes "تخطي الآن" stick — it also writes `interests: []`, which is
 * indistinguishable from never-asked without this second flag, and a skip that
 * re-prompts on every login is just a nag.
 */
export function needsInterestsOnboarding(user: InterestsGateUser | null | undefined): boolean {
  if (!user) return false;
  // A signed-out visitor is NOT a user with no interests. AppContext models
  // them as a sentinel OBJECT rather than null, so the !user check above misses
  // them entirely, and every guest looked like a brand-new signup that needed
  // onboarding — which pushed the whole guest-browsing audience at a step they
  // cannot even save from.
  if (user.id === UNAUTHENTICATED_ID) return false;
  if (user.interestsSkipped === true) return false;
  const raw = user.interests;
  if (!Array.isArray(raw)) return true;
  return raw.filter(v => typeof v === 'string' && v.trim().length > 0).length === 0;
}

/** Drop unknown/duplicate ids so a stale selection cannot be saved. */
export function sanitizeSelection(
  selected: readonly string[],
  available: readonly InterestCategory[],
): string[] {
  const valid = new Set(available.map(c => c.id));
  const out: string[] = [];
  for (const id of selected) {
    if (valid.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Minimum 1 selection required to continue. */
export function canContinue(selected: readonly string[]): boolean {
  return selected.length > 0;
}
