import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Immediate feedback for a CTA whose work is a route change.
 *
 * THE DEFECT THIS FIXES. Measured on production at 390px with a
 * MutationObserver watching the whole document: tapping «بيع منتجك» produced a
 * DOM mutation somewhere within 6ms and the login gate 405ms later, but the
 * observer NEVER fired for the button element itself. Nothing about the control
 * the finger touched changed — no disabled state, no spinner, no pressed state
 * that outlives the touch. The audit measured the same button appearing dead for
 * over four seconds; I could not reproduce that duration unthrottled on a warm
 * cache, but duration is not the defect. Zero acknowledgement is the defect, and
 * it is there at 400ms and at 4s alike.
 *
 * The latency itself is React.lazy fetching the view chunk (`SellView`,
 * `LiveStreamView` and friends are all lazy). The handlers are synchronous —
 * `setActiveView('upload')` returns instantly — so there is no promise to hang
 * a spinner on.
 *
 * WHY A CAPTURE HANDLER AND A DOM ATTRIBUTE, NOT REACT STATE.
 *
 * DesktopFrame alone has seventeen buttons that switch view. Giving each one its
 * own `useState` is seventeen near-identical edits to a file I was asked not to
 * refactor, and seventeen chances to miss one. One capture listener on the shell
 * root covers every button inside it, including any added later.
 *
 * The attribute is written straight to the node rather than through state
 * because it must land in the SAME tick as the click. A `setState` schedules a
 * re-render; on a main thread that is about to parse a 78KB chunk, that render
 * can be the thing that is late. `setAttribute` is synchronous and the
 * MutationObserver sees it immediately — which is exactly the acceptance
 * criterion this was written against.
 *
 * DOUBLE-FIRE. The pending attribute also disables the control: the CSS rule
 * for `[data-cta-pending]` sets `pointer-events: none`, so the browser does not
 * dispatch a second click at all. The capture handler additionally swallows any
 * event that does reach an already-pending button, which covers a
 * programmatic `.click()` — the case CSS cannot stop.
 */

/** Marks the control the user actually touched, and is the CSS hook. */
const PENDING_ATTR = 'data-cta-pending';

/**
 * Hard cap on how long a control may look busy.
 *
 * This is not decoration, it is the fix for a bug this hook shipped with. The
 * release was originally an effect with no dependency array, on the assumption
 * it would run after every render. But this hook deliberately does NOT call
 * setState — that is the whole point of writing the attribute to the DOM — so a
 * click causes no re-render, the effect never re-ran, and the timeout was never
 * armed. Verified: tapping the nav item for the view you are ALREADY on left
 * `pointer-events: none` on the button permanently. A control the user cannot
 * press is a worse outcome than the missing feedback this hook exists to fix.
 *
 * The timer is therefore armed where the state is created — in the handler.
 */
const MAX_PENDING_MS = 2500;

export function useCtaPending(settledKey: unknown) {
  const pendingRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const node = pendingRef.current;
    if (node) {
      node.removeAttribute(PENDING_ATTR);
      node.removeAttribute('aria-busy');
      pendingRef.current = null;
    }
  }, []);

  /**
   * Clears when the destination has actually arrived. `settledKey` is the
   * caller's route identity (activeView): when it changes, the navigation the
   * user asked for has happened and the button is no longer waiting on anything.
   */
  useEffect(() => {
    clear();
  }, [settledKey, clear]);

  /** Release anything still pending when the shell unmounts. */
  useEffect(() => clear, [clear]);

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const origin = event.target as HTMLElement | null;
    const button = origin?.closest?.('button');
    if (!button) return;

    // Already waiting: swallow it. CSS stops a real tap; this stops a synthetic
    // one, and stops a second dispatch racing the first render.
    if (button.hasAttribute(PENDING_ATTR)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Opt-out for controls whose work is instant and local — a language toggle,
    // a menu, a watchlist heart. A pending state on those would flicker.
    if (button.hasAttribute('data-cta-instant')) return;

    /**
     * ALREADY THERE: mark nothing.
     *
     * This is not a nicety. A user on /discover tapping «تصفح المزادات» in the
     * nav to get back to the top is ordinary behaviour, and it is the single
     * most likely tap on a page ad traffic lands on. Without this, that tap
     * disabled the button for the full MAX_PENDING_MS with nothing happening —
     * which is precisely the condition that produces a second tap, and a user
     * who taps twice against a dead control concludes the site is broken. The
     * fix for the missing-feedback defect would have manufactured the same
     * feeling in a different place.
     *
     * `data-cta-target` carries each nav button's destination view; the caller
     * passes the current one in as `settledKey`. Equal means there is no
     * navigation to acknowledge, so the control stays live and instant.
     */
    const target = button.getAttribute('data-cta-target');
    if (target !== null && target === String(settledKey)) return;

    clear(); // only one control is ever pending
    button.setAttribute(PENDING_ATTR, 'true');
    button.setAttribute('aria-busy', 'true');
    pendingRef.current = button;
    // Armed HERE, not in an effect — see MAX_PENDING_MS. A click that changes
    // the route is released sooner by the settledKey effect above; this only
    // catches the clicks that settle nothing.
    timerRef.current = window.setTimeout(clear, MAX_PENDING_MS);
  }, [clear, settledKey]);

  return { onClickCapture };
}

export default useCtaPending;
