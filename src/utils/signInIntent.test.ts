import { describe, it, expect } from 'vitest';
import {
  SIGN_IN_INTENTS,
  signInPrompt,
  postSignInView,
  type SignInIntent,
} from './signInIntent';

describe('signInPrompt', () => {
  it('asks for the thing the user was actually doing', () => {
    // The reported bug: tapping "Sell your product" showed a bidding message,
    // because requestSignIn() took no argument and every entry point produced
    // one screen.
    expect(signInPrompt('sell', false).headline).toMatch(/list/i);
    expect(signInPrompt('sell', false).headline).not.toMatch(/bid/i);
    expect(signInPrompt('bid', false).headline).toMatch(/bid/i);
  });

  it('has Arabic and English for every intent', () => {
    for (const intent of SIGN_IN_INTENTS) {
      const ar = signInPrompt(intent, true);
      const en = signInPrompt(intent, false);
      expect(ar.headline.trim(), `${intent} ar`).not.toBe('');
      expect(en.headline.trim(), `${intent} en`).not.toBe('');
      // Arabic must actually be Arabic — a missed branch silently falls back
      // to the English string, which reads as "translated" in a diff.
      expect(ar.headline, `${intent} ar is arabic`).toMatch(/[؀-ۿ]/);
    }
  });

  it('falls back to the neutral welcome for an unknown or absent intent', () => {
    expect(signInPrompt(null, false).headline).toBe(signInPrompt('account', false).headline);
    expect(signInPrompt('nonsense' as SignInIntent, false).headline)
      .toBe(signInPrompt('account', false).headline);
  });

  it('never promises something the app does not do', () => {
    // Every intent's subline describes the next step only. No claims about
    // speed, fees, guarantees or verification — those need a real policy.
    for (const intent of SIGN_IN_INTENTS) {
      const en = signInPrompt(intent, false).subline.toLowerCase();
      for (const forbidden of ['free', 'instant', 'guarantee', 'verified', 'secure']) {
        expect(en, `${intent} claims "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});

describe('postSignInView', () => {
  it('sends a would-be seller into the selling flow', () => {
    // Returning them to Discover after they asked to sell is the same bug in
    // the other direction.
    expect(postSignInView('sell')).toBe('upload');
  });

  it('returns null for every other intent, leaving the latched view alone', () => {
    // AppContext already latches activeView/activeAuctionId across signup, so
    // a bidder lands back on the exact lot. Overriding that would be a
    // regression, so only 'sell' names a destination.
    for (const intent of SIGN_IN_INTENTS.filter(i => i !== 'sell')) {
      expect(postSignInView(intent), intent).toBeNull();
    }
    expect(postSignInView(null)).toBeNull();
  });
});
