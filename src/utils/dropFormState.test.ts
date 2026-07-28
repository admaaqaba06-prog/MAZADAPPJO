import { describe, it, expect } from 'vitest';
import {
  INITIAL_FORM,
  afterCreateAnother,
  clearErrorsForField,
  dropErrorText,
  firstErrorField,
  validateDropForm,
  type DropFormValues,
} from './dropFormState';

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

describe('firstErrorField', () => {
  it('returns null for a clean form', () => {
    expect(firstErrorField({})).toBeNull();
  });

  it('returns the only problem when there is one', () => {
    expect(firstErrorField({ startingPrice: 'REQUIRED' })).toBe('startingPrice');
    expect(firstErrorField({ scheduledLocal: 'PAST' })).toBe('scheduledLocal');
  });

  it('returns the field highest in the form, not the first key in the object', () => {
    // Insertion order deliberately reversed relative to the form: this is the
    // whole reason the order is declared rather than read off Object.keys.
    expect(
      firstErrorField({ scheduledLocal: 'REQUIRED', startingPrice: 'REQUIRED', productName: 'REQUIRED' }),
    ).toBe('productName');
  });

  it('prefers starting price over timing when the name is fine', () => {
    expect(firstErrorField({ scheduledLocal: 'PAST', startingPrice: 'REQUIRED' })).toBe('startingPrice');
  });

  it('agrees with the order validateDropForm actually produces', () => {
    // Guards the pair, not each half: a field reordered in ERROR_FIELD_ORDER
    // without being reordered in the form would still pass the tests above.
    const all = validateDropForm(
      { ...INITIAL_FORM, productName: '', startingPrice: '', opensMode: 'scheduled', scheduledLocal: '' },
      NOW,
    );
    expect(Object.keys(all)).toEqual(['productName', 'startingPrice', 'scheduledLocal']);
    expect(firstErrorField(all)).toBe('productName');
  });

  it('still surfaces an error field it does not know the order of', () => {
    // A future validator key with no ordering entry must not make submit go
    // silent — better a missing scroll anchor than a dead button.
    expect(firstErrorField({ vendorName: 'REQUIRED' })).toBe('vendorName');
  });

  it.each(['productName', 'startingPrice', 'scheduledLocal'])(
    'prefers the ordered field %s over an unknown key that comes first in the object',
    (ordered) => {
      // Every ordered field, not just the first: a field dropped from the order
      // list still gets returned by the unknown-key fallback, so only an
      // unknown key sitting ahead of it exposes the missing entry.
      expect(firstErrorField({ vendorName: 'REQUIRED', [ordered]: 'REQUIRED' })).toBe(ordered);
    },
  );

  it('treats an empty code as no error, ordered or not', () => {
    expect(firstErrorField({ productName: '' })).toBeNull();
    expect(firstErrorField({ vendorName: '' })).toBeNull();
    expect(firstErrorField({ productName: '', startingPrice: 'REQUIRED' })).toBe('startingPrice');
  });
});

describe('dropErrorText', () => {
  it('says nothing when there is no error', () => {
    expect(dropErrorText(undefined, false)).toBe('');
    expect(dropErrorText(undefined, true)).toBe('');
    expect(dropErrorText('', false)).toBe('');
    expect(dropErrorText('', true)).toBe('');
  });

  it('explains a past start time in both languages', () => {
    expect(dropErrorText('PAST', false)).toBe('Start time must be in the future');
    expect(dropErrorText('PAST', true)).toBe('وقت البدء يجب أن يكون في المستقبل');
  });

  it('explains a required field in both languages', () => {
    expect(dropErrorText('REQUIRED', false)).toBe('This field is required');
    expect(dropErrorText('REQUIRED', true)).toBe('هذا الحقل مطلوب');
  });

  it('falls back to "required" for a code it does not recognise', () => {
    expect(dropErrorText('SOMETHING_NEW', false)).toBe('This field is required');
    expect(dropErrorText('SOMETHING_NEW', true)).toBe('هذا الحقل مطلوب');
  });

  it('never returns the same sentence for both languages', () => {
    // The team is mixed and neither language is a fallback; a copy-paste that
    // returns the English string from the Arabic branch reads as shipped.
    for (const code of ['PAST', 'REQUIRED', 'SOMETHING_NEW']) {
      expect(dropErrorText(code, true)).not.toBe(dropErrorText(code, false));
    }
  });

  it('covers every code validateDropForm can emit', () => {
    // Pins the pair: a new code added to the validator with no message here
    // would render an empty red span under the field.
    const emitted = new Set([
      ...Object.values(validateDropForm({ ...INITIAL_FORM, opensMode: 'scheduled' }, NOW)),
      ...Object.values(
        validateDropForm(
          { ...INITIAL_FORM, productName: 'x', startingPrice: '10', opensMode: 'scheduled', scheduledLocal: '2020-01-01T20:00' },
          NOW,
        ),
      ),
    ]);
    expect(emitted).toEqual(new Set(['REQUIRED', 'PAST']));
    for (const code of emitted) {
      expect(dropErrorText(code, false).length).toBeGreaterThan(0);
      expect(dropErrorText(code, true).length).toBeGreaterThan(0);
    }
  });
});

describe('clearErrorsForField', () => {
  // The shipped defect: Create on an empty form correctly marked Product name
  // and Starting price, then typing a valid value into either left the red
  // message underneath it until the next submit.
  // A FACTORY, not a shared constant. A mutating implementation would empty a
  // shared fixture in the first test that ran, and every later test — including
  // the mutation test below — would then be handed the already-emptied map and
  // pass on it. (That is not hypothetical: it is exactly what a shared literal
  // did here, and it made the no-mutation test unable to fail.)
  const bothRequired = () => ({ productName: 'REQUIRED', startingPrice: 'REQUIRED' });

  it('clears the error on the field that changed', () => {
    expect(clearErrorsForField(bothRequired(), 'productName')).toEqual({
      startingPrice: 'REQUIRED',
    });
  });

  it('leaves the errors on other fields alone', () => {
    // Fixing one field must not quietly hide the rest of the submit's verdict.
    expect(clearErrorsForField(bothRequired(), 'startingPrice')).toEqual({
      productName: 'REQUIRED',
    });
  });

  it('does not mutate the map it was given', () => {
    // It feeds setErrors; mutating the previous state in place is a React
    // update that may never render.
    const errors = bothRequired();
    const before = { ...errors };
    clearErrorsForField(errors, 'productName');
    expect(errors).toEqual(before);
  });

  it('returns the same object when there is nothing to clear', () => {
    // Identity, not just equality: setErrors with the same reference is what
    // stops every keystroke on a clean form from re-rendering the view.
    const errors = { productName: 'REQUIRED' };
    expect(clearErrorsForField(errors, 'startingPrice')).toBe(errors);
    expect(clearErrorsForField({}, 'productName')).toEqual({});
  });

  it('clears the timing error when the Opens mode changes', () => {
    // The timing error is keyed `scheduledLocal` because that is the input it
    // renders under, but the Opens buttons are what decide whether a start time
    // is needed at all — and switching away unmounts the picker, so nothing
    // else can ever clear it.
    expect(clearErrorsForField({ scheduledLocal: 'REQUIRED' }, 'opensMode')).toEqual({});
    expect(clearErrorsForField({ scheduledLocal: 'PAST' }, 'opensMode')).toEqual({});
  });

  it('clears the timing error when the start time itself changes', () => {
    expect(clearErrorsForField({ scheduledLocal: 'PAST' }, 'scheduledLocal')).toEqual({});
  });

  it('does not let an Opens change clear anything but the timing error', () => {
    expect(clearErrorsForField({ ...bothRequired(), scheduledLocal: 'PAST' }, 'opensMode'))
      .toEqual(bothRequired());
  });

  it('clears every error validateDropForm can raise, from its own field', () => {
    // Pins the pair the way the dropErrorText test above does: an error keyed
    // under a name no field change touches would be unclearable by typing.
    const raised = validateDropForm({ ...INITIAL_FORM, opensMode: 'scheduled' }, NOW);
    expect(Object.keys(raised).length).toBeGreaterThan(0);
    for (const key of Object.keys(raised)) {
      // Every code the validator raises is keyed under a field name, so
      // changing the field of that name is what has to retire it.
      expect(clearErrorsForField(raised, key as keyof DropFormValues)[key]).toBeUndefined();
    }
  });
});
