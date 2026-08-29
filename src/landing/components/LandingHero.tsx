import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ImageOff, Check, Gavel } from 'lucide-react';
import { isAwaitingFirstLandingBid, type LandingAuction } from '../useLandingAuctions';
import type { LandingHeroContent, LandingLanguage } from '../landingContent';
import { categoryLabel } from '../../utils/categories';
import { priceLabel } from '../../utils/bidLabels';

/**
 * The buyer-led hero.
 *
 * WHAT IT REPLACES, and why every absence below is deliberate. The old hero was
 * a simulator: `ACTIVE_ITEMS` held a hard-coded Toyota Camry and a Rolex with
 * Unsplash photography, `AR_NAMES`/`EN_NAMES` supplied invented Jordanian
 * bidders for a fake bid log, a watcher count drifted upward on a timer, and a
 * countdown ticked whether or not any auction had a clock. To a first-time
 * visitor all of it read as real marketplace activity. It is gone, and
 * `landingHero.render.test.tsx` fails if any of it returns.
 *
 * What replaces it is one REAL lot from `useLandingAuctions`, or an honest
 * panel when there is none. The hero never reaches for the data itself: the page
 * shell owns the hook and passes the lot down, so this component has no fetch,
 * no cache and no opinion about curation.
 *
 * THE CLOCKLESS CASE IS THE NORMAL CASE. A `first_bid` lot carries no
 * `endTime` until the server stamps one on its first bid, so at launch most
 * inventory has no clock at all. A countdown is therefore rendered NEVER in the
 * hero — not "when available" — and the first-bid badge plus its one-sentence
 * explanation take that space instead. A badge without the sentence is what
 * reads as broken.
 *
 * The first-bid rule itself is NOT decided here. This file briefly carried its
 * own copy of it, which is how the hero and the auction cards would have come to
 * describe the same lot differently; both now read
 * `isAwaitingFirstLandingBid` from `useLandingAuctions`, and
 * `landingAuctionShowcase.render.test.tsx` asserts they agree.
 */
export interface LandingHeroProps {
  lang: LandingLanguage;
  copy: LandingHeroContent;
  /** From `marketplace.firstBidLabel`, so the hero and the cards agree. */
  firstBidLabel: string;
  /**
   * From `marketplace.firstBidHint` — the sentence that explains why a
   * clockless lot shows no countdown.
   *
   * A PROP rather than a literal in this file, and that is not a style
   * preference: the first draft inlined the sentence as
   * `isAr ? '…' : '…'`, which put a second copy of a factual claim about
   * auction timing outside the reviewed content module. Two copies drift, and
   * the one nobody is reviewing is the one that ships wrong.
   */
  firstBidHint: string;
  /** `null`/`undefined` means "nothing curated" — an honest panel, not a fake lot. */
  auction: LandingAuction | null | undefined;
  isLoading: boolean;
  onBrowse: () => void;
  onSell: () => void;
  /** Must receive the rendered lot's OWN id. Never a default, never a fallback. */
  onAuctionView: (auctionId: string) => void;
}

/**
 * Price as digits plus a unit.
 *
 * Western digits in BOTH languages, matching `utils/arabicNumerals.ts`, which
 * fixes `ARABIC_UI_DIGITS = 'western'` so a number does not change shape with
 * the language. `ar-EG` would render `١٢٠` and an Arabic thousands separator,
 * which no other price on the site uses.
 *
 * The unit is derived from `lang` here rather than read from
 * `marketplace.currency`, because the hero is handed only its own copy plus the
 * first-bid label. Task 3 introduces the shared auction card; the two should
 * converge on one formatter reading the content module then.
 */
function formatPrice(value: number, isAr: boolean): string {
  const digits = Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '0';
  return `${digits} ${isAr ? 'د.أ' : 'JOD'}`;
}

/** Stable skeleton: fixed geometry, no product text, nothing that reads as data. */
function HeroSkeleton({ label }: { label: string }) {
  return (
    <div
      data-hero-skeleton
      aria-busy="true"
      aria-label={label}
      className="rounded-3xl border border-line bg-surface-raised p-4 shadow-sm"
    >
      <div className="landing-skeleton aspect-[4/3] w-full rounded-2xl bg-surface-sunken" />
      <div className="mt-4 space-y-3">
        <div className="landing-skeleton h-4 w-2/3 rounded bg-surface-sunken" />
        <div className="landing-skeleton h-4 w-1/3 rounded bg-surface-sunken" />
        <div className="landing-skeleton h-11 w-full rounded-xl bg-surface-sunken" />
      </div>
    </div>
  );
}

/** The lot's photo, or a branded placeholder. Never an `<img src="">`. */
function HeroImage({ auction }: { auction: LandingAuction }) {
  const [failed, setFailed] = React.useState(false);

  if (!auction.imageUrl || failed) {
    return (
      <div
        data-hero-image-fallback
        className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-surface-sunken text-fg-muted"
      >
        <ImageOff className="h-8 w-8" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={auction.imageUrl}
      alt={auction.title}
      loading="eager"
      // The hero image is the largest paint on the page and above the fold in
      // every viewport, so it is not lazy — but it IS async-decoded, so a slow
      // decode cannot hold up the headline beside it.
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-[4/3] w-full rounded-2xl object-cover bg-surface-sunken"
    />
  );
}

/** The real featured lot. */
function HeroAuctionPanel({
  auction,
  copy,
  firstBidLabel,
  firstBidHint,
  isAr,
  onAuctionView,
}: {
  auction: LandingAuction;
  copy: LandingHeroContent;
  firstBidLabel: string;
  firstBidHint: string;
  isAr: boolean;
  onAuctionView: (auctionId: string) => void;
}) {
  const awaiting = isAwaitingFirstLandingBid(auction);
  const category = categoryLabel(auction.category, isAr);

  return (
    <div className="rounded-3xl border border-line bg-surface-raised p-4 shadow-sm">
      <div className="relative">
        <HeroImage auction={auction} />
        <span className="absolute top-3 start-3 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-on-accent">
          {copy.featuredLabel}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold leading-snug text-fg line-clamp-2">
            {auction.title}
          </h2>
          {/* `isVerified` is `approvalStatus === 'approved'` — a LISTING review.
              Rendered only when the flag is actually set. */}
          {auction.isVerified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-weak px-2 py-1 text-[10px] font-bold text-accent">
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </div>

        {category && <p className="text-xs font-medium text-fg-muted">{category}</p>}

        <div>
          <p className="text-xs font-medium text-fg-muted">
            {priceLabel(auction.totalBids, isAr)}
          </p>
          <p
            className="text-2xl font-black text-fg"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatPrice(auction.currentPrice, isAr)}
          </p>
        </div>

        {/* The first-bid state, with its explanation. No countdown is rendered
            in the hero in ANY state — see the component header. */}
        {awaiting && (
          <div className="rounded-xl bg-accent-weak p-3">
            <p className="text-xs font-bold text-accent">{firstBidLabel}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{firstBidHint}</p>
          </div>
        )}

        <button
          type="button"
          data-auction-id={auction.id}
          onClick={() => onAuctionView(auction.id)}
          className="w-full cursor-pointer rounded-xl bg-accent px-4 py-3 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.viewCta}
        </button>
      </div>
    </div>
  );
}

/** No lot curated. Says so, and routes onward. Never a fabricated auction. */
function HeroFallbackPanel({ copy }: { copy: LandingHeroContent }) {
  // INFORMATIONAL ONLY. No button: the hero's own Browse and Sell controls sit
  // a few hundred pixels away in the left column, and a third identical CTA
  // here is noise rather than a route. What the panel owes the visitor is an
  // honest reason the product slot is empty.
  return (
    <div className="rounded-3xl border border-line bg-surface-raised p-8 text-center shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-weak">
        <Gavel className="h-6 w-6 text-accent" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-bold text-fg">{copy.fallbackTitle}</h2>
      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{copy.fallbackBody}</p>
    </div>
  );
}

export function LandingHero({
  lang,
  copy,
  firstBidLabel,
  firstBidHint,
  auction,
  isLoading,
  onBrowse,
  onSell,
  onAuctionView,
}: LandingHeroProps) {
  const isAr = lang === 'ar';
  const reduce = useReducedMotion();

  /**
   * ONE entrance, on mount, for the two halves of the hero.
   *
   * Not gated on `useInView`: the hero is above the fold in every viewport, so
   * a viewport-gated reveal can only ever delay the first thing a visitor reads.
   * Under reduced motion `initial` is `false`, which renders the final state
   * directly rather than animating to it quickly — the distinction the spec
   * asks for, and it also means a failed animation cannot leave the headline at
   * `opacity: 0`.
   */
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
        };

  return (
    <section className="px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <motion.div {...rise(0)}>
          <span className="inline-flex items-center rounded-full bg-accent-weak px-3 py-1.5 text-xs font-bold text-accent">
            {copy.badge}
          </span>

          <h1 className="mt-5 text-3xl font-black leading-[1.15] text-fg sm:text-4xl lg:text-5xl">
            {copy.title}
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            {copy.subtitle}
          </p>

          <ul className="mt-6 space-y-2.5">
            {copy.points.map(point => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-fg">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          {/* Browse first, in the DOM and on screen. The seller path is visible
              but is deliberately the outlined control, not the filled one. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onBrowse}
              className="cursor-pointer rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.primaryCta}
            </button>
            <button
              type="button"
              onClick={onSell}
              className="cursor-pointer rounded-full border border-line bg-surface-raised px-7 py-3.5 text-sm font-bold text-fg transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.secondaryCta}
            </button>
          </div>
        </motion.div>

        <motion.div {...rise(reduce ? 0 : 0.08)}>
          {isLoading ? (
            <HeroSkeleton label={copy.loadingLabel} />
          ) : auction ? (
            <HeroAuctionPanel
              auction={auction}
              copy={copy}
              firstBidLabel={firstBidLabel}
              firstBidHint={firstBidHint}
              isAr={isAr}
              onAuctionView={onAuctionView}
            />
          ) : (
            <HeroFallbackPanel copy={copy} />
          )}
        </motion.div>
      </div>
    </section>
  );
}
