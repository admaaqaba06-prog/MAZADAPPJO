import { describe, it, expect, vi } from 'vitest';
import { summarizeSettings } from './MoreSettingsDrawer';
import { INITIAL_FORM } from '../../utils/dropFormState';

describe('summarizeSettings — numerals go through the one formatter', () => {
  // Western digits in Arabic means `formatNumeral(n, true)` and `${n}` render
  // the same today, so no assertion on the summary text can tell whether this
  // file still routes through the shared module. Standing the formatter in for
  // a marker pins the wiring itself — which is what CF3 actually asked for.
  it('formats every number with formatNumeral, in both languages', async () => {
    vi.resetModules();
    vi.doMock('../../utils/arabicNumerals', () => ({
      formatNumeral: (value: number | string) => `«${value}»`,
    }));
    try {
      const mod = await import('./MoreSettingsDrawer');
      const values = { ...INITIAL_FORM, reservePrice: '300' };
      const ar = mod.summarizeSettings(values, true);
      expect(ar).toContain('«30» دقيقة');
      expect(ar).toContain('مهلة الدفع «24» ساعة');
      expect(ar).toContain('حماية من القنص «30» ثانية');
      expect(ar).toContain('سعر احتياطي «300» دينار');
      const en = mod.summarizeSettings(values, false);
      expect(en).toContain('«30» min');
      expect(en).toContain('pay within «24»h');
      expect(en).toContain('anti-snipe «30»s');
      expect(en).toContain('reserve «300» JOD');
    } finally {
      vi.doUnmock('../../utils/arabicNumerals');
      vi.resetModules();
    }
  });
});

describe('summarizeSettings — the line under the collapsed drawer', () => {
  it('describes the shipped defaults in English', () => {
    expect(summarizeSettings(INITIAL_FORM, false)).toBe(
      'جديدة كلياً · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated',
    );
  });

  it('describes the shipped defaults in Arabic', () => {
    // Pins the Arabic ORDER and separator too, not just membership. The English
    // exact-match above cannot catch an Arabic-only reordering.
    //
    // The payment window was '٢٤' here and Western either side of it, which is
    // the mixed-numeral line utils/arabicNumerals.ts now removes. Every number
    // on this line is Western, matching formatMoney's app-wide decision.
    expect(summarizeSettings(INITIAL_FORM, true)).toBe(
      'جديدة كلياً · 30 دقيقة · مهلة الدفع 24 ساعة · حماية من القنص 30 ثانية · بدون سعر احتياطي · المعاينة غير محددة',
    );
  });

  it('never mixes digit systems on the Arabic line', () => {
    // The regression this guards is subtler than a wrong number: one part in a
    // different numeral system than its neighbours on the SAME line.
    for (const values of [
      INITIAL_FORM,
      { ...INITIAL_FORM, paymentWindowHours: 24, antiSnipeSec: 30 },
      { ...INITIAL_FORM, paymentWindowHours: 72, antiSnipeSec: 15, reservePrice: '300' },
    ]) {
      expect(summarizeSettings(values, true)).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it('reports a reserve once one is set', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, reservePrice: '300' }, false))
      .toContain('reserve 300 JOD');
  });

  it('reports the viewing mode once one is chosen', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'office' }, false))
      .toContain('viewing at our office');
  });

  it('reports auto-relist only when enabled', () => {
    expect(summarizeSettings(INITIAL_FORM, false)).not.toContain('auto-relist');
    expect(summarizeSettings({ ...INITIAL_FORM, autoRelist: true }, false))
      .toContain('auto-relist');
  });

  it('renders in Arabic when asked', () => {
    const s = summarizeSettings(INITIAL_FORM, true);
    expect(s).toContain('بدون سعر احتياطي');
    expect(s).toContain('مهلة الدفع 24 ساعة');
  });

  // --- condition: the carry-forward requirement from Task 3 ---------------
  // `condition` is buyer-facing AND is deliberately kept across "create
  // another". If the collapsed drawer hid it, a stale "جديدة كلياً" could ride
  // onto a used lot. It must therefore be visible on the summary line — and
  // FIRST, where it cannot be missed.

  it('leads with the condition so a stale one is re-confirmable', () => {
    const s = summarizeSettings({ ...INITIAL_FORM, condition: 'مستعملة' }, false);
    expect(s.startsWith('مستعملة · ')).toBe(true);
    expect(summarizeSettings({ ...INITIAL_FORM, condition: 'مستعملة' }, true).startsWith('مستعملة · '))
      .toBe(true);
  });

  it('says the condition is missing rather than showing a gap', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '' }, false))
      .toBe('condition not set · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated');
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '   ' }, true))
      .toContain('الحالة غير محددة');
  });

  it('trims a padded condition', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '  مستعملة  ' }, false))
      .toContain('مستعملة · 30 min');
  });

  // --- the numeric fields, off their defaults ------------------------------

  it('converts the duration from seconds to minutes', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, durationSeconds: 600 }, false)).toContain('10 min');
    expect(summarizeSettings({ ...INITIAL_FORM, durationSeconds: 900 }, true)).toContain('15 دقيقة');
  });

  it('reports a non-default payment window in both languages', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, paymentWindowHours: 72 }, false))
      .toContain('pay within 72h');
    expect(summarizeSettings({ ...INITIAL_FORM, paymentWindowHours: 12 }, true))
      .toContain('مهلة الدفع 12 ساعة');
  });

  it('reports a non-default anti-snipe window in both languages', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, antiSnipeSec: 60 }, false))
      .toContain('anti-snipe 60s');
    expect(summarizeSettings({ ...INITIAL_FORM, antiSnipeSec: 15 }, true))
      .toContain('حماية من القنص 15 ثانية');
  });

  // --- reserve -------------------------------------------------------------

  it('reports a reserve in Arabic too', () => {
    const s = summarizeSettings({ ...INITIAL_FORM, reservePrice: '300' }, true);
    expect(s).toContain('سعر احتياطي 300 دينار');
    expect(s).not.toContain('بدون سعر احتياطي');
  });

  it('treats a zero or unparseable reserve as no reserve', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, reservePrice: '0' }, false)).toContain('no reserve');
    expect(summarizeSettings({ ...INITIAL_FORM, reservePrice: 'abc' }, false)).toContain('no reserve');
    expect(summarizeSettings({ ...INITIAL_FORM, reservePrice: '-5' }, false)).toContain('no reserve');
  });

  // --- viewing -------------------------------------------------------------

  it('names every viewing mode distinctly in English', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'office' }, false)).toContain('viewing at our office');
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'store' }, false)).toContain('viewing at the seller');
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'private' }, false)).toContain('no viewing');
  });

  it('names every viewing mode distinctly in Arabic', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'office' }, true)).toContain('معاينة بمكاتبنا');
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'store' }, true)).toContain('معاينة عند البائع');
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'private' }, true)).toContain('بدون معاينة');
  });

  it('does not claim "not stated" once a mode is chosen', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'private' }, false)).not.toContain('viewing not stated');
    expect(summarizeSettings({ ...INITIAL_FORM, viewing: 'private' }, true)).not.toContain('المعاينة غير محددة');
  });

  // --- auto-relist + vendor: the two conditional tail parts -----------------

  it('reports auto-relist in Arabic', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, autoRelist: true }, true))
      .toContain('إعادة إدراج تلقائية');
  });

  it('reports the vendor only when one is named', () => {
    expect(summarizeSettings(INITIAL_FORM, false)).not.toContain('vendor');
    expect(summarizeSettings({ ...INITIAL_FORM, vendorName: '   ' }, false)).not.toContain('vendor');
    expect(summarizeSettings({ ...INITIAL_FORM, vendorName: '  Acme  ' }, false)).toContain('vendor Acme');
    expect(summarizeSettings({ ...INITIAL_FORM, vendorName: 'Acme' }, true)).toContain('المورّد Acme');
  });

  it('puts the optional tail parts last, in order', () => {
    const s = summarizeSettings(
      { ...INITIAL_FORM, autoRelist: true, vendorName: 'Acme' },
      false,
    );
    expect(s).toBe(
      'جديدة كلياً · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated · auto-relist · vendor Acme',
    );
  });

  // --- purity ---------------------------------------------------------------

  it('does not mutate the form it summarises', () => {
    const values = { ...INITIAL_FORM, condition: '  مستعملة  ', vendorName: '  Acme  ' };
    const before = JSON.stringify(values);
    summarizeSettings(values, false);
    summarizeSettings(values, true);
    expect(JSON.stringify(values)).toBe(before);
  });
});
