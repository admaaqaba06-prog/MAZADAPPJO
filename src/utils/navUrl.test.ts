import { describe, it, expect } from 'vitest';
import { serializeNav, parseNav, isModalCloseTransition } from './navUrl';

describe('serializeNav (path-based)', () => {
  it('landing serializes to the root path', () => {
    expect(serializeNav({ view: 'landing' })).toBe('/');
  });

  it('serializes each view to its path', () => {
    expect(serializeNav({ view: 'discovery' })).toBe('/discover');
    expect(serializeNav({ view: 'upload' })).toBe('/sell');
    expect(serializeNav({ view: 'orders' })).toBe('/orders');
    expect(serializeNav({ view: 'about' })).toBe('/how-it-works');
    expect(serializeNav({ view: 'seller-center' })).toBe('/seller');
    expect(serializeNav({ view: 'prohibited-items' })).toBe('/prohibited');
    expect(serializeNav({ view: 'wallet' })).toBe('/wallet');
  });

  it('serializes a live auction to /auction/:id (url-encoded)', () => {
    expect(serializeNav({ view: 'live', auctionId: 'auction-123' })).toBe('/auction/auction-123');
    expect(serializeNav({ view: 'live', auctionId: 'a b' })).toBe('/auction/a%20b');
  });

  it('appends a modal as a query on top of the path', () => {
    expect(serializeNav({ view: 'discovery', modal: 'notifications' })).toBe('/discover?modal=notifications');
    expect(
      serializeNav({ view: 'orders', modal: 'order', modalParam: { key: 'order', value: 'abc' } }),
    ).toBe('/orders?modal=order&order=abc');
  });
});

describe('parseNav (path-based)', () => {
  it('root path parses to landing', () => {
    expect(parseNav('/')).toEqual({ view: 'landing' });
    expect(parseNav('')).toEqual({ view: 'landing' });
  });

  it('parses each view path', () => {
    expect(parseNav('/discover')).toEqual({ view: 'discovery' });
    expect(parseNav('/sell')).toEqual({ view: 'upload' });
    expect(parseNav('/how-it-works')).toEqual({ view: 'about' });
    expect(parseNav('/seller')).toEqual({ view: 'seller-center' });
  });

  it('tolerates a trailing slash', () => {
    expect(parseNav('/orders/')).toEqual({ view: 'orders' });
  });

  it('parses /auction/:id to the live view', () => {
    expect(parseNav('/auction/auction-123')).toEqual({ view: 'live', auctionId: 'auction-123' });
    expect(parseNav('/auction/a%20b')).toEqual({ view: 'live', auctionId: 'a b' });
  });

  it('parses a modal query on top of a path', () => {
    expect(parseNav('/orders?modal=order&order=abc')).toEqual({
      view: 'orders',
      modal: 'order',
      modalParam: { key: 'order', value: 'abc' },
    });
  });

  it('BACK-COMPAT: legacy /?auction=<id> still resolves to the live view', () => {
    expect(parseNav('/?auction=auction-123')).toEqual({ view: 'live', auctionId: 'auction-123' });
  });

  it('BACK-COMPAT: legacy /?view=orders still resolves', () => {
    expect(parseNav('/?view=orders')).toEqual({ view: 'orders' });
  });

  it('normalizes a Firebase auth-callback (apiKey) to neutral discovery', () => {
    expect(parseNav('/?apiKey=AIzaFAKE&authType=signInViaRedirect&mode=select')).toEqual({ view: 'discovery' });
  });

  it('normalizes a Firebase auth handler path to neutral discovery', () => {
    expect(parseNav('/__/auth/handler?providerId=google.com')).toEqual({ view: 'discovery' });
  });

  it('unknown path falls back to landing', () => {
    expect(parseNav('/totally-unknown')).toEqual({ view: 'landing' });
  });
});

describe('isModalCloseTransition', () => {
  it('is true when a modal closes and the view stays the same', () => {
    expect(
      isModalCloseTransition(
        { view: 'wallet', modal: 'order', modalParam: { key: 'order', value: 'x' } },
        { view: 'wallet' },
      ),
    ).toBe(true);
  });

  it('is true when a modal closes and the live auction stays the same', () => {
    expect(
      isModalCloseTransition(
        { view: 'live', auctionId: 'a1', modal: 'subscription' },
        { view: 'live', auctionId: 'a1' },
      ),
    ).toBe(true);
  });

  it('is false when opening a modal (closed -> open)', () => {
    expect(isModalCloseTransition({ view: 'wallet' }, { view: 'wallet', modal: 'notifications' })).toBe(false);
  });

  it('is false when the view changes even if the modal also closes', () => {
    expect(
      isModalCloseTransition(
        { view: 'wallet', modal: 'order', modalParam: { key: 'order', value: 'x' } },
        { view: 'discovery' },
      ),
    ).toBe(false);
  });

  it('is false when the live auction changes', () => {
    expect(
      isModalCloseTransition(
        { view: 'live', auctionId: 'a1', modal: 'order' },
        { view: 'live', auctionId: 'a2' },
      ),
    ).toBe(false);
  });

  it('is false for a plain view->view change with no modal involved', () => {
    expect(isModalCloseTransition({ view: 'wallet' }, { view: 'orders' })).toBe(false);
  });
});

describe('round-trip serialize <-> parse (path-based)', () => {
  const cases = [
    { view: 'landing' as const },
    { view: 'discovery' as const },
    { view: 'wallet' as const },
    { view: 'orders' as const },
    { view: 'live' as const, auctionId: 'auction-xyz' },
    { view: 'discovery' as const, modal: 'notifications' },
    { view: 'orders' as const, modal: 'order', modalParam: { key: 'order', value: 'ord_99' } },
  ];
  it.each(cases)('parse(serialize(%o)) === input', (node) => {
    expect(parseNav(serializeNav(node))).toEqual(node);
  });
});
