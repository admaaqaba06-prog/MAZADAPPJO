// Guest browsing (Whatnot/eBay pattern): logged-out visitors can WATCH —
// browse Discover, open a listing, view its media gallery / price / countdown —
// and every ACTION (bid, chat, save, sell, account surfaces) is the signup
// moment. These pure helpers centralize every guest-vs-member gating decision
// so the surfaces (App shell, useBidFlow, live layouts) all decide identically
// and the logic stays unit-testable.

/** Views a logged-out visitor may render read-only. Everything else is the
 *  signup moment. Fail closed: unknown views are gated. */
export const GUEST_ALLOWED_VIEWS: readonly string[] = [
  'discovery',
  'live',
  'about',
  'prohibited-items',
];

export function canGuestAccessView(view: string): boolean {
  return GUEST_ALLOWED_VIEWS.includes(view);
}

/** A guest is a RESOLVED logged-out session — never while Firebase is still
 *  restoring a persisted session (that visitor may be a member). */
export function isGuestSession(authReady: boolean, isAuthenticated: boolean): boolean {
  return authReady && !isAuthenticated;
}

export type BidTapDecision = 'signup' | 'subscribe' | 'confirm';

/**
 * What a bid tap does:
 *  - guest (not authenticated)      -> SIGNUP (login flow), never the subscription sheet
 *  - authenticated non-member       -> SUBSCRIBE (the existing membership invite — unchanged)
 *  - authenticated member           -> CONFIRM (the existing confirm step — unchanged)
 * Authentication wins over any (impossible) member flag so a guest can never
 * be routed to a members-only sheet.
 */
export function resolveBidTap(isAuthenticated: boolean, isMember: boolean): BidTapDecision {
  if (!isAuthenticated) return 'signup';
  return isMember ? 'confirm' : 'subscribe';
}

/** Chat / save / follow / any other write action: guests sign up, members proceed. */
export function resolveGuestWriteAction(isAuthenticated: boolean): 'signup' | 'proceed' {
  return isAuthenticated ? 'proceed' : 'signup';
}

export type BidGateDecision = 'signin' | 'membership' | 'photo' | 'proceed';

export interface BidGateArgs {
  isAuthenticated: boolean;
  isMember: boolean;
  /** Whether the user has a REAL uploaded/linked profile photo (see hasRealPhoto). */
  hasPhoto: boolean;
}

/**
 * The single ordered gate a bid tap must pass, added to enforce the trust rule
 * "a real photo is required to bid" WITHOUT touching the server bid path. Order,
 * cheapest-blocker first:
 *   1. signin     — a guest must sign up (wins over every later gate).
 *   2. membership — an authenticated non-member is invited to join.
 *   3. photo      — an authenticated member with NO real photo must add one.
 *   4. proceed    — member with a photo → stage the confirm.
 * A guest is always routed to sign-in first even if the (impossible) member/photo
 * flags say otherwise, so no members-only sheet can ever show to a logged-out tap.
 */
export function resolveBidGate(args: BidGateArgs): BidGateDecision {
  const { isAuthenticated, isMember, hasPhoto } = args;
  if (!isAuthenticated) return 'signin';
  if (!isMember) return 'membership';
  if (!hasPhoto) return 'photo';
  return 'proceed';
}

/**
 * siteSettings/featureFlags.enableGuestBrowsing — production kill switch.
 * Default ENABLED (absent doc/field/junk value => true); only an explicit
 * `false` disables guest browsing, restoring the login-gated behavior.
 * Same fail-open convention as the sibling flags (`data.enableX !== false`).
 */
export function readGuestBrowsingFlag(
  data: Record<string, unknown> | null | undefined
): boolean {
  return data?.enableGuestBrowsing !== false;
}

export type UnauthScreen = 'landing' | 'login' | 'browse';

export interface UnauthScreenArgs {
  /** Visitor clicked "Enter" on the landing page this session. */
  entered: boolean;
  /** Visitor arrived via an auction deep link (?auction=<id>). */
  hasDeepLink: boolean;
  /** siteSettings kill switch (see readGuestBrowsingFlag). */
  guestBrowsingEnabled: boolean;
  /** A gated action tap (bid/chat/save/...) requested the sign-in flow. */
  signInRequested: boolean;
  /** Current nav view (activeView). */
  activeView: string;
}

/**
 * The single routing decision for a logged-out visitor (App.tsx unauth branch):
 *  1. Cold visitor (not entered, no deep link) -> landing front door (SEO/marketing).
 *  2. Flag OFF -> login (EXACTLY today's login-gated behavior).
 *  3. An action tapped sign-in -> login.
 *  4. A members-only view -> login (nav taps to Orders/Wallet/Profile/Sell/...).
 *  5. Otherwise -> the real browse shell (Discover / live room), read-only.
 */
export function resolveUnauthenticatedScreen(args: UnauthScreenArgs): UnauthScreen {
  const { entered, hasDeepLink, guestBrowsingEnabled, signInRequested, activeView } = args;
  if (!entered && !hasDeepLink) return 'landing';
  if (!guestBrowsingEnabled) return 'login';
  if (signInRequested) return 'login';
  if (!canGuestAccessView(activeView)) return 'login';
  return 'browse';
}
