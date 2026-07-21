import { describe, it, expect } from 'vitest';
import { serializeNav, parseNav } from './navUrl';

describe('serializeNav', () => {
  it('returns empty string for the clean discovery home', () => {
    expect(serializeNav({ view: 'discovery' })).toBe('');
  });

  it('serializes a plain view', () => {
    expect(serializeNav({ view: 'wallet' })).toBe('?view=wallet');
  });

  it('reuses ?auction= for the live auction detail (aligns with deepLink)', () => {
    expect(serializeNav({ view: 'live', auctionId: 'auction-123' })).toBe(
      '?auction=auction-123',
    );
  });

  it('url-encodes the auction id', () => {
    expect(serializeNav({ view: 'live', auctionId: 'a b' })).toBe('?auction=a+b');
  });

  it('serializes a modal without a param', () => {
    expect(serializeNav({ view: 'discovery', modal: 'notifications' })).toBe(
      '?modal=notifications',
    );
  });

  it('serializes a modal with a param', () => {
    expect(
      serializeNav({
        view: 'discovery',
        modal: 'order',
        modalParam: { key: 'order', value: 'abc' },
      }),
    ).toBe('?modal=order&order=abc');
  });

  it('keeps the view alongside a modal on a non-discovery view', () => {
    expect(serializeNav({ view: 'wallet', modal: 'notifications' })).toBe(
      '?view=wallet&modal=notifications',
    );
  });
});

describe('parseNav', () => {
  it('parses the clean home to discovery', () => {
    expect(parseNav('')).toEqual({ view: 'discovery' });
  });

  it('round-trips a plain view', () => {
    expect(parseNav('?view=wallet')).toEqual({ view: 'wallet' });
  });

  it('round-trips the live auction detail', () => {
    expect(parseNav('?auction=auction-123')).toEqual({
      view: 'live',
      auctionId: 'auction-123',
    });
  });

  it('round-trips a modal without a param', () => {
    expect(parseNav('?modal=notifications')).toEqual({
      view: 'discovery',
      modal: 'notifications',
    });
  });

  it('round-trips a modal with a param', () => {
    expect(parseNav('?modal=order&order=abc')).toEqual({
      view: 'discovery',
      modal: 'order',
      modalParam: { key: 'order', value: 'abc' },
    });
  });

  it('normalizes a Firebase auth-callback (apiKey) to neutral discovery', () => {
    expect(
      parseNav('?apiKey=AIzaFAKE&authType=signInViaRedirect&mode=select'),
    ).toEqual({ view: 'discovery' });
  });

  it('normalizes a Firebase auth handler path to neutral discovery', () => {
    expect(parseNav('?__/auth/handler=1&providerId=google.com')).toEqual({
      view: 'discovery',
    });
  });

  it('ignores an unknown view and falls back to discovery', () => {
    expect(parseNav('?view=not-a-real-view')).toEqual({ view: 'discovery' });
  });
});

describe('round-trip serialize <-> parse', () => {
  const cases = [
    { view: 'discovery' as const },
    { view: 'wallet' as const },
    { view: 'live' as const, auctionId: 'auction-xyz' },
    { view: 'discovery' as const, modal: 'notifications' },
    {
      view: 'discovery' as const,
      modal: 'order',
      modalParam: { key: 'order', value: 'ord_99' },
    },
  ];
  it.each(cases)('parse(serialize(%o)) === input', (node) => {
    expect(parseNav(serializeNav(node))).toEqual(node);
  });
});
