import { describe, it, expect } from 'vitest';
import {
  BID_GATE_ORDER,
  canGuestAccessView,
  isGuestSession,
  readGuestBrowsingFlag,
  resolveBidTap,
  resolveBidGate,
  resolveGuestWriteAction,
  resolveUnauthenticatedScreen,
  resolveMissingContact,
  isContactComplete,
} from './guestGate';

describe('isGuestSession', () => {
  it('is a guest only once auth has resolved AND the visitor is logged out', () => {
    expect(isGuestSession(true, false)).toBe(true);
  });
  it('is NOT a guest while auth is still restoring (could be a member)', () => {
    expect(isGuestSession(false, false)).toBe(false);
  });
  it('is NOT a guest when authenticated', () => {
    expect(isGuestSession(true, true)).toBe(false);
  });
});

describe('resolveBidTap — the "should this tap sign up or proceed" decision', () => {
  it('guests (not authenticated) are sent to SIGNUP, never the subscription sheet', () => {
    expect(resolveBidTap(false, false)).toBe('signup');
  });
  it('authenticated non-members are invited to SUBSCRIBE (unchanged member gate)', () => {
    expect(resolveBidTap(true, false)).toBe('subscribe');
  });
  it('authenticated members proceed to the bid CONFIRM step (unchanged)', () => {
    expect(resolveBidTap(true, true)).toBe('confirm');
  });
  it('an impossible "member but unauthenticated" state still routes to signup (safety)', () => {
    expect(resolveBidTap(false, true)).toBe('signup');
  });
});

describe('resolveBidGate — ordered signin → membership → photo → proceed', () => {
  it('guest → signin (regardless of member/photo flags)', () => {
    expect(resolveBidGate({ isAuthenticated: false, isMember: false, hasName: true, hasPhoto: false, contactComplete: false })).toBe('signin');
    expect(resolveBidGate({ isAuthenticated: false, isMember: true, hasName: true, hasPhoto: true, contactComplete: true })).toBe('signin');
  });
  it('authenticated non-member → membership', () => {
    expect(resolveBidGate({ isAuthenticated: true, isMember: false, hasName: true, hasPhoto: true, contactComplete: true })).toBe('membership');
    expect(resolveBidGate({ isAuthenticated: true, isMember: false, hasName: true, hasPhoto: false, contactComplete: false })).toBe('membership');
  });
  it('member without a real photo → photo', () => {
    expect(resolveBidGate({ isAuthenticated: true, isMember: true, hasName: true, hasPhoto: false, contactComplete: true })).toBe('photo');
  });
  it('member with a real photo and complete contact → proceed', () => {
    expect(resolveBidGate({ isAuthenticated: true, isMember: true, hasName: true, hasPhoto: true, contactComplete: true })).toBe('proceed');
  });
});

describe('resolveGuestWriteAction — chat / save / any write action', () => {
  it('guests are sent to signup', () => {
    expect(resolveGuestWriteAction(false)).toBe('signup');
  });
  it('authenticated users proceed', () => {
    expect(resolveGuestWriteAction(true)).toBe('proceed');
  });
});

describe('canGuestAccessView', () => {
  it.each(['discovery', 'live', 'about', 'prohibited-items'] as const)(
    'allows the read-only browse surface %s',
    (view) => {
      expect(canGuestAccessView(view)).toBe(true);
    }
  );
  it.each([
    'wallet',
    'orders',
    'profile',
    'upload',
    'seller-center',
    'admin',
    'drop-builder',
    'auction-drop-builder',
  ] as const)('gates the account surface %s behind sign-in', (view) => {
    expect(canGuestAccessView(view)).toBe(false);
  });
  it('gates anything unknown (fail closed)', () => {
    expect(canGuestAccessView('some-future-view')).toBe(false);
  });
});

describe('readGuestBrowsingFlag — siteSettings/featureFlags kill switch', () => {
  it('defaults to ENABLED when the field is absent', () => {
    expect(readGuestBrowsingFlag({})).toBe(true);
  });
  it('defaults to ENABLED when the doc is missing entirely', () => {
    expect(readGuestBrowsingFlag(null)).toBe(true);
    expect(readGuestBrowsingFlag(undefined)).toBe(true);
  });
  it('only an explicit false disables it', () => {
    expect(readGuestBrowsingFlag({ enableGuestBrowsing: false })).toBe(false);
  });
  it('true keeps it enabled', () => {
    expect(readGuestBrowsingFlag({ enableGuestBrowsing: true })).toBe(true);
  });
  it('junk values fail OPEN (enabled) like the sibling flags do', () => {
    expect(readGuestBrowsingFlag({ enableGuestBrowsing: 'no' as unknown })).toBe(true);
    expect(readGuestBrowsingFlag({ enableGuestBrowsing: 0 as unknown })).toBe(true);
  });
});

describe('resolveUnauthenticatedScreen — what a logged-out visitor sees', () => {
  const base = {
    guestBrowsingEnabled: true,
    signInRequested: false,
    activeView: 'discovery',
  };

  it('a deep link / browse surface goes straight to browse (watchable)', () => {
    expect(
      resolveUnauthenticatedScreen({ ...base, activeView: 'live' })
    ).toBe('browse');
  });

  it('flag OFF restores today\'s behavior exactly: any view -> login', () => {
    expect(
      resolveUnauthenticatedScreen({ ...base, guestBrowsingEnabled: false })
    ).toBe('login');
    expect(
      resolveUnauthenticatedScreen({
        ...base,
        guestBrowsingEnabled: false,
        activeView: 'live',
      })
    ).toBe('login');
  });

  it('an action tap (sign-in requested) shows the login flow', () => {
    expect(
      resolveUnauthenticatedScreen({ ...base, signInRequested: true })
    ).toBe('login');
  });

  it('a guest-gated view (orders/wallet/profile/...) shows the login flow', () => {
    expect(
      resolveUnauthenticatedScreen({ ...base, activeView: 'orders' })
    ).toBe('login');
    expect(
      resolveUnauthenticatedScreen({ ...base, activeView: 'wallet' })
    ).toBe('login');
  });

  it('entered guest on a browse surface gets the real app shell', () => {
    expect(resolveUnauthenticatedScreen(base)).toBe('browse');
    expect(
      resolveUnauthenticatedScreen({ ...base, activeView: 'live' })
    ).toBe('browse');
    expect(
      resolveUnauthenticatedScreen({ ...base, activeView: 'about' })
    ).toBe('browse');
  });
});

describe('resolveMissingContact', () => {
  it('phone-OTP user (email empty) needs email only', () => {
    expect(resolveMissingContact({ phoneNumber: '+962790000000', email: '' }))
      .toEqual({ needsPhone: false, needsEmail: true });
  });
  it('Google user (no phone) needs phone only', () => {
    expect(resolveMissingContact({ phoneNumber: '', email: 'a@b.com' }))
      .toEqual({ needsPhone: true, needsEmail: false });
  });
  it('complete user needs nothing', () => {
    expect(resolveMissingContact({ phoneNumber: '+962790000000', email: 'a@b.com' }))
      .toEqual({ needsPhone: false, needsEmail: false });
  });
  it('falls back to phone mirror field', () => {
    expect(resolveMissingContact({ phone: '+962790000000', email: 'a@b.com' }).needsPhone).toBe(false);
  });
  it('treats whitespace + malformed email as missing', () => {
    expect(resolveMissingContact({ phoneNumber: '   ', email: 'not-an-email' }))
      .toEqual({ needsPhone: true, needsEmail: true });
  });
  it('null user needs both', () => {
    expect(resolveMissingContact(null)).toEqual({ needsPhone: true, needsEmail: true });
  });
  it('isContactComplete is true only when nothing missing', () => {
    expect(isContactComplete({ phoneNumber: '+962790000000', email: 'a@b.com' })).toBe(true);
    expect(isContactComplete({ phoneNumber: '', email: 'a@b.com' })).toBe(false);
  });
});

describe('resolveBidGate — contact step', () => {
  const base = { isAuthenticated: true, isMember: true, hasName: true, hasPhoto: true, contactComplete: true };
  it('member with photo but incomplete contact -> contact', () => {
    expect(resolveBidGate({ ...base, contactComplete: false })).toBe('contact');
  });
  it('complete member -> proceed', () => {
    expect(resolveBidGate(base)).toBe('proceed');
  });
  it('photo still precedes contact', () => {
    expect(resolveBidGate({ ...base, hasPhoto: false, contactComplete: false })).toBe('photo');
  });
  it('guest still routes to signin regardless of contact', () => {
    expect(resolveBidGate({ ...base, isAuthenticated: false, contactComplete: false })).toBe('signin');
  });
});

describe('the name step, and the order being reorderable', () => {
  const ok = { isAuthenticated: true, isMember: true, hasName: true, hasPhoto: true, contactComplete: true };

  it('asks for a name before staging a bid', () => {
    // A bid shows a name in the history and on the order, so it cannot be
    // placed anonymously. Asked here rather than in a wall after signup.
    expect(resolveBidGate({ ...ok, hasName: false })).toBe('name');
  });

  it('proceeds once the name exists', () => {
    expect(resolveBidGate(ok)).toBe('proceed');
  });

  it('sign-in still wins over every other step, wherever they sit', () => {
    // Hard-enforced before the loop: a logged-out tap must never be shown a
    // members-only sheet, no matter how the order is later rearranged.
    expect(resolveBidGate({ ...ok, isAuthenticated: false, isMember: false, hasName: false })).toBe('signin');
  });

  it('returns the FIRST unsatisfied step in BID_GATE_ORDER, not a fixed one', () => {
    // The behaviour that makes the array authoritative.
    const allMissing = { isAuthenticated: true, isMember: false, hasName: false, hasPhoto: false, contactComplete: false };
    const firstBlocking = BID_GATE_ORDER.find(s => s !== 'signin')!;
    expect(resolveBidGate(allMissing)).toBe(firstBlocking);
  });

  it('every step in the order is reachable — no unreachable entries', () => {
    // A step listed but never returned would be dead config that reads as
    // enforcement. Satisfy everything before it, break only it.
    const satisfied: Record<string, keyof typeof ok> = {
      membership: 'isMember', name: 'hasName', photo: 'hasPhoto', contact: 'contactComplete',
    };
    for (const step of BID_GATE_ORDER) {
      if (step === 'signin') continue;
      const args = { ...ok };
      for (const earlier of BID_GATE_ORDER) {
        if (earlier === step) break;
        if (earlier !== 'signin') (args as any)[satisfied[earlier]] = true;
      }
      (args as any)[satisfied[step]] = false;
      expect(resolveBidGate(args), `${step} is listed in BID_GATE_ORDER but never returned`).toBe(step);
    }
  });

  it('the paywall position is data, not control flow', () => {
    // The entanglement note in guestGate.ts promises the membership step can be
    // moved or dropped by editing one array. That is only true while no other
    // step's predicate reads isMember.
    expect(BID_GATE_ORDER).toContain('membership');
    const withoutMembership = { ...ok, isMember: false };
    // With membership satisfied-by-assumption removed from consideration, the
    // name check must still behave identically.
    expect(resolveBidGate({ ...withoutMembership, hasName: false, isMember: true })).toBe('name');
  });
});
