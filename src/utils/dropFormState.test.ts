import { describe, it, expect } from 'vitest';
import { INITIAL_FORM, afterCreateAnother, validateDropForm, type DropFormValues } from './dropFormState';

const NOW = Date.UTC(2026, 0, 1);

const filled: DropFormValues = {
  ...INITIAL_FORM,
  productName: 'iPhone 15 Pro',
  startingPrice: '250',
  specsText: '256GB\nSealed',
  marketPrice: '400',
  reservePrice: '300',
  viewing: 'store',
  viewingPlace: 'Shop 12',
  channel: 'phones',
  durationSeconds: 600,
  paymentWindowHours: 48,
  antiSnipeSec: 60,
  condition: 'مستعملة',
  vendorName: 'Al Hani',
  autoRelist: true,
  opensMode: 'first_bid',
  scheduledLocal: '2030-01-01T20:00',
};

describe('INITIAL_FORM', () => {
  // Asserted by value, not just by shape: every other test in this file spreads
  // INITIAL_FORM, so a changed default would silently travel through all of them
  // and still go green. These are the defaults the previous form shipped with.
  it('carries the previous form defaults verbatim', () => {
    expect(INITIAL_FORM).toEqual({
      productName: '',
      startingPrice: '',
      condition: 'جديدة كلياً',
      specsText: '',
      vendorName: '',
      marketPrice: '',
      reservePrice: '',
      viewing: '',
      viewingPlace: '',
      channel: 'misc',
      opensMode: 'now',
      scheduledLocal: '',
      durationSeconds: 1800,
      paymentWindowHours: 24,
      antiSnipeSec: 30,
      autoRelist: false,
    });
  });
});

describe('afterCreateAnother', () => {
  it('keeps the ops settings the admin just chose', () => {
    const next = afterCreateAnother(filled);
    expect(next.channel).toBe('phones');
    expect(next.durationSeconds).toBe(600);
    expect(next.paymentWindowHours).toBe(48);
    expect(next.antiSnipeSec).toBe(60);
    expect(next.condition).toBe('مستعملة');
    expect(next.vendorName).toBe('Al Hani');
    expect(next.autoRelist).toBe(true);
    expect(next.opensMode).toBe('first_bid');
  });

  it('clears everything specific to the item just published', () => {
    const next = afterCreateAnother(filled);
    expect(next.productName).toBe('');
    expect(next.startingPrice).toBe('');
    expect(next.specsText).toBe('');
    expect(next.marketPrice).toBe('');
    expect(next.reservePrice).toBe('');
  });

  it('clears the picked start time even though the opens mode is kept', () => {
    // opensMode is a batch setting; a specific timestamp belongs to one lot. Keeping
    // it would re-open the next drop at a time chosen for the previous one.
    expect(afterCreateAnother(filled).scheduledLocal).toBe('');
  });

  it('always clears viewing, never carrying a location claim to a different item', () => {
    const next = afterCreateAnother(filled);
    expect(next.viewing).toBe('');
    expect(next.viewingPlace).toBe('');
  });

  it.each(['office', 'store', 'private'] as const)(
    'clears viewing unconditionally — including %s',
    (mode) => {
      // Every mode, not just the one in `filled`: a rule that clears 'store' but
      // carries 'office' still publishes a location claim about a different item.
      const next = afterCreateAnother({ ...filled, viewing: mode, viewingPlace: 'Shop 12' });
      expect(next.viewing).toBe('');
      expect(next.viewingPlace).toBe('');
    },
  );

  it('does not mutate the form it was given', () => {
    // It feeds setState; mutating prev would corrupt the published lot's own values.
    // Built from a literal rather than from `filled`: `filled` is shared across the
    // tests above, so a mutating implementation would already have emptied it and the
    // before/after snapshot would match by the time this ran. Every field here is
    // non-default and non-empty so clearing any one of them is visible.
    const input: DropFormValues = {
      productName: 'Galaxy S24',
      startingPrice: '99',
      condition: 'مستعملة',
      specsText: '512GB',
      vendorName: 'Al Hani',
      marketPrice: '400',
      reservePrice: '300',
      viewing: 'store',
      viewingPlace: 'Shop 12',
      channel: 'phones',
      opensMode: 'scheduled',
      scheduledLocal: '2030-01-01T20:00',
      durationSeconds: 600,
      paymentWindowHours: 48,
      antiSnipeSec: 60,
      autoRelist: true,
    };
    const before = { ...input };
    afterCreateAnother(input);
    expect(input).toEqual(before);
  });

  it('is idempotent — running it twice equals running it once', () => {
    expect(afterCreateAnother(afterCreateAnother(filled))).toEqual(afterCreateAnother(filled));
  });
});

describe('validateDropForm', () => {
  it('passes a minimally complete form', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10' }, NOW))
      .toEqual({});
  });

  it('flags a missing product name', () => {
    const e = validateDropForm({ ...INITIAL_FORM, startingPrice: '10' }, NOW);
    expect(e.productName).toBe('REQUIRED');
  });

  it('flags a whitespace-only product name', () => {
    const e = validateDropForm({ ...INITIAL_FORM, productName: '   ', startingPrice: '10' }, NOW);
    expect(e.productName).toBe('REQUIRED');
  });

  it('flags a missing or zero starting price', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x' }, NOW).startingPrice).toBe('REQUIRED');
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '0' }, NOW).startingPrice).toBe('REQUIRED');
  });

  it('flags a negative starting price', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '-5' }, NOW).startingPrice).toBe('REQUIRED');
  });

  it('flags a non-numeric starting price', () => {
    // '' and '0' both coerce to 0, so only this case exercises the non-finite guard.
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: 'abc' }, NOW).startingPrice).toBe('REQUIRED');
  });

  it('flags a scheduled drop with no time chosen', () => {
    const e = validateDropForm(
      { ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'scheduled' },
      NOW,
    );
    expect(e.scheduledLocal).toBe('REQUIRED');
  });

  it('flags a scheduled time in the past', () => {
    const e = validateDropForm(
      { ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'scheduled', scheduledLocal: '2020-01-01T20:00' },
      NOW,
    );
    expect(e.scheduledLocal).toBe('PAST');
  });

  it('does not flag timing for the now and first-bid modes', () => {
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'now' }, NOW).scheduledLocal).toBeUndefined();
    expect(validateDropForm({ ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'first_bid' }, NOW).scheduledLocal).toBeUndefined();
  });
});
