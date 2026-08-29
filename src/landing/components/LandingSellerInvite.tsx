import React from 'react';
import { Check, Store } from 'lucide-react';
import type { LandingSellerContent } from '../landingContent';

/**
 * The seller path — ONE block, deliberately secondary.
 *
 * The page this replaces served two equal funnels: the hero's primary CTA was
 * "اعرض سلعتك للبيع", a seller comparison table ran the full width above the
 * inventory, and a second seller CTA sat inside the marketplace strip. A visitor
 * who arrived to buy something met three invitations to sell before seeing a
 * product. Real inventory is the page's value demonstration; this section is the
 * supply side staying visible without displacing it.
 *
 * SECONDARY IS A CONTRACT, NOT A STYLE. The action carries
 * `data-cta-priority="secondary"` and an outlined treatment, against the
 * accent-filled Browse control the hero, header and showcase all use. The marker
 * is asserted, so promoting this button to the buyer-primary treatment is a test
 * failure rather than a design drift nobody notices.
 *
 * ONE ACTION, and it is a callback rather than a link: the page shell owns
 * `seller_cta_clicked` and the route into the existing listing flow, so an
 * anchor here would carry the visitor somewhere the shell cannot instrument.
 *
 * The fee sentence is `copy.feeNote` verbatim — "no listing fees currently",
 * 95/5 — which is the current verified commercial policy and is not to be
 * restated, rounded or strengthened here.
 */
export interface LandingSellerInviteProps {
  copy: LandingSellerContent;
  onSell: () => void;
}

export function LandingSellerInvite({ copy, onSell }: LandingSellerInviteProps) {
  return (
    <section id="sell" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-line bg-surface-raised p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-weak px-3 py-1.5 text-xs font-bold text-accent">
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.badge}
            </span>

            <h2 className="mt-4 text-2xl font-black leading-tight text-fg sm:text-3xl">
              {copy.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{copy.body}</p>

            <button
              type="button"
              data-cta-priority="secondary"
              onClick={onSell}
              className="mt-6 cursor-pointer rounded-full border border-accent px-7 py-3.5 text-sm font-bold text-accent transition-colors hover:bg-accent-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.cta}
            </button>
          </div>

          <div className="rounded-2xl bg-surface-sunken p-5">
            <ul className="space-y-3">
              {copy.points.map((point, i) => (
                <li
                  key={point}
                  data-seller-point={i + 1}
                  className="flex items-start gap-2.5 text-sm text-fg"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>

            {/* The commercial terms, verbatim. See the component header. */}
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-muted">
              {copy.feeNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
