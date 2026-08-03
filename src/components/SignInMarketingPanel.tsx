/**
 * The marketing half of the sign-in screen.
 *
 * The sign-in screen is not a gate that explains why you were stopped — most
 * visitors reach it with no history at all (an ad, a shared link, a typed URL),
 * so it has to stand on its own. Spec:
 * docs/superpowers/specs/2026-08-03-signin-screen-design.md
 *
 * PRESENTATIONAL AND PROPS-ONLY, deliberately. No context, no hooks, no fetch —
 * that is what lets it be rendered in a node test (vitest is
 * `environment: 'node'`; there is no jsdom). `LoginView` owns the data.
 *
 * Three blocks in Fogg order (Behavior = Motivation × Ability × Prompt): the
 * prompt and the ability are already fine on this screen — the buttons are one
 * tap and unmissable — so MOTIVATION leads. Live activity first, because a
 * visitor who thinks the marketplace is empty never gets as far as wondering
 * whether it is safe; then escrow, the objection that actually stops people
 * buying from a stranger; then how it works.
 */
import React from 'react';
import { selectPanelActivity } from '../utils/signInPanel';
import { panelCopy } from './signInPanelCopy';
import type { LandingAuctionsState } from '../landing/useLandingAuctions';

export interface SignInMarketingPanelProps {
  state: LandingAuctionsState;
  lang: 'ar' | 'en';
  /**
   * `activity` — the live lots alone. Sits directly BENEATH the sign-in card:
   *              MJ's call after seeing it beside the form. The form is the
   *              primary action and leads; the inventory is proof underneath it
   *              rather than something competing with it for first attention.
   * `story`    — trust and how-it-works, without the lots. The desktop left
   *              column.
   * `full`     — all three blocks, in Fogg order. Kept for the single-column
   *              case and for tests that assert the full composition.
   * `compact`  — hook and objection only, no steps.
   * `steps`    — the three steps alone.
   */
  variant?: 'full' | 'compact' | 'steps' | 'activity' | 'story';
}

export function SignInMarketingPanel({
  state,
  lang,
  variant = 'full',
}: SignInMarketingPanelProps) {
  // null means RENDER NOTHING — loading, empty, errored, or nothing renderable.
  // No skeleton: a placeholder shaped like content promises content that may
  // never arrive, and this screen must never look broken.
  const activity = selectPanelActivity(state);
  const c = panelCopy(lang);
  const currency = lang === 'en' ? 'JOD' : 'د.أ';
  const showActivity = variant !== 'steps' && variant !== 'story' && activity;
  const showTrust = variant !== 'steps' && variant !== 'activity';
  const showSteps = variant !== 'compact' && variant !== 'activity';

  return (
    <div className="w-full max-w-md lg:max-w-lg text-fg">
      {showActivity && (
        <section aria-labelledby="signin-activity-label">
          <p id="signin-activity-label" className="text-sm font-bold text-fg">
            {c.activityLabel(activity.count)}
          </p>
          <ul className="mt-3 space-y-2">
            {activity.lots.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-sunken p-2"
              >
                <img
                  src={l.imageUrl}
                  alt={l.title}
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{l.title}</span>
                {/*
                  Price only. No countdown: measured on production 2026-08-03,
                  149 lots are live and 4 carry a future endTime, so a clock
                  would be absent or wrong on ~97% of inventory. The data to
                  render one is deliberately not on PanelLot.
                */}
                <span className="shrink-0 text-sm font-bold text-fg whitespace-nowrap">
                  {l.currentPrice} {currency}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showTrust && (
        <section className={activity ? 'mt-6' : ''}>
          <h2 className="text-base font-black text-fg">{c.trustTitle}</h2>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">{c.trustBody}</p>
        </section>
      )}

      {showSteps && (
        <section className={showTrust ? 'mt-6' : ''}>
          <h2 className="text-base font-black text-fg">{c.howTitle}</h2>
          <ol className="mt-2 space-y-1.5">
            {c.steps.map((s, i) => (
              <li key={i} className="text-sm text-fg-muted">
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
