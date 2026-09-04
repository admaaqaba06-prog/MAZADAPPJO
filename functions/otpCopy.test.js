// The OTP message is the most-read thing the product sends. It had no tests,
// because it did not live here — it lived in the n8n Send OTP node, and the
// wording that shipped named a retired brand for as long as nobody happened to
// read a message.
import { describe, it, expect } from 'vitest';
const { otpMessage, normalizeLang, arabicMinutes, BRAND_AR, BRAND_EN } = require('./otpCopy.js');
const { OTP_TTL_MS } = require('./whatsappOtp.js');

describe('otpMessage', () => {
  it('carries the code verbatim', () => {
    // The entire purpose of the message.
    expect(otpMessage('422561')).toContain('422561');
    expect(otpMessage('422561', 'en')).toContain('422561');
  });

  it('names the live brand, in the reader language', () => {
    expect(otpMessage('123456')).toContain(BRAND_AR);
    expect(otpMessage('123456', 'en')).toContain(BRAND_EN);
  });

  it('NEVER names the retired brand', () => {
    // The defect this file exists to prevent. The live n8n text read
    // «رمز الدخول إلى مزاد جو» — a brand we are not allowed to print.
    for (const lang of ['ar', 'en', undefined, 'fr']) {
      const m = otpMessage('123456', lang);
      expect(m).not.toMatch(/مزاد جو|مزادجو/);
      expect(m.toLowerCase()).not.toContain('mazad jo');
      expect(m.toLowerCase()).not.toContain('mazad-jo');
    }
  });

  it('derives the validity from OTP_TTL_MS instead of restating it', () => {
    // n8n hardcoded "10 دقائق" beside a constant it could not see. They agreed
    // by luck; nothing held them together.
    const minutes = Math.round(OTP_TTL_MS / 60000);
    expect(otpMessage('123456', 'en')).toContain(`Valid for ${minutes} minute`);
    expect(otpMessage('123456')).toContain(arabicMinutes(minutes));
  });

  it('states the validity the live message stated, so this is not a copy change', () => {
    // Cross-check against what customers already receive: 10 minutes, which
    // OTP_TTL_MS confirms. Repatriating the copy must not silently reword it.
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(otpMessage('123456')).toContain('صالح لـ10 دقائق');
  });

  it('tells the reader not to share it', () => {
    expect(otpMessage('123456')).toContain('لا تشاركه مع أي أحد');
    expect(otpMessage('123456', 'en')).toContain('Do not share it with anyone');
  });

  it('puts the code on its own line, away from the prose', () => {
    // Both platforms' code autofill keys off a clearly delimited code, and a
    // reader copying by hand should not have to select around a sentence.
    expect(otpMessage('422561').split('\n')[0]).toContain('422561');
  });

  it('falls back to Arabic for anything that is not exactly "en"', () => {
    // Same shape and same safe direction as messageCopy.js resolveLang(): an
    // Arabic-only reader must never be sent English by accident.
    for (const junk of [undefined, null, '', 'EN', 'ar-JO', 'fr', 7, {}, []]) {
      expect(otpMessage('123456', junk)).toContain(BRAND_AR);
    }
    expect(normalizeLang('en')).toBe('en');
    expect(normalizeLang('EN')).toBe('ar');
  });

  it('never throws, whatever the code argument is', () => {
    // It renders on the sign-in path. A render that throws would take the
    // callable with it, and the code is already committed by then.
    for (const c of [undefined, null, '', 0, 123456, {}, []]) {
      expect(() => otpMessage(c)).not.toThrow();
      expect(typeof otpMessage(c)).toBe('string');
    }
  });
});

describe('arabicMinutes', () => {
  it('counts the noun the way Arabic counts it', () => {
    // A bare `${n} دقائق` is wrong for every value except the 3-10 band, and the
    // number is derived — so changing OTP_TTL_MS must not produce
    // «صالح لـ1 دقائق» in the most-read message the product sends.
    expect(arabicMinutes(1)).toBe('دقيقة واحدة');
    expect(arabicMinutes(2)).toBe('دقيقتين');
    expect(arabicMinutes(3)).toBe('3 دقائق');
    expect(arabicMinutes(10)).toBe('10 دقائق');
    expect(arabicMinutes(11)).toBe('11 دقيقة');
    expect(arabicMinutes(30)).toBe('30 دقيقة');
  });
});
