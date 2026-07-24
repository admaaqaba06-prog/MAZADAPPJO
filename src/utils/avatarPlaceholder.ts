import { User } from '../types';

/**
 * Generative geometric placeholder avatars + the "is this a real photo?" gate.
 *
 * Mazad shows a face next to every bid, chat line, seller card and order. When a
 * user hasn't uploaded a photo we must NOT fall back to a shared stock face
 * (the app used to reuse a handful of Unsplash portraits, so dozens of strangers
 * looked like the same person). Instead we render a deterministic on-brand
 * geometric identicon derived purely from the user's id — no network, no image
 * assets, same seed always paints the same avatar.
 *
 * Everything here is pure and unit-tested (avatarPlaceholder.test.ts).
 */

// The old hardcoded Unsplash avatar fallbacks. A stored avatar that still points
// at one of these is NOT a real photo — it's a leftover placeholder — so the
// trust gate must treat it as "no photo". (Product/thumbnail Unsplash fallbacks
// are deliberately NOT listed; those are item images, not faces.)
export const UNSPLASH_PLACEHOLDER_FRAGMENTS: readonly string[] = [
  'photo-1535713875002-d1d0cf377fde',
  'photo-1534528741775-53994a69daeb',
  'photo-1507003211169-0a1dd7228f2d',
  'photo-1494790108377-be9c29b29330',
  'photo-1500648767791-00dcc994a43e',
  'photo-1547996165-f823e595aa',
];

/** FNV-1a 32-bit hash — small, fast, stable across runs/platforms. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // force unsigned
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG seeded from the hash. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm, on-brand palette (oranges + warm accents). Backgrounds pair two of
// these into a gradient; shapes pick from the rest.
const PALETTE: readonly string[] = [
  '#FF6B00', // brand orange
  '#E85D04', // deep orange
  '#F48C06', // amber-orange
  '#FAA307', // amber
  '#FFB703', // warm yellow
  '#DC2F02', // red-orange
  '#9D0208', // deep clay red
  '#FFBA08', // gold
];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Build a deterministic inline SVG avatar from `seed`. 100x100 viewBox: a warm
 * two-stop diagonal gradient background plus 3–4 translucent geometric shapes
 * (circles / triangles / rounded rects) positioned + colored from the seed.
 */
export function placeholderAvatarDataUri(seed: string): string {
  const rng = mulberry32(hashSeed(seed || 'mazad'));

  const gA = pick(rng, PALETTE);
  let gB = pick(rng, PALETTE);
  if (gB === gA) gB = PALETTE[(PALETTE.indexOf(gA) + 3) % PALETTE.length];

  const shapes: string[] = [];
  const count = 3 + Math.floor(rng() * 2); // 3 or 4 shapes
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rng() * 3); // 0 circle, 1 triangle, 2 rounded rect
    const color = pick(rng, PALETTE);
    const opacity = (0.35 + rng() * 0.45).toFixed(2);
    const cx = Math.round(rng() * 100);
    const cy = Math.round(rng() * 100);
    if (kind === 0) {
      const r = Math.round(14 + rng() * 26);
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
    } else if (kind === 1) {
      const s = Math.round(20 + rng() * 34);
      const p1 = `${cx},${cy - s}`;
      const p2 = `${cx - s},${cy + s}`;
      const p3 = `${cx + s},${cy + s}`;
      shapes.push(`<polygon points="${p1} ${p2} ${p3}" fill="${color}" opacity="${opacity}"/>`);
    } else {
      const w = Math.round(24 + rng() * 40);
      const h = Math.round(24 + rng() * 40);
      const rx = Math.round(4 + rng() * 12);
      shapes.push(
        `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${rx}" fill="${color}" opacity="${opacity}"/>`
      );
    }
  }

  const gid = `g${hashSeed(seed).toString(36)}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${gA}"/><stop offset="1" stop-color="${gB}"/>` +
    `</linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#${gid})"/>` +
    `<g>${shapes.join('')}</g>` +
    `</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Is `url` a GENUINE uploaded/linked photo? True iff it's a non-empty http(s)
 * URL that is neither the generated data: placeholder nor one of the old
 * hardcoded Unsplash stock faces. Google-signin photos (googleusercontent) pass.
 */
export function isRealPhotoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:')) return false; // the generated placeholder
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (UNSPLASH_PLACEHOLDER_FRAGMENTS.some((frag) => trimmed.includes(frag))) return false;
  return true;
}

/** Does this user have a real uploaded/linked profile photo? */
export function hasRealPhoto(user: Pick<User, 'avatar'> | null | undefined): boolean {
  return isRealPhotoUrl(user?.avatar);
}

/** Real photo if present, else a deterministic placeholder seeded by `seed`. */
export function resolveAvatarUrl(url: string | null | undefined, seed: string): string {
  if (isRealPhotoUrl(url)) return (url as string).trim();
  return placeholderAvatarDataUri(seed);
}

type AvatarUser =
  | (Partial<Pick<User, 'id' | 'uid' | 'avatar' | 'email' | 'phone' | 'phoneNumber'>> & Record<string, any>)
  | null
  | undefined;

/** Resolve a User's avatar, seeding the placeholder from a stable identifier. */
export function resolveAvatar(user: AvatarUser): string {
  const seed =
    user?.id || user?.uid || user?.phoneNumber || user?.phone || user?.email || 'mazad';
  return resolveAvatarUrl(user?.avatar, String(seed));
}
