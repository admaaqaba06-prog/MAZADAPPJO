import React from 'react';
import { Gavel, Scale, ShieldCheck } from 'lucide-react';
import type { LandingHowContent } from '../landingContent';

/**
 * How the auction works, in three steps.
 *
 * THIS SLOT USED TO HOLD A SIMULATOR. The old page put an interactive fake
 * bidding room here — a "زايد الآن" button that moved an invented price against
 * invented competitors. It taught the mechanic by pretending, which meant the
 * one thing a visitor could not learn from it was what actually happens. This
 * section explains and does nothing: no button, no input, no form.
 *
 * STEP ONE IS DOMINANT ON PURPOSE. The first-bid rule is the single mechanic the
 * page exists to teach — it is why a card shows "كن أول مزايد" where a visitor
 * expects a timer. Three equal columns would file it as one fact among three,
 * so it takes the full width of the row above the other two and carries the
 * accent tint.
 *
 * An `<ol>` because the order is the content: these are not three features, they
 * are a sequence. The visible numerals are `aria-hidden` — the list already
 * conveys position, and a screen reader announcing "1 one Place the first bid"
 * is worse than either alone.
 *
 * Every sentence comes from `landingContent`. Nothing is composed here: this
 * section states policy (anti-sniping, 24h payment, held funds), and a component
 * that phrases policy itself is a claim no content review has seen.
 */
export interface LandingHowItWorksProps {
  copy: LandingHowContent;
}

/** Keyed by the content's own step ids, so a reordering cannot mismatch them. */
const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'first-bid': Gavel,
  'bid-rules': Scale,
  'win-pay': ShieldCheck,
};

export function LandingHowItWorks({ copy }: LandingHowItWorksProps) {
  return (
    <section id="how" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-6xl">
        <header className="max-w-2xl">
          <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted sm:text-base">{copy.subtitle}</p>
        </header>

        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {copy.steps.map((step, i) => {
            const Icon = STEP_ICONS[step.id];
            const isLead = i === 0;

            return (
              <li
                key={step.id}
                data-auction-step={i + 1}
                {...(isLead ? { 'data-auction-step-lead': '' } : {})}
                className={
                  isLead
                    ? 'rounded-3xl border border-accent bg-accent-weak p-6 md:col-span-2'
                    : 'rounded-3xl border border-line bg-surface-raised p-6'
                }
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ' +
                      (isLead ? 'bg-accent text-on-accent' : 'bg-accent-weak text-accent')
                    }
                  >
                    {i + 1}
                  </span>
                  {Icon && (
                    <Icon
                      className={`h-5 w-5 ${isLead ? 'text-accent' : 'text-fg-muted'}`}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <h3
                  className={`mt-4 font-bold leading-snug text-fg ${isLead ? 'text-lg sm:text-xl' : 'text-base'}`}
                >
                  {step.title}
                </h3>
                <p
                  className={`mt-2 leading-relaxed text-fg-muted ${isLead ? 'text-sm sm:text-base' : 'text-sm'}`}
                >
                  {step.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
