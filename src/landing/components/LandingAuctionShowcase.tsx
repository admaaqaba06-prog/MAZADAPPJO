import React from 'react';
import { PackageOpen, WifiOff } from 'lucide-react';
import type { LandingAuctionsState } from '../useLandingAuctions';
import type { LandingLanguage, LandingMarketplaceContent } from '../landingContent';
import { LandingAuctionCard } from './LandingAuctionCard';

/**
 * The real-inventory section: the page's primary value demonstration.
 *
 * FOUR STATES, AND NONE OF THEM FABRICATES STOCK. That is the whole contract.
 * The section this replaces rendered simulated lots so it "never looked dead",
 * which meant a visitor could not tell an empty catalogue from a full one — and
 * a fetch failure looked identical to both.
 *
 * - loading  four fixed skeletons; no product text of any kind.
 * - populated real cards, in exactly the order curation supplied.
 * - empty     says so, and invites the visitor to be an early seller.
 * - error     says the auctions could not be loaded, and offers a real retry.
 *
 * The heading survives every state, so the page keeps its shape and its anchor
 * target while Firestore is slow, empty, or down.
 *
 * ORDER IS NOT RE-DERIVED HERE. `curateLandingAuctions` owns it (featured by
 * rank → clocked soonest → clockless newest), and re-sorting in the view is how
 * that contract quietly acquires a second, disagreeing implementation. This
 * component maps the array it is given, in order.
 *
 * NO CATEGORY FILTER, deliberately. The spec permits category controls but
 * forbids hiding the small launch catalogue behind interaction — with a cap of
 * eight lots, a filter can only ever subtract from what is already scannable.
 * The plumbing (`category_selected` in landingAnalytics) is ready if the
 * catalogue grows enough to need it.
 */
export interface LandingAuctionShowcaseProps {
  state: LandingAuctionsState;
  lang: LandingLanguage;
  copy: LandingMarketplaceContent;
  /** Passed to each card so the clock branches are testable. */
  now?: number;
  onView: (auctionId: string) => void;
  onSell: () => void;
}

const SKELETON_COUNT = 4;

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';

/**
 * A placeholder card. Fixed geometry matching a real card's, so the swap to
 * content does not move the page — the layout-stability requirement. Carries no
 * text at all: a skeleton with a price in it is fabricated inventory.
 */
function CardSkeleton() {
  return (
    <li data-card-skeleton className="rounded-3xl border border-line bg-surface-raised p-3">
      <div className="landing-skeleton aspect-[4/3] w-full rounded-2xl bg-surface-sunken" />
      <div className="mt-3 space-y-2">
        <div className="landing-skeleton h-4 w-3/4 rounded bg-surface-sunken" />
        <div className="landing-skeleton h-3 w-1/3 rounded bg-surface-sunken" />
        <div className="landing-skeleton h-6 w-1/2 rounded bg-surface-sunken" />
        <div className="landing-skeleton h-9 w-full rounded-xl bg-surface-sunken" />
      </div>
    </li>
  );
}

/** Shared frame for the two non-inventory outcomes. */
function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-line bg-surface-raised px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-weak">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-bold text-fg">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{body}</p>
      <div className="mt-6">{action}</div>
    </div>
  );
}

export function LandingAuctionShowcase({
  state,
  lang,
  copy,
  now,
  onView,
  onSell,
}: LandingAuctionShowcaseProps) {
  const { auctions, isLoading, isEmpty, isError } = state;

  const primaryButton =
    'inline-flex cursor-pointer items-center rounded-full bg-accent px-6 py-3 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <section id="auctions" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <header className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{copy.subtitle}</p>
        </header>

        <div className="mt-8">
          {isLoading ? (
            <ul className={GRID} aria-busy="true" aria-label={copy.loadingLabel}>
              {Array.from({ length: SKELETON_COUNT }, (_, i) => (
                <CardSkeleton key={i} />
              ))}
            </ul>
          ) : isError ? (
            /* An error is NOT an empty catalogue and is never dressed as one.
               The retry is a reload, which is a genuine retry here: the module
               cache in `fetchLandingAuctions` is cleared on failure, so the next
               mount refetches rather than replaying the rejection. */
            <Notice
              icon={<WifiOff className="h-6 w-6 text-accent" aria-hidden="true" />}
              title={copy.errorTitle}
              body={copy.errorBody}
              action={
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.location.reload();
                  }}
                  className={primaryButton}
                >
                  {copy.errorRetryCta}
                </button>
              }
            />
          ) : isEmpty || auctions.length === 0 ? (
            <Notice
              icon={<PackageOpen className="h-6 w-6 text-accent" aria-hidden="true" />}
              title={copy.emptyTitle}
              body={copy.emptyBody}
              action={
                <button type="button" onClick={onSell} className={primaryButton}>
                  {copy.emptyCta}
                </button>
              }
            />
          ) : (
            <ul className={GRID}>
              {auctions.map(auction => (
                <li key={auction.id}>
                  <LandingAuctionCard
                    auction={auction}
                    lang={lang}
                    copy={copy}
                    now={now}
                    onView={onView}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
