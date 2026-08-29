import React from 'react';
import { MessageCircle, Phone, Instagram } from 'lucide-react';
import { Logo } from './Logo';
import type { LandingFooterContent } from '../landingContent';
import {
  SUPPORT_PHONE_NATIONAL,
  SUPPORT_PHONE_TEL,
  SOCIAL_INSTAGRAM_URL,
} from '../../constants/support';

/**
 * The closing CTA and the footer.
 *
 * IT RETURNS THE VISITOR TO INVENTORY. The page this replaces ended on a
 * local-storage-only "early adopter" form seeded with invented names — a
 * conversion that recorded nothing and reached nobody. The last thing on the page
 * is now the same action as the first: browse the real auctions. Sell stays
 * visible behind it, in that order, marked and asserted.
 *
 * CONTACT DETAILS ARE IMPORTED, NEVER TYPED. `constants/support.ts` derives every
 * format from one national number, and the WhatsApp URL arrives as a prop so the
 * shell hands the same value to the header, the trust section and here. A support
 * number that is wrong in one place is worse than no number at all, because
 * whoever dials it believes they reached us — which is why
 * `supportPhone.parity.test.ts` scans the whole tree for stale copies.
 *
 * NO OPERATING HOURS. The spec lists them, and they are deliberately absent:
 * there is no hours value anywhere in the repository, so anything printed here
 * would be invented. Same for the operator entity, its registration number and
 * the street address — removed on 2026-08-26 and enforced repo-wide by
 * `operatorIdentity.test.ts`. Both omissions are asserted, so neither can return
 * as a plausible-looking guess.
 *
 * NO LANGUAGE CONTROL, deliberately. The header is `sticky top-0`, so its
 * language toggle is reachable from anywhere on the page; a second control here
 * would need its own callback and its own persistence path for no gain. This
 * leaves `footer.languageLabel` unused in the content module.
 *
 * Legal surfaces open through callbacks rather than hrefs: terms, privacy and the
 * auction rules are modals owned by the page shell, and inventing `/terms` URLs
 * for them would produce three links to nothing.
 */
export interface LandingFooterProps {
  copy: LandingFooterContent;
  onBrowse: () => void;
  onSell: () => void;
  onRules: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  whatsappUrl: string;
}

export function LandingFooter({
  copy,
  onBrowse,
  onSell,
  onRules,
  onTerms,
  onPrivacy,
  whatsappUrl,
}: LandingFooterProps) {
  const legalActions: Array<{ label: string; onClick: () => void }> = [
    { label: copy.rulesLabel, onClick: onRules },
    { label: copy.termsLabel, onClick: onTerms },
    { label: copy.privacyLabel, onClick: onPrivacy },
  ];

  const externalLinkClass =
    'inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded';

  return (
    <>
      {/* The final CTA. Browse first and filled; Sell second and outlined. */}
      <section className="px-4 pb-14 sm:px-6 sm:pb-20">
        <div className="mx-auto w-full max-w-6xl rounded-3xl border border-line bg-surface-raised px-6 py-12 text-center sm:px-10 sm:py-16">
          <h2 className="text-2xl font-black leading-tight text-fg sm:text-3xl">
            {copy.finalTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">
            {copy.finalBody}
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              data-cta-priority="primary"
              onClick={onBrowse}
              className="cursor-pointer rounded-full bg-accent px-7 py-3.5 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.browseCta}
            </button>
            <button
              type="button"
              data-cta-priority="secondary"
              onClick={onSell}
              className="cursor-pointer rounded-full border border-line bg-surface-raised px-7 py-3.5 text-sm font-bold text-fg transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.sellCta}
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-line px-4 py-12 sm:px-6">
        <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Logo className="h-8" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-fg-muted">
              {copy.description}
            </p>
          </div>

          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-fg">
              {copy.supportTitle}
            </h2>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClass}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {copy.whatsappLabel}
                </a>
              </li>
              <li>
                {/* Derived `tel:` form; the visible text is the local trunk form
                    a Jordanian reader expects. Both from the one constant. */}
                <a href={SUPPORT_PHONE_TEL} className={externalLinkClass}>
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {copy.phoneLabel}
                    {' · '}
                    <span style={{ unicodeBidi: 'plaintext' }}>{SUPPORT_PHONE_NATIONAL}</span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={SOCIAL_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClass}
                >
                  <Instagram className="h-4 w-4" aria-hidden="true" />
                  {copy.instagramLabel}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-fg">
              {copy.legalTitle}
            </h2>
            <ul className="mt-4 space-y-3">
              {legalActions.map(action => (
                <li key={action.label}>
                  <button
                    type="button"
                    data-legal-action
                    onClick={action.onClick}
                    className="cursor-pointer rounded text-start text-sm text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {action.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-10 w-full max-w-6xl border-t border-line pt-6">
          <p className="text-xs text-fg-muted">{copy.rights}</p>
        </div>
      </footer>
    </>
  );
}
