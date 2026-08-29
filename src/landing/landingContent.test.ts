/**
 * The landing page's content boundary.
 *
 * Two different failures live here, and they are why this file exists rather
 * than the copy being inlined in components:
 *
 * 1. **Arabic is the default, once.** The old page read `localStorage` inline
 *    inside a `useState` initialiser, so the rule "first visit is Arabic, a
 *    saved choice wins" was untestable and unguarded — and it threw outright in
 *    a browser with storage disabled. `getInitialLandingLanguage` is that rule,
 *    extracted and injected, so it can be asserted without a DOM.
 *
 * 2. **Unverifiable claims are a content bug, not a copy preference.** The
 *    previous landing page shipped `15,000+ buyers`, `1,250+ items sold`,
 *    `3,400+ items listed`, a local-storage-only "Early Adopters" list, and
 *    simulated testimonials. None were measurements. The forbidden-string and
 *    tier-parity tests below are a ratchet: copy may change freely, but it
 *    cannot drift back into asserting numbers the product cannot produce, or
 *    prices the server does not charge.
 */
import { describe, expect, it } from 'vitest';
import { getInitialLandingLanguage, landingContent } from './landingContent';
import { SUBSCRIPTION_TIERS } from '../constants/subscriptionTiers';

/** Deep key shape, sorted — arrays collapse to their element shape. */
function shapeOf(node: unknown): unknown {
  if (Array.isArray(node)) return node.length > 0 ? ['[]', shapeOf(node[0])] : ['[]'];
  if (node && typeof node === 'object') {
    return Object.keys(node as object)
      .sort()
      .map(k => [k, shapeOf((node as Record<string, unknown>)[k])]);
  }
  return typeof node;
}

describe('getInitialLandingLanguage', () => {
  it('defaults first-time visitors to Arabic and respects saved English', () => {
    expect(getInitialLandingLanguage(null)).toBe('ar');
    expect(getInitialLandingLanguage({ getItem: () => null })).toBe('ar');
    expect(getInitialLandingLanguage({ getItem: () => 'en' })).toBe('en');
  });

  it('treats any non-`en` stored value as Arabic', () => {
    // Mirrors `normalizeLanguage` in utils/languagePersistence.ts and
    // `resolveLang` in functions/messageCopy.js: English only on an exact 'en'.
    // Diverging here would show one language and message in the other.
    for (const junk of ['EN', 'ar', 'fr', '', 'null']) {
      expect(getInitialLandingLanguage({ getItem: () => junk })).toBe('ar');
    }
  });

  it('falls back to Arabic when storage access throws', () => {
    // Safari in private mode and a cookie-blocked embed both throw on getItem
    // rather than returning null. The old inline read propagated that into a
    // render and blanked the page.
    expect(
      getInitialLandingLanguage({
        getItem: () => {
          throw new Error('SecurityError');
        },
      })
    ).toBe('ar');
  });
});

describe('landing content', () => {
  it('keeps the redesigned section structure in Arabic and English', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(landingContent[lang].hero.primaryCta).toBeTruthy();
      expect(landingContent[lang].marketplace.firstBidLabel).toBeTruthy();
      expect(landingContent[lang].how.steps).toHaveLength(3);
      expect(landingContent[lang].faq.items.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('exposes an identical content shape in both languages', () => {
    // A key present in one language only renders as `undefined` in the other —
    // an invisible hole rather than a crash, which is why it needs a test.
    expect(shapeOf(landingContent.ar)).toEqual(shapeOf(landingContent.en));
  });

  it('carries the correct direction and language code per language', () => {
    expect(landingContent.ar.dir).toBe('rtl');
    expect(landingContent.ar.langCode).toBe('ar');
    expect(landingContent.en.dir).toBe('ltr');
    expect(landingContent.en.langCode).toBe('en');
  });

  it('states the approved Arabic hero concept', () => {
    expect(landingContent.ar.hero.title).toBe('اكتشف صفقتك وابدأ المزاد بنفسك');
  });

  it('explains in both languages that the first bid starts the clock', () => {
    // The single mechanic the page exists to teach. A `first_bid` lot shows no
    // countdown, so if this sentence goes missing the card looks broken rather
    // than unstarted.
    expect(landingContent.ar.hero.subtitle).toContain('أول مزايدة');
    expect(landingContent.en.hero.subtitle.toLowerCase()).toContain('first bid');
    expect(landingContent.ar.marketplace.firstBidHint).toContain('أول مزايدة');
    expect(landingContent.en.marketplace.firstBidHint.toLowerCase()).toContain('first bid');
    const enSteps = landingContent.en.how.steps.map(s => `${s.title} ${s.body}`).join(' ');
    expect(enSteps.toLowerCase()).toContain('first bid');
  });

  it('leads with browsing auctions and keeps selling secondary', () => {
    // Pins the conversion hierarchy at the content layer so a later copy edit
    // cannot quietly swap the two CTAs.
    expect(landingContent.ar.hero.primaryCta).toBe('تصفّح المزادات');
    expect(landingContent.ar.hero.secondaryCta).toBe('بيع منتجك');
    expect(landingContent.en.hero.primaryCta).toBe('Browse auctions');
    expect(landingContent.en.hero.secondaryCta).toBe('Sell an item');
  });

  it('does not ship simulated scale or adopter claims', () => {
    const copy = JSON.stringify(landingContent);
    for (const forbidden of ['15,000+', '1,250+', '3,400+', 'Early Adopters']) {
      expect(copy).not.toContain(forbidden);
    }
  });

  it('makes no claim the product does not currently enforce', () => {
    // Each pattern below is a claim the previous landing copy made and the
    // application does not guarantee: `LandingAuction.isVerified` is
    // `approvalStatus === 'approved'` — a LISTING review, not seller identity
    // verification; viewing is arranged per auction, not offered on every lot;
    // and there is no unconditional refund right (once release is approved the
    // sale is final, per src/content/legalTerms.ts).
    const copy = JSON.stringify(landingContent);
    const forbidden: Array<[string, RegExp]> = [
      ['all sellers verified', /verification of all sellers|توثيق جميع البائعين/i],
      ['guaranteed viewing on every lot', /view any item|معاينة أي منتج/i],
      ['unconditional refunds', /full refund|money-back|استرداد كامل/i],
      ['free shipping', /free (shipping|delivery)|توصيل مجاني/i],
      ['no fees at all', /no fees|بدون أي عمولة/i],
    ];
    for (const [label, pattern] of forbidden) {
      expect(pattern.test(copy), `landing copy must not claim: ${label}`).toBe(false);
    }
  });

  it('quotes the buyer premium and seller commission at the approved 5%', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(landingContent[lang].pricing.buyerPremiumNote).toMatch(/5\s*[%٪]/);
      expect(landingContent[lang].seller.feeNote).toMatch(/5\s*[%٪]/);
    }
  });

  it('mirrors the canonical subscription tier table', () => {
    // SUBSCRIPTION_TIERS is itself a display mirror of
    // functions/subscriptionTiers.js, from which the server derives every
    // grant. A price advertised here that the server does not charge is a
    // customer taking a payment action that cannot succeed.
    const ids = Object.keys(SUBSCRIPTION_TIERS) as Array<keyof typeof SUBSCRIPTION_TIERS>;
    for (const lang of ['ar', 'en'] as const) {
      const plans = landingContent[lang].pricing.plans;
      expect(plans.map(p => p.id)).toEqual(ids);
      for (const plan of plans) {
        expect(plan.priceLabel).toContain(String(SUBSCRIPTION_TIERS[plan.id].price));
      }
    }
  });
});
