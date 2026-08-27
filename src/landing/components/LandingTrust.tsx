import React from 'react';
import { Camera, BadgeCheck, Scale, Lock, WalletMinimal, MessageCircle } from 'lucide-react';
import type { LandingTrustContent } from '../landingContent';

/**
 * One trust section, replacing four.
 *
 * The old page made trust claims in the hero badges, a dedicated trust strip, a
 * "why us" comparison table and the FAQ — four places, written at four
 * different times, and they had drifted. The strip claimed "Full identity and
 * document checking of ALL sellers before any auction begins"; the code behind
 * the badge is `approvalStatus === 'approved'`, which is Mazzado reviewing a
 * LISTING. Consolidating is not tidying: it means there is one place to check a
 * claim against the policy, and one place a review can be wrong.
 *
 * WHAT THIS SECTION MAY SAY is therefore fixed by `landingContent`, whose header
 * records the source of every claim — `content/auctionRules.ts` for fees,
 * binding bids, 24h payment, anti-sniping and the no-deposit rule, and
 * `content/legalTerms.ts` for dispute handling. This file adds no sentence of
 * its own and no adjective; `landingEducation.render.test.tsx` asserts the
 * absence of the specific statements that were removed.
 *
 * The two actions are the honest ones: read the rules that govern all of this,
 * and talk to a human. The rules open through a callback so the page shell owns
 * the modal; the support URL arrives as a prop because `constants/support.ts`
 * owns the number and a second import here is a second place for it to be wrong.
 */
export interface LandingTrustProps {
  copy: LandingTrustContent;
  onRules: () => void;
  whatsappUrl: string;
}

/** Keyed by the content's own point ids, so a reordering cannot mismatch them. */
const POINT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'real-photos': Camera,
  'reviewed-listings': BadgeCheck,
  'fair-rules': Scale,
  'held-payment': Lock,
  'no-deposit': WalletMinimal,
  support: MessageCircle,
};

export function LandingTrust({ copy, onRules, whatsappUrl }: LandingTrustProps) {
  return (
    <section id="trust" className="bg-surface-sunken px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <header className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{copy.subtitle}</p>
        </header>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copy.points.map(point => {
            const Icon = POINT_ICONS[point.id];
            return (
              <li
                key={point.id}
                data-trust-point={point.id}
                className="rounded-3xl border border-line bg-surface-raised p-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-weak">
                  {Icon && <Icon className="h-5 w-5 text-accent" aria-hidden="true" />}
                </span>
                <h3 className="mt-4 text-sm font-bold leading-snug text-fg">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{point.body}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            data-trust-rules
            onClick={onRules}
            className="cursor-pointer rounded-full border border-accent px-6 py-3 text-sm font-bold text-accent transition-colors hover:bg-accent-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {copy.rulesCta}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-line bg-surface-raised px-6 py-3 text-sm font-bold text-fg transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {copy.supportCta}
          </a>
        </div>
      </div>
    </section>
  );
}
