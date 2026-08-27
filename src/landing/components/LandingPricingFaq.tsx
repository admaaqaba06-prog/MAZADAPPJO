import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { LandingFaqContent, LandingPricingContent } from '../landingContent';

/**
 * Subscription pricing and the FAQ — the page's last two objections.
 *
 * PLACED LATE ON PURPOSE. The old page asked for a subscription before a visitor
 * had seen a single product; this section sits after the inventory, the mechanic
 * and the trust points, so "1 JOD to bid" is read against something already
 * wanted rather than as a cover charge at the door.
 *
 * PRICES ARE THE SERVER'S. Every figure comes from `pricing.plans`, whose values
 * are pinned in `landingContent.test.ts` against `constants/subscriptionTiers.ts`
 * — itself a display mirror of `functions/subscriptionTiers.js`, from which the
 * server derives every grant. A price advertised here that the server will not
 * accept is a customer taking a payment action that cannot succeed, which is why
 * `landingClosing.render.test.tsx` also asserts that NO other JOD figure appears
 * in the rendered output.
 *
 * The buyer premium is displayed beside the plans rather than buried in the FAQ.
 * It is 5% on top of the winning bid, it is a real cost to a bidder, and a
 * pricing block that shows only the subscription understates what bidding costs.
 *
 * THE ACCORDION follows the WAI-ARIA pattern: a button per question carrying
 * `aria-expanded` and `aria-controls`, and a panel labelled back by that
 * button's id. Panels stay MOUNTED and toggle the `hidden` attribute — so every
 * answer is in the document for a crawler or a reader without JavaScript, and a
 * closed answer is out of the tab order rather than merely invisible. One open at
 * a time: six expanded answers is the wall of text an accordion exists to avoid.
 *
 * Motion is a single chevron rotation under `motion-safe:`, so a
 * reduced-motion visitor gets the same state change with no transition. Nothing
 * here animates height — that would require unmounting the panels, and losing
 * the no-JavaScript answers to buy an easing curve is a bad trade.
 */
export interface LandingPricingFaqProps {
  pricing: LandingPricingContent;
  faq: LandingFaqContent;
  onSubscribe: () => void;
}

export function LandingPricingFaq({ pricing, faq, onSubscribe }: LandingPricingFaqProps) {
  // The first answer is open. Something must be, or the section ships as six
  // closed bars with no visible content at all before JavaScript runs.
  const [openId, setOpenId] = React.useState<string | null>(faq.items[0]?.id ?? null);

  return (
    <>
      <section id="pricing" className="bg-surface-sunken px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <header className="max-w-2xl">
            <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">
              {pricing.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">
              {pricing.subtitle}
            </p>
          </header>

          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {pricing.plans.map(plan => (
              <li
                key={plan.id}
                data-plan={plan.id}
                className={
                  'relative flex flex-col rounded-3xl bg-surface-raised p-6 ' +
                  (plan.badge ? 'border-2 border-accent' : 'border border-line')
                }
              >
                {/* Rendered only where the content declares one: nothing here
                    invents a "most popular" out of position in the array. */}
                {plan.badge && (
                  <span
                    data-plan-badge
                    className="absolute -top-3 start-6 rounded-full bg-accent px-3 py-1 text-[10px] font-black uppercase tracking-wide text-on-accent"
                  >
                    {plan.badge}
                  </span>
                )}

                <h3 className="text-lg font-bold text-fg">{plan.name}</h3>

                <p className="mt-3 flex items-baseline gap-1.5">
                  <span
                    className="text-3xl font-black text-fg"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {plan.priceLabel}
                  </span>
                  <span className="text-xs text-fg-muted">{plan.periodLabel}</span>
                </p>

                <ul className="mt-5 flex-1 space-y-2.5 border-t border-line pt-5">
                  {plan.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-fg-muted">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  data-subscribe
                  onClick={onSubscribe}
                  className={
                    'mt-6 w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
                    (plan.badge
                      ? 'bg-accent text-on-accent'
                      : 'border border-line bg-surface-raised text-fg')
                  }
                >
                  {pricing.cta}
                </button>
              </li>
            ))}
          </ul>

          {/* The other two costs a bidder is owed up front. */}
          <div className="mt-6 rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-sm font-bold text-fg">{pricing.buyerPremiumLabel}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              {pricing.buyerPremiumNote}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{pricing.noDepositNote}</p>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-3xl">
          <header>
            <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">{faq.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">
              {faq.subtitle}
            </p>
          </header>

          <div className="mt-8 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface-raised">
            {faq.items.map(item => {
              const controlId = `faq-control-${item.id}`;
              const panelId = `faq-panel-${item.id}`;
              const isOpen = openId === item.id;

              return (
                <div key={item.id}>
                  <h3>
                    <button
                      type="button"
                      data-faq-control
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      id={controlId}
                      // Single-open: opening one closes the rest. Clicking the
                      // open one closes it, so the section can be fully collapsed.
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-start text-sm font-bold text-fg transition-colors hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={
                          'h-4 w-4 shrink-0 text-fg-muted motion-safe:transition-transform ' +
                          (isOpen ? 'rotate-180' : '')
                        }
                      />
                    </button>
                  </h3>

                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={controlId}
                    hidden={!isOpen}
                    className="px-5 pb-5"
                  >
                    <p className="text-sm leading-relaxed text-fg-muted">{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
