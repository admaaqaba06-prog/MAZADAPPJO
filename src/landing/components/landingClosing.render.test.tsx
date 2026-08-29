/**
 * Executes pricing, the FAQ accordion and the footer.
 *
 * Two different risks live in these sections. The first is COMMERCIAL: a price
 * here that the server does not charge sends a customer into a payment that
 * cannot succeed, so the rendered prices are asserted against
 * `SUBSCRIPTION_TIERS` — itself a mirror of functions/subscriptionTiers.js, from
 * which the server derives every grant. The second is CONTACT DETAIL: a support
 * number that is wrong in one place is worse than none, because whoever dials it
 * believes they reached us. Both are checked against the repository constants
 * rather than against strings written here.
 *
 * `renderToStaticMarkup` runs no effects and dispatches no events, so the
 * accordion is asserted in its INITIAL state. That is the state that matters
 * most anyway: it is what ships before JavaScript runs.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { landingContent } from '../landingContent';
import { SUBSCRIPTION_TIERS } from '../../constants/subscriptionTiers';
import {
  SUPPORT_PHONE_NATIONAL,
  SUPPORT_PHONE_TEL,
  SOCIAL_INSTAGRAM_URL,
} from '../../constants/support';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { LandingPricingFaq } from './LandingPricingFaq';
import { LandingFooter } from './LandingFooter';

const AR = landingContent.ar;
const EN = landingContent.en;
const WA = 'https://wa.me/962785168550';

/**
 * Content as it appears in MARKUP. React escapes `&`, so the approved label
 * "Terms & conditions" renders as "Terms &amp; conditions" — asserting the raw
 * string fails against correct output. Escaping here rather than loosening the
 * assertion keeps it an exact-match on the rendered text.
 */
const asRendered = (text: string) => text.replace(/&/g, '&amp;');

const pricing = (lang: 'ar' | 'en' = 'en') =>
  renderToStaticMarkup(
    <LandingPricingFaq
      pricing={landingContent[lang].pricing}
      faq={landingContent[lang].faq}
      onSubscribe={() => {}}
    />
  );

const footer = (lang: 'ar' | 'en' = 'en', whatsappUrl = WA) =>
  renderToStaticMarkup(
    <LandingFooter
      copy={landingContent[lang].footer}
      onBrowse={() => {}}
      onSell={() => {}}
      onRules={() => {}}
      onTerms={() => {}}
      onPrivacy={() => {}}
      whatsappUrl={whatsappUrl}
    />
  );

describe('LandingPricingFaq — the commercial claims', () => {
  it('renders every canonical tier at the price the server charges', () => {
    const html = pricing('en');
    const ids = Object.keys(SUBSCRIPTION_TIERS) as Array<keyof typeof SUBSCRIPTION_TIERS>;
    expect((html.match(/data-plan=/g) ?? [])).toHaveLength(ids.length);
    for (const id of ids) {
      expect(html, `missing plan ${id}`).toContain(`data-plan="${id}"`);
      expect(html).toContain(`${SUBSCRIPTION_TIERS[id].price} JOD`);
    }
  });

  it('advertises no price the tier table does not contain', () => {
    // A stray "2 JOD" from a copy edit is the failure this catches.
    const html = pricing('en');
    const advertised = [...html.matchAll(/(\d+)\s*JOD/g)].map(m => Number(m[1]));
    const allowed = Object.values(SUBSCRIPTION_TIERS).map(t => t.price);
    expect([...new Set(advertised)].sort()).toEqual([...new Set(allowed)].sort());
  });

  it('keeps the buyer premium visible where a bidder will read it', () => {
    for (const lang of ['ar', 'en'] as const) {
      const html = pricing(lang);
      expect(html).toContain(landingContent[lang].pricing.buyerPremiumLabel);
      expect(html).toContain(landingContent[lang].pricing.buyerPremiumNote);
      expect(html).toMatch(/5\s*[%٪]/);
    }
  });

  it('states that bidding needs no deposit, which is the policy', () => {
    expect(pricing('en')).toContain(EN.pricing.noDepositNote);
  });

  it('offers one subscribe action per plan and nothing else', () => {
    const html = pricing('en');
    expect((html.match(/data-subscribe/g) ?? [])).toHaveLength(3);
    expect(html).toContain(EN.pricing.cta);
  });

  it('marks a recommended plan only where the content declares one', () => {
    const html = pricing('en');
    for (const plan of EN.pricing.plans) {
      if (plan.badge) expect(html, `missing badge for ${plan.id}`).toContain(plan.badge);
    }
    // The monthly tier carries no badge; nothing may invent one for it.
    expect((html.match(/data-plan-badge/g) ?? [])).toHaveLength(
      EN.pricing.plans.filter(p => p.badge).length
    );
  });

  it('anchors the pricing section where the header links', () => {
    expect(pricing('en')).toContain('id="pricing"');
  });

  it('renders Arabic, and English with no Arabic leaking through', () => {
    expect(pricing('ar')).toContain(AR.pricing.plans[0].name);
    expect(pricing('en')).not.toMatch(/[؀-ۿ]/);
  });
});

describe('LandingPricingFaq — the accordion', () => {
  it('renders one control per question, each a real button', () => {
    const html = pricing('en');
    expect((html.match(/data-faq-control/g) ?? [])).toHaveLength(EN.faq.items.length);
    for (const item of EN.faq.items) expect(html).toContain(item.q);
  });

  it('gives every control an aria-expanded state', () => {
    const html = pricing('en');
    const states = html.match(/data-faq-control[^>]*aria-expanded="(true|false)"/g) ?? [];
    expect(states).toHaveLength(EN.faq.items.length);
  });

  it('points every control at a panel that actually exists', () => {
    const html = pricing('en');
    const controlled = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(m => m[1]);
    expect(controlled).toHaveLength(EN.faq.items.length);
    for (const id of controlled) {
      expect(html, `aria-controls="${id}" points at nothing`).toContain(`id="${id}"`);
    }
    expect(new Set(controlled).size).toBe(controlled.length);
  });

  it('labels every panel by the control that opens it', () => {
    const html = pricing('en');
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(m => m[1]);
    expect(labelled).toHaveLength(EN.faq.items.length);
    for (const id of labelled) expect(html).toContain(`id="${id}"`);
  });

  it('opens exactly one answer at a time', () => {
    // Single-open is the contract. Shipping with all of them expanded, or with
    // two, is what makes a six-item FAQ a wall of text.
    const html = pricing('en');
    expect((html.match(/aria-expanded="true"/g) ?? [])).toHaveLength(1);
    expect((html.match(/aria-expanded="false"/g) ?? [])).toHaveLength(
      EN.faq.items.length - 1
    );
  });

  it('keeps every answer in the document, so none is lost without JavaScript', () => {
    const html = pricing('en');
    for (const item of EN.faq.items) {
      expect(html, `answer missing for ${item.id}`).toContain(item.a);
    }
  });

  it('hides the closed panels rather than leaving their content focusable', () => {
    const html = pricing('en');
    expect((html.match(/hidden=""/g) ?? [])).toHaveLength(EN.faq.items.length - 1);
  });
});

describe('LandingFooter — conversion hierarchy', () => {
  it('puts Browse before Sell and keeps Browse the primary action', () => {
    const html = footer('en');
    expect(html.indexOf(EN.footer.browseCta)).toBeGreaterThan(-1);
    expect(html.indexOf(EN.footer.browseCta)).toBeLessThan(html.indexOf(EN.footer.sellCta));
    expect(html).toContain('data-cta-priority="primary"');
    expect(html).toContain('data-cta-priority="secondary"');
    // And the primary marker comes first, so the markers cannot be swapped
    // while the labels stay in order.
    expect(html.indexOf('data-cta-priority="primary"'))
      .toBeLessThan(html.indexOf('data-cta-priority="secondary"'));
  });

  it('returns the visitor to real auctions, not to a waitlist', () => {
    const html = footer('en');
    expect(html).toContain(EN.footer.finalTitle);
    expect(html).toContain(EN.footer.finalBody);
  });
});

describe('LandingFooter — contact details come from the constants', () => {
  it('takes the WhatsApp link from the caller', () => {
    const html = footer('en', 'https://wa.me/962700000000');
    expect(html).toContain('https://wa.me/962700000000');
    // Scoped to the wa.me URL rather than to the bare digits: the `tel:` link
    // legitimately carries the same number, derived from the same constant.
    // Asserting on the digits alone would forbid the phone link entirely.
    expect(html).not.toContain('wa.me/962785168550');
  });

  it('dials the one official number, in the derived tel: form', () => {
    const html = footer('en');
    expect(html).toContain(`href="${SUPPORT_PHONE_TEL}"`);
    expect(html).toContain(SUPPORT_PHONE_NATIONAL);
  });

  it('links the canonical Instagram profile with no share token', () => {
    const html = footer('en');
    expect(html).toContain(SOCIAL_INSTAGRAM_URL);
    expect(html).not.toContain('igsi=');
  });

  it('opens every external link safely', () => {
    const html = footer('en');
    const externals = (html.match(/<a [^>]*href="https:\/\/[^"]*"[^>]*>/g) ?? []);
    expect(externals.length).toBeGreaterThan(0);
    for (const a of externals) {
      expect(a, `unsafe external link: ${a}`).toContain('rel="noopener noreferrer"');
    }
  });

  it('reaches the legal surfaces through callbacks, not through invented URLs', () => {
    const html = footer('en');
    for (const label of [EN.footer.termsLabel, EN.footer.privacyLabel, EN.footer.rulesLabel]) {
      expect(html, `missing legal label: ${label}`).toContain(asRendered(label));
    }
    expect((html.match(/data-legal-action/g) ?? [])).toHaveLength(3);
  });
});

describe('LandingFooter — states nothing it cannot back', () => {
  it('publishes no operating hours, because no constant defines any', () => {
    // Deliberate omission, not an oversight: there is no hours value anywhere in
    // the repository, so any hours printed here would be invented.
    const html = footer('en') + footer('ar');
    for (const pattern of [
      /\b(am|pm)\b/i,
      /\bhours\b/i,
      /ساعات/,
      /\b(sun|mon|tue|wed|thu|fri|sat)(day)?\b/i,
      /الأحد|الخميس|الجمعة/,
      /\d{1,2}\s*[:.]\s*\d{2}/,
    ]) {
      expect(html, `footer must not publish hours — ${pattern}`).not.toMatch(pattern);
    }
  });

  it('names no operator entity, registration number or street address', () => {
    // Removed on 2026-08-26 and enforced repo-wide by operatorIdentity.test.ts.
    const html = footer('en') + footer('ar');
    for (const gone of ['Al Hani', 'الهاني', '200213982', 'المدينة المنورة', 'Saad 4']) {
      expect(html, `footer must not name ${gone}`).not.toContain(gone);
    }
  });

  it('carries no unmeasured scale statistic or testimonial', () => {
    const html = footer('en') + footer('ar');
    for (const pattern of [/15,000/, /1,250/, /3,400/, /testimonial/i, /★|⭐/]) {
      expect(html).not.toMatch(pattern);
    }
  });

  it('renders Arabic, and English with no Arabic leaking through', () => {
    expect(footer('ar')).toContain(AR.footer.rights);
    expect(footer('en')).not.toMatch(/[؀-ۿ]/);
  });
});
