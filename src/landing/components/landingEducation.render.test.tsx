/**
 * Executes the explainer, the trust section and the seller invitation.
 *
 * These three sections are where a landing page acquires promises. They render
 * no auction data at all, so nothing here can be checked against Firestore —
 * the only guard available is that every sentence comes from the reviewed
 * content module and that the specific claims Mazzado does NOT make cannot
 * reappear. Hence the ratchet at the bottom of this file: it is not a style
 * check, it is the list of statements that were removed from the old page
 * because the product does not enforce them.
 *
 * `renderToStaticMarkup` — vitest here is `environment: 'node'`, no jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { landingContent } from '../landingContent';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));

import { LandingHowItWorks } from './LandingHowItWorks';
import { LandingTrust } from './LandingTrust';
import { LandingSellerInvite } from './LandingSellerInvite';

const AR = landingContent.ar;
const EN = landingContent.en;
const WA = 'https://wa.me/962785168550';

const how = (lang: 'ar' | 'en' = 'en') =>
  renderToStaticMarkup(<LandingHowItWorks copy={landingContent[lang].how} />);

const trust = (lang: 'ar' | 'en' = 'en', whatsappUrl = WA) =>
  renderToStaticMarkup(
    <LandingTrust copy={landingContent[lang].trust} onRules={() => {}} whatsappUrl={whatsappUrl} />
  );

const seller = (lang: 'ar' | 'en' = 'en') =>
  renderToStaticMarkup(
    <LandingSellerInvite copy={landingContent[lang].seller} onSell={() => {}} />
  );

describe('LandingHowItWorks', () => {
  it('explains the first-bid lifecycle in exactly three steps', () => {
    const html = how('en');
    expect((html.match(/data-auction-step=/g) ?? [])).toHaveLength(3);
    expect(html).toContain('first bid');
  });

  it('numbers the steps 1, 2, 3 in the order the content declares them', () => {
    const html = how('en');
    const steps = [...html.matchAll(/data-auction-step="(\d)"/g)].map(m => m[1]);
    expect(steps).toEqual(['1', '2', '3']);
    // And the order on screen follows the content, not the markup's own idea.
    const titles = EN.how.steps.map(s => html.indexOf(s.title));
    expect(titles.every(i => i > -1)).toBe(true);
    expect([...titles]).toEqual([...titles].sort((a, b) => a - b));
  });

  it('leads with the step that starts the clock, and makes it dominant', () => {
    // The one mechanic the page exists to teach. If it is not first and not
    // emphasised, a visitor reads three equal steps and learns nothing.
    const html = how('en');
    expect(html).toContain('data-auction-step-lead');
    const lead = html.indexOf('data-auction-step-lead');
    expect(lead).toBeGreaterThan(-1);
    expect(lead).toBeLessThan(html.indexOf(EN.how.steps[1].title));
  });

  it('renders every step body verbatim from the content module', () => {
    const html = how('en');
    for (const step of EN.how.steps) {
      expect(html, `missing body for ${step.id}`).toContain(step.body);
    }
  });

  it('is a titled section anchored where the header links', () => {
    const html = how('en');
    expect(html).toContain('id="how"');
    expect((html.match(/<h2/g) ?? [])).toHaveLength(1);
    expect(html).toContain(EN.how.title);
    expect((html.match(/<h3/g) ?? [])).toHaveLength(3);
  });

  it('carries no interactive simulator — it explains, it does not play', () => {
    // The old page put a fake bidding simulator in this slot.
    const html = how('en');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
  });

  it('renders Arabic, and English with no Arabic leaking through', () => {
    expect(how('ar')).toContain(AR.how.steps[0].title);
    expect(how('en')).not.toMatch(/[؀-ۿ]/);
  });
});

describe('LandingTrust', () => {
  it('renders every approved trust point, and only those', () => {
    const html = trust('en');
    for (const point of EN.trust.points) {
      expect(html, `missing ${point.id}`).toContain(point.title);
      expect(html).toContain(point.body);
    }
    expect((html.match(/data-trust-point=/g) ?? [])).toHaveLength(EN.trust.points.length);
  });

  it('offers a real auction-rules action rather than describing one', () => {
    const html = trust('en');
    expect(html).toContain(EN.trust.rulesCta);
    expect(html).toContain('data-trust-rules');
  });

  it('takes the support link from the caller instead of hardcoding a number', () => {
    const html = trust('en', 'https://wa.me/962700000000');
    expect(html).toContain('https://wa.me/962700000000');
    expect(html).not.toContain('962785168550');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('is a titled section anchored where the header links', () => {
    const html = trust('en');
    expect(html).toContain('id="trust"');
    expect((html.match(/<h2/g) ?? [])).toHaveLength(1);
    expect(html).toContain(EN.trust.title);
  });

  it('renders Arabic, and English with no Arabic leaking through', () => {
    expect(trust('ar')).toContain(AR.trust.points[0].title);
    expect(trust('en')).not.toMatch(/[؀-ۿ]/);
  });
});

describe('LandingSellerInvite', () => {
  it('renders one focused seller action without buyer-primary styling', () => {
    const html = seller('en');
    expect(html).toContain('Sell');
    expect(html).toContain('data-cta-priority="secondary"');
  });

  it('offers exactly one action, so the section stays focused', () => {
    // "One focused seller block", not a second funnel competing with Browse.
    const html = seller('en');
    expect((html.match(/<button/g) ?? [])).toHaveLength(1);
    expect(html).not.toContain('data-cta-priority="primary"');
  });

  it('routes through the callback so the page shell keeps analytics and navigation', () => {
    const html = seller('en');
    expect(html).toContain(EN.seller.cta);
    // No anchor smuggling the visitor somewhere the shell cannot instrument.
    expect(html).not.toContain('<a ');
  });

  it('states the fee and commission exactly as content has them approved', () => {
    const html = seller('en');
    expect(html).toContain(EN.seller.feeNote);
    expect(html).toMatch(/5\s*%/);
    expect(html).toMatch(/95\s*%/);
  });

  it('renders the approved reasons to sell, and no others', () => {
    const html = seller('en');
    for (const point of EN.seller.points) expect(html).toContain(point);
    expect((html.match(/data-seller-point=/g) ?? [])).toHaveLength(EN.seller.points.length);
  });

  it('is a titled section anchored where the header links', () => {
    const html = seller('en');
    expect(html).toContain('id="sell"');
    expect((html.match(/<h2/g) ?? [])).toHaveLength(1);
  });

  it('renders Arabic, and English with no Arabic leaking through', () => {
    expect(seller('ar')).toContain(AR.seller.cta);
    expect(seller('en')).not.toMatch(/[؀-ۿ]/);
  });
});

// ---------------------------------------------------------------------------
// The claims ratchet.
//
// Every pattern below is a statement the PREVIOUS landing page made and the
// application does not enforce. They are asserted against the rendered markup
// rather than against the content module, because a component can invent a
// sentence that no content review ever saw — which is exactly how the hero
// acquired its own copy of the first-bid claim earlier in this branch.
// ---------------------------------------------------------------------------
describe('these sections make no claim the product does not enforce', () => {
  const surfaces: Array<[string, string]> = [
    ['how (en)', how('en')], ['how (ar)', how('ar')],
    ['trust (en)', trust('en')], ['trust (ar)', trust('ar')],
    ['seller (en)', seller('en')], ['seller (ar)', seller('ar')],
  ];

  const forbidden: Array<[string, RegExp]> = [
    // `isVerified` is `approvalStatus === 'approved'` — Mazzado reviewing a
    // LISTING, which is why the approved copy says "reviewed listing". Written
    // broadly on purpose: the first version of this pattern only matched the old
    // page's exact phrasing ("verification of all sellers") and sailed straight
    // past "every seller is identity verified", which claims the same thing.
    // Nothing in the approved copy for these sections contains "verif" at all.
    ['seller identity verification', /verif|توثيق (هوية )?(جميع )?البائع|هوية موثّق/i],
    ['viewing available on every lot', /view any item|inspect any item|معاينة أي (منتج|قطعة)/i],
    // Once release is approved the sale is final (content/legalTerms.ts).
    ['unconditional refunds', /full refund|money-back|no-questions|استرداد كامل|ضمان استرداد/i],
    ['escrow as a banking product', /escrow|حساب ضمان|ضمان بنكي/i],
    ['physical offices or branches', /our (office|branch)|زيارة مكتبنا|فروعنا/i],
    ['free shipping or delivery', /free (shipping|delivery)|توصيل مجاني/i],
    ['unmeasured scale statistics', /15,000|1,250|3,400/],
    ['testimonials or star ratings', /testimonial|★|⭐|customers? say/i],
    ['a guarantee of any kind', /\bguarantee/i],
  ];

  for (const [label, pattern] of forbidden) {
    it(`never claims: ${label}`, () => {
      const offenders = surfaces.filter(([, html]) => pattern.test(html)).map(([name]) => name);
      expect(offenders, `${label} — ${pattern}`).toEqual([]);
    });
  }

  it('has surfaces to scan, so the ratchet is not vacuous', () => {
    expect(surfaces).toHaveLength(6);
    for (const [name, html] of surfaces) {
      expect(html.length, `${name} rendered nothing`).toBeGreaterThan(200);
    }
  });
});
