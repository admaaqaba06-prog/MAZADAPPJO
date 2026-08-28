import React from 'react';
import { Menu, X, MessageCircle, Languages } from 'lucide-react';
import { Logo } from './Logo';
import ThemeToggle from '../../components/ui/ThemeToggle';
import type { LandingLanguage, LandingNavContent } from '../landingContent';

/**
 * The landing page's header.
 *
 * COMPACT BY DESIGN. The previous header carried a full desktop menu for a page
 * with five sections, which meant the primary action — Browse auctions — was
 * one item among seven. Here the link row is secondary and quiet, and Browse is
 * the only filled control in the bar.
 *
 * ANCHORS MUST RESOLVE. Every link comes from `copy.links`, whose ids are the
 * section ids the page renders; nothing here invents a target. The old header
 * linked to `#why-mazzado` and `#categories` after both sections had been
 * reshaped, which is the defect `landingSectionNav.wiring.test.ts` exists to
 * catch. Passing the list in rather than hardcoding it means the nav cannot
 * drift from the page independently of the content module.
 *
 * The support URL is a REQUIRED PROP, not an import. `constants/support.ts` owns
 * the number, and the page shell reads it there — a second import here would be
 * a second place for it to be wrong.
 *
 * Menu state is local. Nothing above this component needs to know whether a
 * mobile menu is open, and the panel stays mounted (toggled with `hidden`) so
 * `aria-controls` always points at an element that exists.
 *
 * THE 320px CONTRACT. The MAZZADO lockup is 600x127, so at `h-8` it is 151px
 * wide — over half of the 288px a 320px screen leaves after `px-4`. With the
 * theme control, the language control and the menu button beside it the row
 * overflowed, and because the landing root carries `overflow-x-clip` the
 * overflow was CLIPPED rather than scrolled: the language control was cut off at
 * the inline end and the menu button was off-screen and unreachable, while
 * `documentElement.scrollWidth` still read 320. Found at 320x700 in Arabic RTL.
 *
 * Two independent mechanisms now hold, so the row cannot overflow again:
 *
 *   1. THE BRAND YIELDS FIRST. It is the only shrinkable item; the control
 *      cluster is `shrink-0`. The lockup gives up width (scaling down under
 *      `object-contain`, never distorting) so every control keeps its size. This
 *      is width-independent — it holds at any viewport, not just the ones tested.
 *   2. THE CLUSTER IS NARROWER BELOW `xs`. The language control drops to an
 *      icon, keeping its accessible name; padding and gaps tighten. That buys
 *      roughly 30px, which is what turns "just fits" into "fits comfortably".
 *
 * `xs` is 360px, so 375 and 390 keep exactly the layout they already had.
 *
 * SUPPORT stays `hidden sm:inline-flex`, and that is a decision rather than an
 * oversight. Making it visible below `sm` fitted at 320 but pushed 360-639 into
 * overflow — the widths this fix exists to preserve. Below `sm` the support
 * route is the mobile panel, which renders it as a full-width link and is now
 * reachable, because the button that opens it is no longer off-screen.
 */
export interface LandingHeaderProps {
  lang: LandingLanguage;
  copy: LandingNavContent;
  onBrowse: () => void;
  onLanguageToggle: () => void;
  whatsappUrl: string;
}

const MENU_ID = 'landing-mobile-menu';

export function LandingHeader({
  lang,
  copy,
  onBrowse,
  onLanguageToggle,
  whatsappUrl,
}: LandingHeaderProps) {
  const isAr = lang === 'ar';
  const [open, setOpen] = React.useState(false);

  /**
   * Every action inside the panel closes it. Leaving it open over the section a
   * visitor just jumped to hides the thing they asked for — and on a short page
   * the panel covers most of the viewport.
   */
  const close = () => setOpen(false);

  const linkClass =
    'text-sm font-medium text-fg-muted hover:text-fg transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded';

  const iconButtonClass =
    'inline-flex items-center justify-center h-9 w-9 rounded-full border border-line ' +
    'text-fg-muted hover:text-fg hover:border-accent transition-colors cursor-pointer ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <header className="sticky top-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-line">
      <div className="mx-auto w-full max-w-6xl px-3 xs:px-4 sm:px-6">
        <div className="flex h-16 items-center gap-2 xs:gap-3">
          {/* Back to top rather than a link: an `href` here would add a target
              that is not a section, and the page has no separate home. */}
          <button
            type="button"
            aria-label={copy.brandLabel}
            onClick={() => {
              close();
              if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
            }}
            // `min-w-0`, and NOT `shrink-0`: this is deliberately the only item
            // in the bar that can give up width, so a control can never be
            // pushed out at a width nobody tested.
            className="min-w-0 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* An explicit cap below `xs`, not `w-full` — the button's width
                comes from this span, so asking the span for 100% of the button
                is circular. `Logo`'s img carries `max-w-full`, which is what
                makes the cap scale the artwork instead of overflowing it. */}
            <Logo className="h-8 max-w-[132px] xs:max-w-none" />
          </button>

          {/* ONE nav landmark for the page's in-section links. The mobile panel
              below repeats them for narrow viewports; a second landmark would
              announce as a duplicate rather than as an alternative. */}
          <nav className="hidden lg:flex items-center gap-6 mx-auto">
            {copy.links.map(link => (
              <a key={link.id} href={`#${link.id}`} className={linkClass}>
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 xs:gap-2 ms-auto lg:ms-0">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={copy.supportLabel}
              title={copy.supportLabel}
              className={`${iconButtonClass} hidden sm:inline-flex`}
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" />
            </a>

            <ThemeToggle isAr={isAr} />

            <button
              type="button"
              onClick={onLanguageToggle}
              // `aria-label` at every width, so the icon-only form below `xs` is
              // never an unlabelled button. It repeats the visible label above
              // `xs`, which is the same string.
              aria-label={copy.languageToggle}
              title={copy.languageToggle}
              className="inline-flex h-9 w-9 xs:h-auto xs:w-auto items-center justify-center rounded-full border border-line xs:px-2.5 xs:py-1.5 text-[11px] font-bold text-fg-muted hover:text-fg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Languages className="w-4 h-4 xs:hidden" aria-hidden="true" />
              <span className="hidden xs:inline">{copy.languageToggle}</span>
            </button>

            <button
              type="button"
              onClick={onBrowse}
              className="hidden sm:inline-flex items-center px-4 py-2 rounded-full bg-accent text-on-accent text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {copy.browseCta}
            </button>

            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              aria-expanded={open}
              aria-controls={MENU_ID}
              className={`${iconButtonClass} lg:hidden`}
            >
              {open ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
              {/* The accessible name. Both labels ship so the control reads
                  correctly in either state without a re-render of the icon
                  carrying the meaning. */}
              <span className="sr-only">{open ? copy.menuCloseLabel : copy.menuOpenLabel}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stays mounted so `aria-controls` never dangles. `hidden` removes it
          from layout AND from the accessibility tree, which a `max-height: 0`
          panel does not — the old menu left its links focusable while closed. */}
      <div
        id={MENU_ID}
        hidden={!open}
        className="lg:hidden border-t border-line bg-surface-raised"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4 flex flex-col gap-1">
          {copy.links.map(link => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={close}
              className="py-2.5 text-sm font-medium text-fg hover:text-accent transition-colors"
            >
              {link.label}
            </a>
          ))}

          <button
            type="button"
            onClick={() => {
              close();
              onBrowse();
            }}
            className="mt-2 w-full text-center px-4 py-3 rounded-xl bg-accent text-on-accent text-sm font-bold cursor-pointer"
          >
            {copy.browseCta}
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 w-full text-center px-4 py-3 rounded-xl border border-line text-sm font-bold text-fg"
          >
            {copy.supportLabel}
          </a>
        </div>
      </div>
    </header>
  );
}
