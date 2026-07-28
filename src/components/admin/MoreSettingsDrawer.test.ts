import { describe, it, expect, vi } from 'vitest';
import { summarizeSettings } from './MoreSettingsDrawer';
import { INITIAL_FORM } from '../../utils/dropFormState';

// The two free-text values on the summary line (condition, vendor) ship wrapped
// in U+2068 FIRST STRONG ISOLATE / U+2069 POP DIRECTIONAL ISOLATE so a value in
// the other direction cannot reorder the parts around it. Named here rather
// than pasted in: both characters are invisible in the source.
const FSI = '\u2068';
const PDI = '\u2069';
const iso = (s: string) => `${FSI}${s}${PDI}`;

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
    // The default condition is Arabic and stays Arabic (it is buyer-facing and
    // publishes in the caption), so on this otherwise-English line it arrives
    // fenced by isolates. Without them the browser reordered the run either
    // side of it and the panel read "30 · جديدة كلياً min · pay within 24h · …".
    expect(summarizeSettings(INITIAL_FORM, false)).toBe(
      `${iso('جديدة كلياً')} · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated`,
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
      `${iso('جديدة كلياً')} · 30 دقيقة · مهلة الدفع 24 ساعة · حماية من القنص 30 ثانية · بدون سعر احتياطي · المعاينة غير محددة`,
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
    expect(s.startsWith(`${iso('مستعملة')} · `)).toBe(true);
    expect(summarizeSettings({ ...INITIAL_FORM, condition: 'مستعملة' }, true).startsWith(`${iso('مستعملة')} · `))
      .toBe(true);
  });

  it('says the condition is missing rather than showing a gap', () => {
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '' }, false))
      .toBe('condition not set · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated');
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '   ' }, true))
      .toContain('الحالة غير محددة');
  });

  it('trims a padded condition', () => {
    // The padding is trimmed INSIDE the isolate, not left to pad it out.
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '  مستعملة  ' }, false))
      .toContain(`${iso('مستعملة')} · 30 min`);
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
    expect(summarizeSettings({ ...INITIAL_FORM, vendorName: '  Acme  ' }, false)).toContain(`vendor ${iso('Acme')}`);
    expect(summarizeSettings({ ...INITIAL_FORM, vendorName: 'Acme' }, true)).toContain(`المورّد ${iso('Acme')}`);
  });

  it('puts the optional tail parts last, in order', () => {
    const s = summarizeSettings(
      { ...INITIAL_FORM, autoRelist: true, vendorName: 'Acme' },
      false,
    );
    expect(s).toBe(
      `${iso('جديدة كلياً')} · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated · auto-relist · vendor ${iso('Acme')}`,
    );
  });

  // --- bidi: free text cannot reorder the line ------------------------------
  // The shipped English line read "30 · جديدة كلياً min · pay within 24h · …":
  // the browser's bidi algorithm pulled the neutral "·" and the latin/numeric
  // runs next to the Arabic condition into the Arabic run's own order. The
  // values themselves are correct and deliberate (the default condition is
  // Arabic because it publishes into the Arabic caption) — what has to change
  // is that they are fenced, so a right-to-left value cannot move anything
  // outside itself.

  /**
   * Every strong right-to-left character in `s` that is NOT inside an
   * FSI…PDI pair. Bidi reordering across a part boundary is only possible from
   * an unfenced strong run, so an empty result is the property under test.
   */
  const unfencedRtl = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    for (const ch of s) {
      if (ch === FSI) depth += 1;
      else if (ch === PDI) depth = Math.max(0, depth - 1);
      else if (depth === 0 && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(ch)) out.push(ch);
    }
    return out;
  };

  it('fences every RTL value on the English line', () => {
    const s = summarizeSettings(
      { ...INITIAL_FORM, condition: 'مستعملة', vendorName: 'شركة النور' },
      false,
    );
    expect(unfencedRtl(s)).toEqual([]);
    // ...and the parts are still in their own order, undivided.
    expect(s).toBe(
      `${iso('مستعملة')} · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated · vendor ${iso('شركة النور')}`,
    );
  });

  it('fences the default condition, which is the value that shipped scrambled', () => {
    expect(unfencedRtl(summarizeSettings(INITIAL_FORM, false))).toEqual([]);
  });

  it('fences a latin value on the Arabic line too', () => {
    // The mirror case: an LTR vendor name inside an RTL line. `20 Acme` next to
    // a number would reorder the same way with nothing to fence it.
    const s = summarizeSettings({ ...INITIAL_FORM, vendorName: 'Acme 20' }, true);
    expect(s.endsWith(`المورّد ${iso('Acme 20')}`)).toBe(true);
  });

  it('leaves the isolates balanced', () => {
    for (const isAr of [true, false]) {
      const s = summarizeSettings(
        { ...INITIAL_FORM, condition: 'مستعملة', vendorName: 'Acme', autoRelist: true, reservePrice: '300' },
        isAr,
      );
      expect(s.split(FSI).length).toBe(s.split(PDI).length);
      // Two fenced values on this line: condition and vendor. Nothing else is
      // free text, and fencing our own literals would be noise.
      expect(s.split(FSI).length - 1).toBe(2);
    }
  });

  it('does not fence the localised fallbacks, which are ours', () => {
    // "condition not set" is our own literal in the line's own language — it
    // cannot be in the wrong direction, so it needs no fence.
    expect(summarizeSettings({ ...INITIAL_FORM, condition: '' }, false)).not.toContain(FSI);
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
