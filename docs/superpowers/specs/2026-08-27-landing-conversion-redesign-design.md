# Mazzado Landing Conversion Redesign

**Date:** 2026-08-27  
**Status:** Approved for implementation
**Product:** Mazzado (`mazzado.com`)  
**Primary market:** Jordan  

## Objective

Redesign the public landing page into a friendly, modern, mobile-first buyer funnel that converts visitors into auction viewers and bidders while keeping seller acquisition visible as a secondary path.

The page must communicate the real launch mechanic clearly: seeded auctions are available at low opening prices, and for `first_bid` auctions the first valid bid starts the countdown. It must use real marketplace inventory and defensible trust signals rather than simulated demand.

## Success Definition

The redesign succeeds when a first-time Jordanian visitor can quickly answer:

1. What is Mazzado?
2. What can I buy now?
3. Why does an auction say “Be the first” instead of showing a timer?
4. Is bidding and payment safe?
5. What should I do next?

The primary product funnel is:

`landing viewed → browse CTA → auction viewed → sign-in intent → first bid`

The secondary supply funnel is:

`landing viewed → seller CTA → listing flow started → listing submitted`

## Audience and Positioning

### Initial audience

Prioritize Jordanian deal seekers shopping for electronics, appliances, household goods, and other accessible everyday inventory. The page may support higher-value categories, but the launch message must not depend on cars, property, luxury watches, or other inventory that is not consistently available.

### Positioning

Mazzado is Jordan’s friendly, trusted place to discover real deals through fair auctions.

The product should feel:

- Warm and approachable, not institutional.
- Energetic when an auction is active, without gambling-style spectacle.
- Transparent about prices, timing, fees, and protection.
- Local and natural in Arabic, not like translated corporate copy.

## Conversion Hierarchy

The primary CTA is **Browse auctions**. The secondary CTA is **Sell an item**.

Visitors may browse real inventory without registering. Registration is requested when intent is high, such as bidding, watchlisting, or entering another authenticated flow. A generic launch waitlist is not a primary conversion path.

The header, hero, auction showcase, and final CTA must reinforce this hierarchy. Seller acquisition remains visible but must not displace real inventory as the main value demonstration.

## Language Direction

The experience is Arabic-first and RTL-first.

- On a visitor’s first visit, default the landing page to Arabic.
- If the visitor previously selected a language, respect the saved choice.
- Keep complete English support with correct LTR layout.
- Use concise, idiomatic Jordanian-facing Arabic reviewed for naturalness.
- Do not create directionality bugs in prices, numerals, icons, timers, or mixed Arabic/English product names.
- Preserve the existing language persistence contract so the chosen language carries into authentication and the application.

## Visual Direction: Warm Marketplace

Use the approved **Warm Marketplace** direction:

- Warm cream or lightly tinted surfaces in light mode.
- Mazzado orange as the primary action and energy color.
- Dark neutral text with generous contrast.
- Rounded but disciplined cards and controls.
- Large, high-quality product imagery as the main visual proof.
- Comfortable spacing and friendly, confident typography.
- Dark mode remains supported, but the page is not designed as a dark, entertainment-led experience.

Borrow selectively from two secondary directions:

- Use stronger dark/orange energy only inside genuinely active-auction moments.
- Use calm trust cues around verification, viewing, payment, and buyer protection.

Avoid visual effects that make the marketplace feel speculative, game-like, or untrustworthy.

## Page Architecture

### 1. Header

Use the real Mazzado logo, a compact navigation model, language control, theme control, and a clear browse action. The mobile header must prioritize logo, language, and menu without crowding.

Navigation should point only to sections that remain on the page. Avoid a large desktop menu for a short page.

### 2. Hero and real auction preview

The hero communicates three ideas in this order:

1. Discover real deals.
2. The visitor can be the first bidder.
3. The first valid bid starts the auction clock.

Recommended Arabic concept, subject to final editorial review:

> اكتشف صفقتك وابدأ المزاد بنفسك

Support it with short copy explaining that products are real, opening prices are visible, and the first bid starts the countdown for eligible lots.

The primary CTA browses auctions. The secondary CTA opens the seller path.

Feature a real auction from `useLandingAuctions`; do not hard-code a simulated Rolex, vehicle, bidder count, current price, or countdown. If no suitable auction is available, render an honest designed fallback rather than fabricated activity.

### 3. Auctions waiting for their first bid

Show real seeded inventory immediately below the hero. Prioritize `first_bid` lots awaiting their first bid while retaining the existing curation and safety rules from `useLandingAuctions`.

Each card should make the following scannable:

- Real product image.
- Product title.
- Category.
- Opening price in JOD.
- Verification state only when actually supported by the data.
- “Be the first” status.
- A short explanation or affordance that the first bid starts the timer.
- Clear action to view the auction.

Category controls may be included if they help users scan the available inventory. They must not hide the small launch catalog behind unnecessary interaction.

Loading, empty, and error states must remain useful and truthful:

- Loading: stable skeleton cards with no fake product data.
- Empty: invite visitors to sell and provide a support path.
- Error: explain that auctions could not be loaded and offer retry/browse alternatives where technically valid.

### 4. How the auction works

Explain the buyer journey in three concise steps:

1. Place the first bid and start the countdown for a `first_bid` lot.
2. Bid under clear rules with anti-sniping protection.
3. Win, inspect or receive the item according to the applicable flow, and complete payment safely.

Do not imply that every auction has identical viewing, fulfillment, or settlement arrangements when the product data does not guarantee that.

### 5. Trust

Consolidate repeated trust content into one section. Use only claims supported by current product behavior and policy.

Potential trust points include:

- Real listing photos.
- Seller or listing verification where actually performed.
- Clear auction rules and anti-sniping.
- Viewing availability where applicable.
- Payment handling and dispute support described in language that matches the implemented process and legal terms.
- Direct WhatsApp support.

Claims about escrow, payment holding, inspection, refunds, offices, or guaranteed verification must be checked against current operations, legal copy, and code before publication.

### 6. Seller invitation

Use one focused seller block rather than making the entire page serve two equal funnels.

Communicate:

- Sell through competitive demand rather than repeated negotiation.
- Listing is free during the stated launch period if that offer remains active.
- Sellers keep 95% and pay a 5% success commission only if this is the current verified commercial policy.
- The next action is clear and routes into the existing listing flow.

### 7. Pricing and concise FAQ

Place bidder subscription and buyer-premium information after visitors have seen inventory, understood the mechanic, and received trust reassurance.

Keep the FAQ limited to the objections most likely to block bidding or selling:

- Why is there a bidder subscription?
- When does the timer start?
- What happens if the item differs from its description?
- How does payment work?
- What does it cost to sell?
- How can I arrange a viewing when one is available?

### 8. Final CTA and footer

Return the visitor to real auction inventory. Keep seller and WhatsApp support paths visible but secondary.

The footer includes essential legal links, support information, social presence, language access, and current operating information without repeating the full page.

## Content Integrity

Remove the following unless current, independently defensible evidence is supplied before implementation review:

- `15,000+ buyers`
- `1,250+ items sold`
- `3,400+ items listed`
- Simulated testimonials presented as real customer stories.
- Simulated live bidder counts, bids, countdowns, and activity toasts.
- The local-storage-only early-adopter form and its seeded identities.
- Statements that every listing, seller, payment, viewing, or delivery follows a process the application and operations do not consistently enforce.

The landing page may demonstrate mechanics, but any demo must be unmistakably labeled as a demonstration and must not compete with the real inventory. The preferred design removes the current hero simulator entirely.

## Component Architecture

Do not cosmetically modify the existing 3,000-plus-line `LandingView.tsx`. Decompose the page into focused, testable sections with explicit props and minimal dependencies.

Expected boundaries include:

- Landing shell and section composition.
- Header/navigation.
- Buyer-led hero.
- Featured real-auction preview.
- Auction showcase and auction card.
- First-bid explainer.
- Trust section.
- Seller invitation.
- Pricing and FAQ.
- Final CTA and footer.
- Typed bilingual content.

Preserve and reuse where appropriate:

- `useLandingAuctions` and its real Firestore-backed curation semantics.
- `landingAnalytics` as the safe landing event boundary.
- Existing Logo and theme behavior.
- Language persistence contracts.
- Navigation into discovery, auction, upload, and authentication flows.
- Terms, privacy, and auction-rules surfaces.

Avoid unrelated refactoring outside the landing-page boundary.

## Motion and Interaction

Motion should clarify state or hierarchy, not decorate every surface.

Approved inspiration sources:

- [beUI](https://beui.dev/) as the primary React/Tailwind/Motion implementation reference.
- [Transitions.dev](https://transitions.dev/) for restrained transition patterns.
- [Beautiful UI](https://www.beautifului.dev/) for spacing and visual precision rather than AI-specific components.

Potential patterns:

- Skeleton-to-content reveal for auction loading.
- Subtle CTA label/icon transition.
- Mobile menu open/close.
- Sliding category-pill indicator.
- Accessible FAQ accordion.
- Gentle in-view section/card entrance.
- Real number transition when a price or bid count changes.
- Success-check feedback after a real user action.

Do not install an entire UI system. Adapt the smallest useful pattern to local components using the existing Motion dependency. Preserve license notices or attribution where required.

Avoid:

- Shimmering marketing headlines.
- 3D tilt or cursor glare.
- Bouncy motion on all controls.
- Dynamic-island navigation.
- Fake counters or activity.
- Heavy parallax or scroll choreography.
- Effects that delay interaction or obscure product imagery.

Every nonessential animation must respect reduced-motion preferences.

## Analytics

Maintain analytics as a failure-safe side effect that never blocks rendering or navigation.

Required landing events:

- `landing_viewed` with language.
- `browse_cta_clicked` with placement.
- `auction_viewed` with auction ID and placement.
- `category_selected` where category controls exist.
- `language_switched` with destination language.
- `seller_cta_clicked` with placement.
- Existing seller-form events where the landing page directly reaches that flow.

The broader application already defines `user_registration` and `first_bid`; preserve correlation through the existing analytics architecture rather than duplicating those application events in the landing module.

Before launch, confirm that `window.dataLayer` is connected to the intended analytics destination. Emitting to an unconsumed array is not sufficient measurement.

Core evaluation metrics:

- Landing-to-browse click-through rate.
- Landing-to-auction-view rate.
- Auction-view-to-sign-in-intent rate.
- Sign-in-to-first-bid rate.
- Seller CTA and listing-start rate.
- Conversion by language, viewport class, CTA placement, and auction.

## Accessibility and Responsive Requirements

- Design from a narrow mobile viewport upward.
- Test at representative widths around 320, 375/390, 768, 1024, and wide desktop.
- Meet WCAG 2.1 AA contrast and interaction expectations.
- Preserve visible focus, keyboard navigation, semantic headings, and meaningful control labels.
- Maintain usable touch targets and avoid hover-only information.
- Prevent horizontal overflow in Arabic and English.
- Respect reduced motion.
- Keep content usable when images fail or load slowly.
- Ensure mixed-direction product titles, prices, and numerals remain readable.

## Performance Requirements

- Do not add a large UI-library dependency for isolated visual effects.
- Avoid loading unnecessary hero video or oversized remote imagery.
- Size and lazy-load below-the-fold imagery appropriately.
- Keep layout stable while auctions and images load.
- Avoid animation work that causes sustained main-thread or layout cost.
- Preserve a successful production build and monitor material bundle-size changes.

## Error Handling

- Auction loading failure must not crash or blank the landing page.
- Empty inventory must not render fabricated auctions.
- Missing images receive a stable, branded fallback.
- Missing optional auction fields do not produce broken badges, timers, or prices.
- `first_bid` lots with no valid `endTime` never render a countdown.
- Analytics failure is swallowed at its boundary and never prevents the intended action.
- Language, theme, and local-storage access remain guarded for restricted browser environments.

## Testing and Verification

### Automated

- Unit tests for content selection, auction-card state, first-bid messaging, and analytics payloads.
- Component tests for loading, populated, empty, and error inventory states.
- Tests for Arabic default, saved-language restoration, and Arabic-to-auth language continuity.
- Tests for primary and secondary CTA routing.
- Preserve or update existing navigation, theme/logo, overflow, auction curation, and language persistence tests.
- TypeScript check, full Vitest suite, and production build.

### Rendered review

- Review real data at mobile, tablet, and desktop widths.
- Review Arabic RTL and English LTR.
- Review light and dark themes.
- Review reduced motion.
- Review slow loading, empty inventory, fetch error, missing image, long mixed-language title, and unusually large price.
- Confirm first-bid auctions show no countdown until a real first bid supplies a valid end time.
- Confirm every visible CTA reaches the intended destination.

### Launch-content review

Product and operations must explicitly validate all public claims about fees, premiums, subscriptions, verification, payment handling, viewing, refunds, support availability, and operating hours before deployment.

## Delivery Boundaries

This work redesigns the public landing experience and its directly supporting landing components, content, tests, and analytics calls. It does not redesign discovery, auction rooms, authentication, listing creation, payments, or backend auction semantics.

If implementation reveals that a promised landing behavior requires changing those systems, stop and raise it as a separate product decision rather than silently expanding scope.
