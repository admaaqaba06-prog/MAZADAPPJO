import { describe, it, expect } from 'vitest';
import { cleanTitle } from './listingTitle';

describe('cleanTitle', () => {
  // Every title below is REAL, read out of the production auctions collection.
  it('strips WhatsApp bold markers', () => {
    expect(cleanTitle('⌚  *Apple Watch Ultra* – مستعملة')).toBe('Apple Watch Ultra – مستعملة');
  });

  it('strips a leading decorative emoji', () => {
    expect(cleanTitle('📺 * شاشة *Skyworth 43 بوصة QLED 2K Google TV*'))
      .toBe('شاشة Skyworth 43 بوصة QLED 2K Google TV');
  });

  it('strips a doubled star run', () => {
    expect(cleanTitle('📿 ** سبحة فضة إسترلينية عيار *925*')).toBe('سبحة فضة إسترلينية عيار 925');
  });

  it('strips the leaked "product name:" label', () => {
    // A paste from the drop template left the field label in the title.
    expect(cleanTitle('اسم المنتج:* ميكروويف منزلي رقمي عملاق')).toBe('ميكروويف منزلي رقمي عملاق');
  });

  it('strips a TRUNCATED product-name label', () => {
    // The 48-char storage limit clipped the label's own first letters, so the
    // remembered prefix is not always the full phrase.
    expect(cleanTitle('سم المنتج:* مكيف *General Plus DC Inverter*')).toBe('مكيف General Plus DC Inverter');
    expect(cleanTitle('م المنتج:* مكيف')).toBe('مكيف');
  });

  it('collapses the whitespace the stripping leaves behind', () => {
    expect(cleanTitle('🧺*  غسالة  *Daewoo*   أوتوماتيك')).toBe('غسالة Daewoo أوتوماتيك');
  });

  it('keeps a title that is already clean untouched', () => {
    expect(cleanTitle('Lenovo ThinkPad L13 Yoga')).toBe('Lenovo ThinkPad L13 Yoga');
    expect(cleanTitle('طاولة زجاج مودرن')).toBe('طاولة زجاج مودرن');
  });

  it('keeps meaningful punctuation inside the title', () => {
    // Only decoration is removed. Model numbers, parentheses, slashes and
    // dashes carry information a buyer needs.
    expect(cleanTitle('مكنسة *Panasonic MC-CG713')).toBe('مكنسة Panasonic MC-CG713');
    expect(cleanTitle('خلاط يدوي (بلندر) براون Braun MultiQuick 3'))
      .toBe('خلاط يدوي (بلندر) براون Braun MultiQuick 3');
    expect(cleanTitle('مقلى هواء/قلاية هوائية')).toBe('مقلى هواء/قلاية هوائية');
  });

  it('never returns only whitespace, and never throws on junk input', () => {
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle('   ')).toBe('');
    expect(cleanTitle('***')).toBe('');
    expect(cleanTitle(null)).toBe('');
    expect(cleanTitle(undefined)).toBe('');
  });

  it('falls back to the original when cleaning would empty a real title', () => {
    // A title made ENTIRELY of emoji is still the only name that lot has.
    // Blanking it would be worse than showing it.
    expect(cleanTitle('🔥🔥🔥')).toBe('🔥🔥🔥');
  });
});
