import React from 'react';
import { ImageOff, Check, Clock } from 'lucide-react';
import { isAwaitingFirstLandingBid, type LandingAuction } from '../useLandingAuctions';
import type { LandingLanguage, LandingMarketplaceContent } from '../landingContent';
import { categoryLabel } from '../../utils/categories';
import { priceLabel } from '../../utils/bidLabels';
import { formatCountdown } from '../../utils/bidFormat';
import { toWesternDigits } from '../../utils/arabicNumerals';

/**
 * One real auction.
 *
 * EVERY BADGE IS EARNED BY A FIELD. The strip this replaces could show
 * "ينتهي قريباً" on a lot with no clock and "كن أول مزايد" on a lot with
 * twenty-five bids, because neither badge was tied to the data behind it. Here
 * the first-bid state comes from `isAwaitingFirstLandingBid` — the same
 * predicate the hero reads — the reviewed-listing badge from `isVerified`, and
 * a time claim only from a clock that exists and has not passed.
 *
 * NO CARD EVER RENDERS `MM:SS`, and that is a design decision rather than an
 * omission. A landing card is painted once and never ticks: eight cards
 * re-rendering every second is exactly the sustained main-thread cost the spec
 * rules out, and a frozen `00:47` is a lie within a minute of paint. So the
 * card makes the coarsest true statement instead — "ending soon" under an hour,
 * `6س 02د` above it — both of which stay approximately right for as long as a
 * visitor is likely to be reading.
 *
 * THE WHOLE CARD IS ONE TARGET, via a stretched pseudo-element on its single
 * button rather than an `onClick` on the container. One focusable control, one
 * accessible name, valid HTML, and the title stays a real heading — a `<button>`
 * may not contain one.
 */
export interface LandingAuctionCardProps {
  auction: LandingAuction;
  lang: LandingLanguage;
  copy: LandingMarketplaceContent;
  /** Injected so the clock branches are testable without freezing time. */
  now?: number;
  onView: (auctionId: string) => void;
}

const HOUR_MS = 3_600_000;

/**
 * The card's one permitted time claim, or `null` for "say nothing".
 *
 * Returns `null` for a lot with no usable clock AND for one whose clock has
 * already passed. Curation drops expired lots, but a card must not lean on
 * that: `now` advances while the page sits open, so a lot that was live at
 * fetch can be over by the time anyone reads it.
 *
 * Digits are forced Western even in Arabic. `formatCountdown` renders its
 * Arabic branch in Arabic-Indic (`٦س ٠٢د`), which would put two numeral systems
 * on one card next to a `120 د.أ` price; `utils/arabicNumerals.ts` fixes
 * ARABIC_UI_DIGITS at 'western' precisely so a number does not change shape
 * with the language. The Arabic UNIT letters are kept — those are language, not
 * numerals.
 */
export function landingClockLabel(
  endTime: LandingAuction['endTime'],
  now: number,
  isAr: boolean,
  copy: LandingMarketplaceContent
): string | null {
  const hasClock = typeof endTime === 'number' && Number.isFinite(endTime) && endTime > 0;
  if (!hasClock) return null;

  const msLeft = (endTime as number) - now;
  if (msLeft <= 0) return null;
  // Under an hour, a number would be stale before it was read. The categorical
  // statement is the honest one.
  if (msLeft < HOUR_MS) return copy.endingSoonLabel;

  return toWesternDigits(formatCountdown(Math.floor(msLeft / 1000), isAr));
}

/** The lot's photo, or a stable placeholder. Never an `<img src="">`. */
function CardImage({ auction, copy }: { auction: LandingAuction; copy: LandingMarketplaceContent }) {
  const [failed, setFailed] = React.useState(false);

  if (!auction.imageUrl || failed) {
    return (
      <div
        data-card-image-fallback
        role="img"
        aria-label={copy.imageFallbackLabel}
        className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-surface-sunken text-fg-muted"
      >
        <ImageOff className="h-7 w-7" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={auction.imageUrl}
      alt={auction.title}
      // Below the fold in every viewport, so it is lazy — and `decoding="async"`
      // keeps a slow decode from blocking the rest of the strip.
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-[4/3] w-full rounded-2xl object-cover bg-surface-sunken"
    />
  );
}

export function LandingAuctionCard({
  auction,
  lang,
  copy,
  now = Date.now(),
  onView,
}: LandingAuctionCardProps) {
  const isAr = lang === 'ar';
  const awaiting = isAwaitingFirstLandingBid(auction);
  const clock = landingClockLabel(auction.endTime, now, isAr, copy);
  const category = categoryLabel(auction.category, isAr);
  const bids = auction.totalBids || 0;

  return (
    <article className="relative flex h-full flex-col rounded-3xl border border-line bg-surface-raised p-3 shadow-sm transition-shadow hover:shadow-md focus-within:shadow-md">
      <div className="relative">
        <CardImage auction={auction} copy={copy} />

        {/* Listing review, NOT seller identity verification. Only when set. */}
        {auction.isVerified && (
          <span className="absolute top-2 start-2 inline-flex items-center gap-1 rounded-full bg-surface-raised/95 px-2 py-1 text-[10px] font-bold text-fg shadow-sm">
            <Check className="h-3 w-3 text-accent" aria-hidden="true" />
            {copy.verifiedLabel}
          </span>
        )}

        {clock && (
          <span
            data-card-clock
            className="absolute bottom-2 end-2 inline-flex items-center gap-1 rounded-full bg-surface-raised/95 px-2 py-1 text-[10px] font-bold text-fg shadow-sm"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <Clock className="h-3 w-3 text-accent" aria-hidden="true" />
            {clock}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-2">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-fg">{auction.title}</h3>

        {category && <p className="text-xs font-medium text-fg-muted">{category}</p>}

        <div className="mt-auto">
          <p className="text-[11px] font-medium text-fg-muted">
            {/* The same words the auction room uses, from utils/bidLabels: a lot
                opening at its starting price is not a "current bid". */}
            {priceLabel(auction.totalBids, isAr)}
          </p>
          <p
            className="text-lg font-black text-fg"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {/* Western digits in both languages, matching ARABIC_UI_DIGITS.
                Mirrors `formatPrice` in LandingHero — the two should converge on
                one shared formatter once a landing format module exists. */}
            {Math.round(auction.currentPrice).toLocaleString('en-US')} {copy.currency}
          </p>
          {bids > 0 && (
            <p className="text-[11px] text-fg-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {bids.toLocaleString('en-US')} {copy.bidsLabel}
            </p>
          )}
        </div>

        {awaiting && (
          <div className="rounded-xl bg-accent-weak p-2.5">
            <p className="text-[11px] font-bold text-accent">{copy.firstBidLabel}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{copy.firstBidHint}</p>
          </div>
        )}

        <button
          type="button"
          data-auction-id={auction.id}
          aria-label={`${copy.viewCta}: ${auction.title}`}
          onClick={() => onView(auction.id)}
          // The stretched target: `after` covers the whole positioned card, so a
          // tap anywhere activates this one control.
          className="mt-1 w-full cursor-pointer rounded-xl border border-line px-3 py-2.5 text-xs font-bold text-fg transition-colors hover:border-accent hover:text-accent after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {copy.viewCta}
        </button>
      </div>
    </article>
  );
}
