# Mazzado Landing Conversion Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public landing page with an Arabic-first, mobile-first Warm Marketplace experience that drives visitors into real auctions and clearly explains first-bid-started timers.

**Architecture:** Keep `LandingView` as a small composition shell and move each page section into a focused component under `src/landing/components/`. Preserve the existing Firestore-backed `useLandingAuctions`, navigation callback, language persistence, theme controls, legal modals, and failure-safe analytics; remove the simulated hero and unverified proof from the rendered landing path.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4, Motion 12 (`motion/react`), Firebase/Firestore, Vitest 2, server-side React rendering for focused component tests.

**Spec:** `docs/superpowers/specs/2026-08-27-landing-conversion-redesign-design.md`

## Global Constraints

- Default first-time landing visitors to Arabic; respect the existing `mazad_language` saved choice.
- Preserve `useApp().setLanguage(next)` so authenticated language preference continues to persist.
- Primary conversion is Browse auctions; Sell an item is secondary.
- Use only real auctions from `useLandingAuctions`; never render fabricated bids, bidder counts, countdowns, testimonials, or scale statistics.
- A clockless `first_bid` lot never renders a countdown; it explains that the first valid bid starts the clock.
- Do not change discovery, auction-room, authentication, listing, payment, or backend auction semantics.
- Do not install a component library; use the existing `motion/react` dependency and adapt only small MIT-compatible interaction patterns.
- All nonessential animation respects `prefers-reduced-motion`.
- Maintain Arabic RTL, English LTR, light mode, dark mode, keyboard navigation, visible focus, and WCAG 2.1 AA contrast.
- Analytics is failure-safe and never delays or prevents navigation.
- Public claims about fees, subscriptions, verification, viewing, payment handling, refunds, support, and hours must match approved current operations and legal copy.

## Planned File Structure

- `src/landing/LandingView.tsx` — stateful composition shell, language switching, navigation adapters, legal-modal state.
- `src/landing/landingContent.ts` — typed Arabic/English marketing content for the redesigned sections.
- `src/landing/landingContent.test.ts` — content integrity, Arabic default helpers, and parity checks.
- `src/landing/components/LandingHeader.tsx` — responsive brand/navigation/language/theme header.
- `src/landing/components/LandingHero.tsx` — buyer-led value proposition and real featured-auction preview.
- `src/landing/components/LandingAuctionCard.tsx` — truthful real-auction card states and first-bid presentation.
- `src/landing/components/LandingAuctionShowcase.tsx` — loading/error/empty/populated inventory section.
- `src/landing/components/LandingHowItWorks.tsx` — three-step first-bid auction explanation.
- `src/landing/components/LandingTrust.tsx` — consolidated verified trust statements.
- `src/landing/components/LandingSellerInvite.tsx` — secondary seller acquisition block.
- `src/landing/components/LandingPricingFaq.tsx` — subscription/fees and concise FAQ.
- `src/landing/components/LandingFooter.tsx` — final browse CTA, support, legal, and social links.
- `src/landing/components/landingSections.render.test.tsx` — focused semantic/render-state coverage.
- `src/landing/LandingView.render.test.tsx` — page-level composition, CTA hierarchy, and removed-proof regression coverage.
- `src/landing/landingAnalytics.ts` — add only placement dimensions or event names required by the approved funnel.
- `src/landing/landingAnalytics.test.ts` — exact analytics payload and failure-safety coverage.
- `src/index.css` — scoped Warm Marketplace tokens/utilities and reduced-motion behavior only where Tailwind utilities are insufficient.

---

### Task 1: Typed Content and Integrity Boundary

**Files:**
- Create: `src/landing/landingContent.ts`
- Create: `src/landing/landingContent.test.ts`
- Modify: `src/landing/translations.ts`

**Interfaces:**
- Produces: `LandingLanguage = 'ar' | 'en'`.
- Produces: `getInitialLandingLanguage(storage: Pick<Storage, 'getItem'> | null): LandingLanguage`.
- Produces: `landingContent: Record<LandingLanguage, LandingContent>`.
- `LandingContent` contains `nav`, `hero`, `marketplace`, `how`, `trust`, `seller`, `pricing`, `faq`, and `footer` objects consumed by Tasks 2–5.

- [ ] **Step 1: Write failing language and integrity tests**

```ts
import { describe, expect, it } from 'vitest';
import { getInitialLandingLanguage, landingContent } from './landingContent';

describe('landing content', () => {
  it('defaults first-time visitors to Arabic and respects saved English', () => {
    expect(getInitialLandingLanguage(null)).toBe('ar');
    expect(getInitialLandingLanguage({ getItem: () => null })).toBe('ar');
    expect(getInitialLandingLanguage({ getItem: () => 'en' })).toBe('en');
  });

  it('keeps the redesigned section structure in Arabic and English', () => {
    for (const lang of ['ar', 'en'] as const) {
      expect(landingContent[lang].hero.primaryCta).toBeTruthy();
      expect(landingContent[lang].marketplace.firstBidLabel).toBeTruthy();
      expect(landingContent[lang].how.steps).toHaveLength(3);
      expect(landingContent[lang].faq.items.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('does not ship simulated scale or adopter claims', () => {
    const copy = JSON.stringify(landingContent);
    for (const forbidden of ['15,000+', '1,250+', '3,400+', 'Early Adopters']) {
      expect(copy).not.toContain(forbidden);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx vitest run src/landing/landingContent.test.ts`

Expected: FAIL because `./landingContent` does not exist.

- [ ] **Step 3: Implement the typed content model and initial-language helper**

Create explicit interfaces rather than reusing the old 590-line `TranslationType`. The helper must guard restricted storage access:

```ts
export type LandingLanguage = 'ar' | 'en';

export function getInitialLandingLanguage(
  storage: Pick<Storage, 'getItem'> | null
): LandingLanguage {
  try {
    return storage?.getItem('mazad_language') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
```

Define complete Arabic and English content using the approved page architecture. Use the approved Arabic hero concept `اكتشف صفقتك وابدأ المزاد بنفسك`; ensure the supporting sentence explicitly says the first bid starts the timer. Copy current verified pricing/fee text from the existing translations and legal content without strengthening its claims.

- [ ] **Step 4: Remove only obsolete landing-only fields from the old translation type**

Keep `translations.ts` compiling for any remaining consumers, but move all redesigned landing copy to `landingContent.ts`. Do not alter application-wide translation files.

- [ ] **Step 5: Run focused and language-persistence tests**

Run: `npx vitest run src/landing/landingContent.test.ts src/context/languagePersistence.wiring.test.ts src/utils/languagePersistence.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/landing/landingContent.ts src/landing/landingContent.test.ts src/landing/translations.ts
git commit -m "feat(landing): add Arabic-first conversion content"
```

---

### Task 2: Responsive Header and Buyer-Led Real-Inventory Hero

**Files:**
- Create: `src/landing/components/LandingHeader.tsx`
- Create: `src/landing/components/LandingHero.tsx`
- Create: `src/landing/components/landingHero.render.test.tsx`
- Modify: `src/landing/components/Logo.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `LandingContent['nav']`, `LandingContent['hero']`, `LandingLanguage`, and `LandingAuction`.
- Produces: `LandingHeader({ lang, copy, onBrowse, onLanguageToggle, whatsappUrl })`.
- Produces: `LandingHero({ lang, copy, firstBidLabel, auction, isLoading, onBrowse, onSell, onAuctionView })`.
- `onAuctionView(auctionId: string)` routes to the selected auction; it must not fall back to a different auction ID.

- [ ] **Step 1: Write failing semantic-render tests**

Use `renderToStaticMarkup` to assert ordering and truthful states:

```tsx
it('renders browse as the primary hero action and sell as secondary', () => {
  const html = renderToStaticMarkup(
    <LandingHero lang="ar" copy={landingContent.ar.hero}
      firstBidLabel={landingContent.ar.marketplace.firstBidLabel} auction={lot} isLoading={false}
      onBrowse={() => {}} onSell={() => {}} onAuctionView={() => {}} />
  );
  expect(html.indexOf('تصفّح المزادات')).toBeLessThan(html.indexOf('بيع منتجك'));
  expect(html).toContain('ابدأ المزاد');
});

it('never invents hero auction activity for a clockless lot', () => {
  const html = renderToStaticMarkup(
    <LandingHero lang="ar" copy={landingContent.ar.hero}
      firstBidLabel={landingContent.ar.marketplace.firstBidLabel}
      auction={{ ...lot, endTime: undefined, totalBids: 0 }} isLoading={false}
      onBrowse={() => {}} onSell={() => {}} onAuctionView={() => {}} />
  );
  expect(html).toContain(landingContent.ar.marketplace.firstBidLabel);
  expect(html).not.toMatch(/\d\d:\d\d/);
  expect(html).not.toContain('watching');
});
```

- [ ] **Step 2: Run the focused test and verify missing components**

Run: `npx vitest run src/landing/components/landingHero.render.test.tsx`

Expected: FAIL because the new header and hero modules do not exist.

- [ ] **Step 3: Implement `LandingHeader`**

Use semantic `header`, `nav`, buttons, and anchor links that match actual section IDs. Preserve `Logo`, `ThemeToggle`, WhatsApp support, the language control, and a compact mobile menu. Set `aria-expanded` and `aria-controls` on the menu button; close the menu after every navigation action.

- [ ] **Step 4: Implement `LandingHero` using real auction data**

Render a warm cream/orange hero in light mode and tokenized dark mode. Use the auction image/title/opening or current price from `LandingAuction`; show a skeleton while loading and a simple branded product-discovery panel when no auction is available. Do not retain `ACTIVE_ITEMS`, `AR_NAMES`, `EN_NAMES`, watcher drift, bid simulation, fake bid logs, or remote Unsplash hero inventory.

- [ ] **Step 5: Add restrained motion and reduced-motion behavior**

Use one entrance transition for the hero content and product card. Use `useReducedMotion()` to render the final state without translation/opacity choreography when requested. Add CSS only under `.landing-root` and use semantic color tokens.

- [ ] **Step 6: Run focused, theme, logo, and overflow tests**

Run: `npx vitest run src/landing/components/landingHero.render.test.tsx src/landing/logoTheme.wiring.test.ts src/landing/landingRootOverflow.wiring.test.ts src/theme.guard.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/landing/components/LandingHeader.tsx src/landing/components/LandingHero.tsx src/landing/components/landingHero.render.test.tsx src/landing/components/Logo.tsx src/index.css
git commit -m "feat(landing): add buyer-led marketplace hero"
```

---

### Task 3: Truthful Auction Showcase

**Files:**
- Create: `src/landing/components/LandingAuctionCard.tsx`
- Create: `src/landing/components/LandingAuctionShowcase.tsx`
- Create: `src/landing/components/landingAuctionShowcase.render.test.tsx`
- Modify: `src/landing/useLandingAuctions.ts`
- Modify: `src/landing/useLandingAuctions.test.ts`

**Interfaces:**
- Consumes: `LandingAuction`, `LandingContent['marketplace']`, `LandingLanguage`.
- Produces: `isAwaitingFirstLandingBid(auction: LandingAuction): boolean`.
- Produces: `LandingAuctionCard({ auction, lang, copy, onView })`.
- Produces: `LandingAuctionShowcase({ state, lang, copy, onView, onSell })` where `state: LandingAuctionsState`.

- [ ] **Step 1: Add failing first-bid state tests**

```ts
describe('isAwaitingFirstLandingBid', () => {
  it('requires no bids and no valid clock', () => {
    expect(isAwaitingFirstLandingBid({ ...lot, totalBids: 0, endTime: undefined })).toBe(true);
    expect(isAwaitingFirstLandingBid({ ...lot, totalBids: 1, endTime: Date.now() + 60_000 })).toBe(false);
  });
});
```

Add render assertions for populated, loading, empty, error, missing-image, clockless, and clocked states. A clockless card must contain the first-bid label and no countdown.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/landing/useLandingAuctions.test.ts src/landing/components/landingAuctionShowcase.render.test.tsx`

Expected: FAIL because the new predicate and components are missing.

- [ ] **Step 3: Add the pure first-bid predicate**

```ts
export function isAwaitingFirstLandingBid(a: LandingAuction): boolean {
  const hasClock = typeof a.endTime === 'number' && Number.isFinite(a.endTime) && a.endTime > 0;
  return a.totalBids === 0 && !hasClock;
}
```

Do not weaken the existing `compareLandingAuctions` total-order contract or change Firestore fetch semantics.

- [ ] **Step 4: Implement the auction card**

Use `categoryLabel`, `priceLabel`, meaningful alt text, a stable missing-image fallback, verified badge only when `isVerified`, and real countdown text only when `endTime` is a finite future timestamp. Make the whole card a semantic button or link-like control with a clear accessible name.

- [ ] **Step 5: Implement showcase states**

Render 4 stable skeleton cards while loading; real cards when populated; a concise seller invitation when empty; and a nonfatal availability message when errored. Do not render seed/demo inventory in any state.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/landing/useLandingAuctions.test.ts src/landing/components/landingAuctionShowcase.render.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/landing/components/LandingAuctionCard.tsx src/landing/components/LandingAuctionShowcase.tsx src/landing/components/landingAuctionShowcase.render.test.tsx src/landing/useLandingAuctions.ts src/landing/useLandingAuctions.test.ts
git commit -m "feat(landing): showcase real first-bid auctions"
```

---

### Task 4: Auction Education, Trust, and Seller Path

**Files:**
- Create: `src/landing/components/LandingHowItWorks.tsx`
- Create: `src/landing/components/LandingTrust.tsx`
- Create: `src/landing/components/LandingSellerInvite.tsx`
- Create: `src/landing/components/landingEducation.render.test.tsx`

**Interfaces:**
- Consumes: corresponding content objects from `LandingContent`.
- Produces: `LandingHowItWorks({ copy })`, `LandingTrust({ copy, onRules })`, and `LandingSellerInvite({ copy, onSell })`.

- [ ] **Step 1: Write failing content and CTA tests**

```tsx
it('explains the first-bid lifecycle in exactly three steps', () => {
  const html = renderToStaticMarkup(<LandingHowItWorks copy={landingContent.en.how} />);
  expect((html.match(/data-auction-step=/g) ?? [])).toHaveLength(3);
  expect(html).toContain('first bid');
});

it('renders one focused seller action without buyer-primary styling', () => {
  const html = renderToStaticMarkup(<LandingSellerInvite copy={landingContent.en.seller} onSell={() => {}} />);
  expect(html).toContain('Sell');
  expect(html).toContain('data-cta-priority="secondary"');
});
```

- [ ] **Step 2: Run the focused test and verify missing components**

Run: `npx vitest run src/landing/components/landingEducation.render.test.tsx`

Expected: FAIL because the section components do not exist.

- [ ] **Step 3: Implement the three-step explainer**

Use numbered steps with lightweight icons and no interactive simulator. Make the first-bid rule visually dominant; use real policy wording for anti-sniping and completion.

- [ ] **Step 4: Implement consolidated trust**

Render only approved content from `landingContent`. Provide a real Auction Rules action. Do not include invented testimonials, offices, universal viewing, universal verification, guaranteed escrow, or refund claims.

- [ ] **Step 5: Implement the seller invitation**

One section, one seller CTA, one concise explanation of the currently approved listing fee and success commission. Preserve `onSell()` as a callback so the page shell owns analytics and navigation.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run src/landing/components/landingEducation.render.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/landing/components/LandingHowItWorks.tsx src/landing/components/LandingTrust.tsx src/landing/components/LandingSellerInvite.tsx src/landing/components/landingEducation.render.test.tsx
git commit -m "feat(landing): explain auctions and consolidate trust"
```

---

### Task 5: Pricing, FAQ, Final CTA, and Footer

**Files:**
- Create: `src/landing/components/LandingPricingFaq.tsx`
- Create: `src/landing/components/LandingFooter.tsx`
- Create: `src/landing/components/landingClosing.render.test.tsx`

**Interfaces:**
- Consumes: `LandingContent['pricing']`, `LandingContent['faq']`, `LandingContent['footer']`.
- Produces: `LandingPricingFaq({ pricing, faq, onSubscribe })`.
- Produces: `LandingFooter({ copy, onBrowse, onSell, onRules, onTerms, onPrivacy, whatsappUrl })`.

- [ ] **Step 1: Write failing accessibility and hierarchy tests**

Assert that pricing follows inventory/trust at the page-composition level in Task 6. Here assert that FAQ controls expose `aria-expanded`, each control references a panel ID, pricing exposes the current buyer premium, and footer Browse precedes Sell.

- [ ] **Step 2: Run the focused test and verify missing components**

Run: `npx vitest run src/landing/components/landingClosing.render.test.tsx`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement pricing and accessible FAQ**

Reuse the current verified 1-month, 6-month, and 1-year offers. Keep the buyer premium visible. Implement a single-open accordion using buttons, `aria-expanded`, and `aria-controls`; animation is optional and must degrade to immediate state changes under reduced motion.

- [ ] **Step 4: Implement final CTA and compact footer**

The final primary action returns to real auctions. Include the existing support phone/WhatsApp, Instagram, operating hours, legal modals, and auction rules using repository constants rather than duplicating phone numbers or URLs.

- [ ] **Step 5: Run focused and support-parity tests**

Run: `npx vitest run src/landing/components/landingClosing.render.test.tsx src/constants/supportPhone.parity.test.ts src/constants/operatorIdentity.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/landing/components/LandingPricingFaq.tsx src/landing/components/LandingFooter.tsx src/landing/components/landingClosing.render.test.tsx
git commit -m "feat(landing): add pricing FAQ and conversion footer"
```

---

### Task 6: Compose the New Page and Remove Simulated Proof

**Files:**
- Rewrite: `src/landing/LandingView.tsx`
- Create: `src/landing/LandingView.render.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/landing/landingAnalytics.ts`
- Modify: `src/landing/landingAnalytics.test.ts`
- Modify: `src/landing/landingSectionNav.wiring.test.ts`
- Modify: `src/context/languagePersistence.wiring.test.ts`

**Interfaces:**
- Consumes all section interfaces from Tasks 1–5.
- Produces public component signature: `LandingView({ onEnter, onOpenAuction, whatsappUrl? }: { onEnter: (target?: string) => void; onOpenAuction: (auctionId: string) => void; whatsappUrl?: string })`.
- Adds no new application-wide navigation target.

- [ ] **Step 1: Write failing page-composition regression tests**

Read `LandingView.tsx` and/or render the component with mocked `useLandingAuctions` and `useApp`. Assert:

```ts
expect(source).not.toContain('ACTIVE_ITEMS');
expect(source).not.toContain('AR_NAMES');
expect(source).not.toContain('Early Adopters');
expect(source).not.toContain('15,000+');
expect(source.indexOf('<LandingHero')).toBeLessThan(source.indexOf('<LandingAuctionShowcase'));
expect(source.indexOf('<LandingAuctionShowcase')).toBeLessThan(source.indexOf('<LandingPricingFaq'));
```

Add callback assertions that hero Browse emits `{ location: 'hero' }` then calls `onEnter()`, hero Sell emits `{ location: 'hero' }` then calls `onEnter('upload')`, and auction view emits the selected ID before routing.

- [ ] **Step 2: Run page and analytics tests and verify failure**

Run: `npx vitest run src/landing/LandingView.render.test.tsx src/landing/landingAnalytics.test.ts`

Expected: FAIL against the old monolithic page.

- [ ] **Step 3: Replace `LandingView` with the composition shell**

Retain only:

- `useApp().setLanguage` integration.
- Guarded language initialization and switching.
- `useLandingAuctions()` state.
- Section callback adapters that emit analytics then navigate.
- Header/menu state if it is not fully local to `LandingHeader`.
- Terms, privacy, and auction-rules modal state.
- Page direction and `.landing-root` root classes.

Update `App.tsx` to pass an exact-auction callback:

```tsx
<LandingView
  onEnter={(target) => setActiveView((target as any) ?? 'discovery')}
  onOpenAuction={(auctionId) => {
    setActiveAuctionId(auctionId);
    setActiveView('live');
  }}
/>
```

Delete the simulator state/effects, bid logs, fake watchers, local adopter storage, simulated testimonials/stats, repeated sections, and unused icon imports.

- [ ] **Step 4: Complete analytics placement coverage**

Keep existing event names unless a new name is required. Use exact placements: `nav`, `hero`, `marketplace`, `seller`, and `final`. Keep `emitLandingEvent` wrapped so exceptions never escape. Do not duplicate application-level `user_registration` or `first_bid` events.

- [ ] **Step 5: Update wiring tests to stable contracts**

Replace brittle anchors that target deleted internal function text with assertions against exported helpers, visible section IDs, or component composition. Preserve the tests’ original behavior guarantees: one document scroll owner, working section links, language persistence, and logo/theme correctness.

- [ ] **Step 6: Run the complete landing and language suite**

Run: `npx vitest run src/landing src/context/languagePersistence.wiring.test.ts src/utils/languagePersistence.test.ts src/theme.guard.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/landing/LandingView.tsx src/landing/LandingView.render.test.tsx src/landing/landingAnalytics.ts src/landing/landingAnalytics.test.ts src/landing/landingSectionNav.wiring.test.ts src/context/languagePersistence.wiring.test.ts
git commit -m "refactor(landing): compose conversion-focused public page"
```

---

### Task 7: Full Verification and Launch Evidence

**Files:**
- Create: `docs/verification/landing-conversion-redesign.md`
- Modify only if verification exposes a defect: files introduced or modified in Tasks 1–6.

**Interfaces:**
- Consumes the complete redesigned landing page.
- Produces a reproducible verification record containing command results and rendered-review findings.

- [ ] **Step 1: Run static checks and full tests**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all commands exit 0. Record test counts and build output summary in the verification document.

- [ ] **Step 2: Start the production-like preview**

Run: `npm run dev`

Expected: Vite serves the application on port 3000. Keep it running only for the rendered review.

- [ ] **Step 3: Review required viewport and direction matrix**

Use the browser at widths 320, 390, 768, 1024, and 1440. At minimum capture findings for:

- Arabic RTL light and dark.
- English LTR light and dark.
- Reduced motion.
- Real populated inventory.
- Loading skeleton.
- Empty state.
- Fetch-error state.
- Missing image.
- Long mixed Arabic/English title.
- Large JOD price.

For each row record PASS/FAIL and the observed behavior. Fix failures in the owning task’s file and add a regression test before continuing.

- [ ] **Step 4: Verify the conversion path manually**

Confirm:

1. Hero Browse opens discovery.
2. A real auction card opens that exact auction.
3. A clockless first-bid auction displays no countdown.
4. Seller CTAs open the existing upload/auth path.
5. Language choice persists through refresh and authentication entry.
6. Rules, terms, privacy, WhatsApp, phone, and Instagram actions target the intended surfaces.
7. No unverified scale number, testimonial, bidder count, or adopter identity is rendered.

- [ ] **Step 5: Verify analytics observability**

Inspect `window.dataLayer` in a non-production test session and verify landing view, hero browse, auction view, language switch, seller CTA, and final browse payloads. Record whether an actual GTM/analytics consumer is present; if it is absent, record that as a launch dependency rather than silently claiming measurement is live.

- [ ] **Step 6: Review public claims with the product owner**

In `docs/verification/landing-conversion-redesign.md`, list the exact published statements about subscriptions, buyer premium, seller commission, verification, viewing, payment handling, dispute/refund behavior, support hours, and listing-fee promotion. Obtain explicit product/operations confirmation before deployment.

- [ ] **Step 7: Commit verification evidence**

```bash
git add docs/verification/landing-conversion-redesign.md
git commit -m "docs: verify landing conversion redesign"
```

## Final Acceptance Gate

Do not merge or deploy until:

- All seven task commits exist and the worktree is clean.
- `npm run lint`, `npm test`, and `npm run build` pass on the final commit.
- The rendered review matrix has no unresolved failures.
- Public commercial and trust claims have explicit owner approval.
- The final diff contains no simulated social proof or local-only adopter form.
- The landing page’s primary CTA is Browse auctions in both languages and at mobile/desktop widths.
