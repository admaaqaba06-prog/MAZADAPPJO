import React, { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import TermsModal from "../components/TermsModal";
import AuctionRulesModal from "../components/AuctionRulesModal";
import { SUPPORT_WHATSAPP_URL } from "../constants/support";
import { emitLandingEvent, type LandingPlacement } from "./landingAnalytics";
import {
  getInitialLandingLanguage,
  landingContent,
  type LandingLanguage,
} from "./landingContent";
import { useLandingAuctions } from "./useLandingAuctions";
import { LandingHeader } from "./components/LandingHeader";
import { LandingHero } from "./components/LandingHero";
import { LandingAuctionShowcase } from "./components/LandingAuctionShowcase";
import { LandingHowItWorks } from "./components/LandingHowItWorks";
import { LandingTrust } from "./components/LandingTrust";
import { LandingSellerInvite } from "./components/LandingSellerInvite";
import { LandingPricingFaq } from "./components/LandingPricingFaq";
import { LandingFooter } from "./components/LandingFooter";

/**
 * The public landing page: a composition shell, and nothing else.
 *
 * WHAT THIS FILE USED TO BE. 3,086 lines holding a marketing page, an
 * interactive bidding simulator with a hard-coded Toyota Camry and a Rolex from
 * Unsplash, a cast of invented Jordanian bidders for a fake bid log, a watcher
 * count that drifted upward on a timer, a local-storage-only "early adopter"
 * form seeded with fictional signups, and `15,000+ buyers` above it all. None of
 * it was testable, which is why none of it was tested, which is why it shipped.
 *
 * WHAT IT IS NOW. State, analytics and navigation live here; every pixel lives
 * in a section component that takes explicit props. This file owns exactly five
 * things, and the reason each one is here rather than in a section:
 *
 *   1. LANGUAGE. One `lang` for the whole page, so no two sections can disagree.
 *   2. INVENTORY. One `useLandingAuctions()` call, so the hero and the showcase
 *      read the same fetch rather than racing two.
 *   3. CALLBACKS. Every CTA emits its event and THEN navigates, from one place,
 *      so a placement cannot be mislabelled section by section.
 *   4. LEGAL MODALS. Terms and rules are page-level surfaces.
 *
 * IN-PAGE SCROLLING IS NOT ONE OF THEM, deliberately. This file used to
 * intercept anchor clicks, measure the header and drive
 * `window.scrollTo({behavior:'smooth'})` after `preventDefault()`. A browser
 * review measured that turning section links into DEAD LINKS: where smooth
 * scrolling is unavailable the scroll silently did nothing, while
 * `preventDefault` had already suppressed the browser's own jump — the hash
 * changed and the page never moved. It is now the browser's job, with
 * `scroll-margin-top` on `.landing-root section[id]` (see index.css) supplying
 * the offset. Native Back/Forward, no measurement, no reduced-motion special
 * case, and nothing that can fail open.
 *
 * Nothing here renders a price, a claim or a countdown.
 */
export interface LandingViewProps {
  /** Enter the app. No target means discovery; 'upload' is the listing flow. */
  onEnter: (target?: string) => void;
  /** Open ONE specific auction. Never called with a substitute id. */
  onOpenAuction: (auctionId: string) => void;
  whatsappUrl?: string;
}

/**
 * `localStorage`, or `null` where it cannot be reached.
 *
 * Private-mode Safari and cookie-blocked embeds throw on ACCESS, not just on
 * read, so even naming the property needs the guard. Returning `null` lets
 * `getInitialLandingLanguage` apply the Arabic default without a try/catch at
 * every call site.
 */
function landingStorage(): Pick<Storage, "getItem"> | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export default function LandingView({
  onEnter,
  onOpenAuction,
  whatsappUrl = SUPPORT_WHATSAPP_URL,
}: LandingViewProps) {
  // The landing page keeps its OWN language state rather than reading the
  // context's: a signed-out visitor has no user document, and this page must
  // switch instantly and completely without waiting on anything.
  const { setLanguage } = useApp();
  const [lang, setLang] = useState<LandingLanguage>(() =>
    getInitialLandingLanguage(landingStorage())
  );
  const content = landingContent[lang];

  const auctionsState = useLandingAuctions();
  // The hero features the FIRST curated lot. Not a random or "best" one:
  // `curateLandingAuctions` already ordered them (featured by rank, then
  // soonest-ending, then newest clockless), and re-deciding here would be a
  // second ordering policy disagreeing with the strip directly below.
  const featured = auctionsState.auctions[0] ?? null;

  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);

  useEffect(() => {
    emitLandingEvent('landing_viewed', { lang });
    // Mount only: this is a page-view, not a language-change event. Switching
    // language emits `language_switched`, and counting a second view for it
    // would inflate the denominator of every rate on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Direction and language on the document, so native controls, scrollbars and
  // text selection follow the page's own language rather than the app shell's.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dir = content.dir;
    document.documentElement.lang = content.langCode;
  }, [content.dir, content.langCode]);

  const toggleLang = () => {
    const next: LandingLanguage = lang === "ar" ? "en" : "ar";
    emitLandingEvent('language_switched', { to: next });
    // Local flip FIRST and unconditionally: this page renders from its own
    // state, and the switch must be instant and total regardless of what
    // happens next.
    setLang(next);
    try {
      localStorage.setItem('mazad_language', next);
    } catch {
      // Storage denied. The UI has already switched; the choice simply will not
      // survive a reload, which is better than a throw inside a click handler.
    }
    // Then the shared path: app-wide state plus the fire-and-forget write to
    // users/{uid}.language. It writes only for a real signed-in session, never
    // awaits, and swallows its own failures — see utils/languagePersistence.ts.
    // NOT re-implemented here: one write, one guard.
    setLanguage(next);
  };

  /**
   * Every CTA does the same two things in the same order: emit, then navigate.
   *
   * The order is the point. A view swap can unmount this component, so
   * navigating first would let the event be lost and the funnel under-count
   * exactly the conversions that succeeded. `emitLandingEvent` swallows its own
   * failures, so putting it first cannot cost a navigation either.
   */
  const browse = (location: LandingPlacement) => () => {
    emitLandingEvent('browse_cta_clicked', { location });
    onEnter();
  };

  const sell = (location: LandingPlacement) => () => {
    emitLandingEvent('seller_cta_clicked', { location });
    onEnter('upload');
  };

  const viewAuction = (location: LandingPlacement) => (auctionId: string) => {
    emitLandingEvent('auction_viewed', { auctionId, location });
    onOpenAuction(auctionId);
  };

  const openRules = () => setIsRulesOpen(true);

  return (
    <div
      dir={content.dir}
      className="min-h-screen font-sans bg-surface text-fg flex flex-col selection:bg-[#F05123]/20 selection:text-[#F05123] relative overflow-x-clip"
    >
      <LandingHeader
        lang={lang}
        copy={content.nav}
        onBrowse={browse('nav')}
        onLanguageToggle={toggleLang}
        whatsappUrl={whatsappUrl}
      />

      <main className="flex-1">
        <LandingHero
          lang={lang}
          copy={content.hero}
          firstBidLabel={content.marketplace.firstBidLabel}
          firstBidHint={content.marketplace.firstBidHint}
          auction={featured}
          isLoading={auctionsState.isLoading}
          onBrowse={browse('hero')}
          onSell={sell('hero')}
          onAuctionView={viewAuction('hero')}
        />

        <LandingAuctionShowcase
          state={auctionsState}
          lang={lang}
          copy={content.marketplace}
          onView={viewAuction('marketplace')}
          onSell={sell('marketplace')}
        />

        <LandingHowItWorks copy={content.how} />

        <LandingTrust copy={content.trust} onRules={openRules} whatsappUrl={whatsappUrl} />

        <LandingSellerInvite copy={content.seller} onSell={sell('seller')} />

        <LandingPricingFaq
          pricing={content.pricing}
          faq={content.faq}
          // Straight to the subscription screen — `wallet` is the view that
          // renders SubscriptionView (App.tsx). A bare `onEnter()` would land
          // the visitor on discovery instead, which is a different screen from
          // the one the button they pressed names.
          //
          // No landing event, deliberately. Subscribing is not one of the
          // approved landing funnel events, and the five approved placements do
          // not include a pricing block — so the honest options were to emit
          // nothing or to invent a sixth bucket that every conversion rate on
          // this page would then be computed over. Measuring this click needs a
          // named event and a review; see the note in landingAnalytics.ts.
          onSubscribe={() => onEnter('wallet')}
        />

        <LandingFooter
          copy={content.footer}
          onBrowse={browse('final')}
          onSell={sell('final')}
          onRules={openRules}
          onTerms={() => setIsTermsOpen(true)}
          // Terms and privacy are ONE document — TermsModal is titled "Terms of
          // Use & Privacy Policy" — reached from two footer entries. Existing
          // behaviour, preserved rather than re-invented.
          onPrivacy={() => setIsTermsOpen(true)}
          whatsappUrl={whatsappUrl}
        />
      </main>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <AuctionRulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
        isAr={lang === "ar"}
      />
    </div>
  );
}
