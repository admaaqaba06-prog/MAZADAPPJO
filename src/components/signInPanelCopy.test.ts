// Copy for the sign-in marketing panel.
//
// This text is the first thing a cold visitor reads, and a marketing surface is
// exactly where claims the product cannot keep tend to appear. These tests
// therefore check what the copy does NOT say as hard as what it does.
import { describe, it, expect } from 'vitest';
import { panelCopy } from './signInPanelCopy';

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

describe('panelCopy', () => {
  it('gives every field in both languages, non-empty', () => {
    for (const lang of ['ar', 'en'] as const) {
      const c = panelCopy(lang);
      expect(c.trustTitle.trim(), lang).not.toBe('');
      expect(c.trustBody.trim(), lang).not.toBe('');
      expect(c.howTitle.trim(), lang).not.toBe('');
      expect(c.activityLabel(3).trim(), lang).not.toBe('');
      expect(c.steps, lang).toHaveLength(3);
      c.steps.forEach((s, i) => expect(s.trim(), `${lang}.step${i}`).not.toBe(''));
    }
  });

  it('does not leak one language into the other', () => {
    const en = panelCopy('en');
    const enAll = [en.trustTitle, en.trustBody, en.howTitle, ...en.steps].join(' ');
    expect(ARABIC.test(enAll)).toBe(false);

    const ar = panelCopy('ar');
    const arAll = [ar.trustTitle, ar.trustBody, ar.howTitle, ...ar.steps].join(' ');
    expect(ARABIC.test(arAll)).toBe(true);
    // The Arabic must be written, not a half-translated string with English left in.
    expect(LATIN.test(arAll)).toBe(false);
  });

  it('states escrow in the terms the product already uses', () => {
    // Condensed from src/landing/translations.ts:551 (EN) / :309 (AR). The claim
    // must not drift from the one already approved and already shown elsewhere.
    const en = panelCopy('en').trustBody.toLowerCase();
    expect(en).toMatch(/hold/);
    expect(en).toMatch(/confirm|approve|receive/);
    const ar = panelCopy('ar').trustBody;
    expect(ar).toMatch(/يحتفظ|نحتفظ/);
  });

  it('promises nothing the product does not do', () => {
    // Each of these is a claim Mazzado makes nowhere else. A marketing panel is
    // where they would first appear, and they would be lies.
    for (const lang of ['ar', 'en'] as const) {
      const c = panelCopy(lang);
      const all = [c.trustTitle, c.trustBody, c.howTitle, ...c.steps, c.activityLabel(3)].join(' ');
      expect(all, lang).not.toMatch(/free shipping|شحن مجاني/i);
      expect(all, lang).not.toMatch(/guarantee|ضمان|نضمن/i);
      expect(all, lang).not.toMatch(/refund|استرداد|نرجع/i);
      expect(all, lang).not.toMatch(/24 hours|next day|خلال 24|اليوم التالي/i);
      expect(all, lang).not.toMatch(/cheapest|best price|أرخص|أفضل سعر/i);
      expect(all, lang).not.toMatch(/verified sellers|بائعون موثوقون/i);
    }
  });

  it('does not claim the buyer fee is absent — there is a 5% fee', () => {
    // translations.ts:309 states a 5% buyer commission on winning. Saying or
    // implying "no fees" here would contradict it.
    for (const lang of ['ar', 'en'] as const) {
      const c = panelCopy(lang);
      const all = [c.trustTitle, c.trustBody, c.howTitle, ...c.steps].join(' ');
      expect(all, lang).not.toMatch(/no fees|free to buy|بدون رسوم|مجاناً/i);
    }
  });

  it('uses Western digits in Arabic, per ARABIC_UI_DIGITS', () => {
    const c = panelCopy('ar');
    const all = [c.trustBody, ...c.steps, c.activityLabel(147)].join(' ');
    expect(all).not.toMatch(/[٠-٩]/);
  });

  it('interpolates the real count into the activity label', () => {
    expect(panelCopy('en').activityLabel(147)).toContain('147');
    expect(panelCopy('ar').activityLabel(147)).toContain('147');
    // …and does not hardcode a number.
    expect(panelCopy('en').activityLabel(2)).toContain('2');
    expect(panelCopy('en').activityLabel(2)).not.toContain('147');
  });

  it('mentions CliQ, the only payment rail the product has', () => {
    expect(panelCopy('en').steps.join(' ')).toMatch(/cliq/i);
    expect(panelCopy('ar').steps.join(' ')).toMatch(/كليك/);
  });

  it('takes an unknown language as Arabic, like every other renderer here', () => {
    // Matches resolveLang (functions/messageCopy.js) and copyFor.
    for (const junk of ['fr', 'EN', '', null, undefined, 7, {}]) {
      expect(panelCopy(junk as never).trustBody, String(junk)).toBe(panelCopy('ar').trustBody);
    }
  });
});
