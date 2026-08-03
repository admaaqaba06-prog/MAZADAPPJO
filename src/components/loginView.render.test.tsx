// LoginView with the marketing panel wired in.
//
// THE LOAD-BEARING ASSERTION IN THIS FILE is that both sign-in buttons render in
// every panel state. The panel is decoration on a critical path: a sign-in
// regression blocks every new user, so marketing must never be able to break it.
//
// `renderToStaticMarkup` in plain node — vitest here is `environment: 'node'`
// and neither jsdom nor @testing-library may be added.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

// LoginView reads window.location to decide whether the visitor followed an
// auction deep link. There is no window in `environment: 'node'`, so provide the
// two fields it actually touches. A ROOT path is the case under test here: the
// cold arrival with no lot to carry through, which is what this whole screen
// redesign exists for. (`document` is only touched inside the reCAPTCHA
// handlers, which no render path reaches.)
(globalThis as { window?: unknown }).window = {
  location: { pathname: '/', search: '' },
};

const lot = (over: Partial<LandingAuction> = {}): LandingAuction => ({
  id: 'a1',
  title: 'Apple Watch Ultra',
  category: 'misc' as LandingAuction['category'],
  currentPrice: 145,
  totalBids: 3,
  endTime: undefined,
  createdAt: 1,
  featuredRank: undefined,
  imageUrl: 'https://x/y.jpg',
  isFeatured: false,
  isVerified: true,
  ...over,
});

// Mutable so each case can swap the panel's data without re-mocking.
let landingState: LandingAuctionsState = {
  auctions: [lot()], isLoading: false, isEmpty: false, isError: false,
};

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));
vi.mock('../services/firebase', () => ({ auth: {}, db: {} }));
vi.mock('../landing/useLandingAuctions', () => ({
  useLandingAuctions: () => landingState,
}));
vi.mock('./ui/PhoneInput', () => ({
  PhoneInput: () => null,
  __esModule: true,
}));

const appMock = {
  language: 'en',
  setLanguage: () => {},
  loginWithGoogle: async () => ({ success: true }),
  loginWithPhone: async () => ({}),
  confirmPhoneCode: async () => ({ success: true }),
  requestWhatsappOtp: async () => ({ ok: true }),
  verifyWhatsappOtp: async () => ({ ok: true }),
};
vi.mock('../context/AppContext', () => ({ useApp: () => appMock }));

import { LoginView } from './LoginView';

const render = () =>
  renderToStaticMarkup(React.createElement(LoginView, { onBack: () => {} }));

beforeEach(() => {
  landingState = { auctions: [lot()], isLoading: false, isEmpty: false, isError: false };
});

describe('LoginView keeps sign-in reachable in every panel state', () => {
  const states: Record<string, LandingAuctionsState> = {
    loaded:  { auctions: [lot()], isLoading: false, isEmpty: false, isError: false },
    loading: { auctions: [],      isLoading: true,  isEmpty: false, isError: false },
    empty:   { auctions: [],      isLoading: false, isEmpty: true,  isError: false },
    error:   { auctions: [],      isLoading: false, isEmpty: false, isError: true  },
    stale:   { auctions: [lot()], isLoading: false, isEmpty: false, isError: true  },
  };

  for (const [name, s] of Object.entries(states)) {
    it(`renders both sign-in paths when the panel is ${name}`, () => {
      landingState = s;
      const html = render();
      // The two ways in. If marketing ever breaks these, it has broken signup.
      expect(html.toLowerCase()).toMatch(/phone/);
      expect(html.toLowerCase()).toMatch(/google/);
      // …and the guest escape hatch survives too.
      expect(html).toMatch(/Continue browsing/i);
    });
  }

  it('never renders the panel INSTEAD of the card', () => {
    landingState = states.loading;
    const html = render();
    expect(html.toLowerCase()).toMatch(/google/);
  });

  it('never HIDES the sign-in card, in any panel state', () => {
    // Found by mutation: asserting the buttons are in the markup is not the same
    // as asserting they are visible. Wrapping the card in display:none, or in an
    // unqualified `hidden` class, left every assertion above green while the
    // visitor saw no way to sign in.
    for (const s of Object.values(states)) {
      landingState = s;
      const html = render();
      expect(html).not.toMatch(/style="[^"]*display:\s*none/i);
      // Parse the class lists rather than pattern-match them: a regex missed
      // `class="hidden …"` (no whitespace before the token after the quote) and
      // the mutation survived. `hidden lg:block` is breakpoint-scoped and
      // intended; a bare `hidden` with no lg: display to restore it is not.
      const classLists = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
      const unconditionallyHidden = classLists.filter((list) => {
        const tokens = list.split(/\s+/);
        if (!tokens.includes('hidden')) return false;
        return !tokens.some((t) => /^lg:(block|flex|grid|inline|inline-block)$/.test(t));
      });
      expect(unconditionallyHidden, `hidden wrapper in ${JSON.stringify(s)}`).toEqual([]);
    }
  });
});

describe('LoginView layout', () => {
  it('is one column below lg and two columns at lg', () => {
    expect(render()).toMatch(/flex-col lg:flex-row/);
  });

  it('shows the story column only on desktop, and its mobile twin only on mobile', () => {
    const html = render();
    expect(html).toMatch(/hidden lg:block/);  // story column, desktop only
    expect(html).toMatch(/lg:hidden/);        // the same story, mobile only
  });

  it('renders the marketing copy exactly once per breakpoint bucket', () => {
    // The desktop story column and its mobile twin both exist in the markup
    // (CSS hides one). What must not happen is the SAME bucket repeating a claim
    // — and note the ACTIVITY block is deliberately not duplicated that way: it
    // renders once, under the card, on both breakpoints.
    const html = render();
    const trust = html.split('Buy safely from anyone').length - 1;
    const steps = html.split('Pay by CliQ').length - 1;
    expect(trust).toBe(2);  // desktop story + mobile story
    expect(steps).toBe(2);  // desktop story + mobile story
  });

  it('puts the live lots BELOW the sign-in card, not beside it', () => {
    // MJ's call after seeing it beside the form: the form is the primary action
    // and leads; the inventory is proof underneath rather than something
    // competing for first attention. Asserted by document order, so moving the
    // activity block back above or into the left column fails here.
    const html = render();
    const card = html.indexOf('Continue with Google');
    const lots = html.indexOf('lots live right now');
    expect(card, 'sign-in card present').toBeGreaterThan(-1);
    expect(lots, 'activity block present').toBeGreaterThan(-1);
    expect(lots).toBeGreaterThan(card);
  });

  it('keeps the lots out of the desktop story column', () => {
    // The left column is trust + how-it-works only. If the activity block leaked
    // back into it the count would render twice.
    const html = render();
    const occurrences = html.split('lots live right now').length - 1;
    expect(occurrences).toBe(1);
  });

  it('keeps the deep-link banner untouched', () => {
    // cameFromAuctionLink is false in a node render (no auction path), so the
    // banner must be absent — not accidentally always-on after the rewrap.
    expect(render()).not.toContain('deep-link-auction-banner');
  });

  it('still renders the header, language toggle and policy footer', () => {
    const html = render();
    expect(html).toContain('lang-toggle-btn');
    expect(html).toContain('login-view-root');
    expect(html).toMatch(/<footer/);
  });
});

describe('LoginView panel content', () => {
  it('passes the live lots through to the panel', () => {
    landingState = { auctions: [lot({ title: 'Rolex Datejust' })], isLoading: false, isEmpty: false, isError: false };
    expect(render()).toContain('Rolex Datejust');
  });

  it('renders no lot markup while the fetch is in flight', () => {
    landingState = { auctions: [], isLoading: true, isEmpty: false, isError: false };
    const html = render();
    expect(html).not.toContain('lots live right now');
    expect(html).not.toMatch(/animate-pulse|skeleton/i);
  });

  it('follows the app language into the panel', () => {
    appMock.language = 'ar';
    const html = render();
    expect(html).toContain('قطعة معروضة الآن');
    appMock.language = 'en';
  });
});
