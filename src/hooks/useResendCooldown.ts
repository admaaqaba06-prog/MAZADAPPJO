// Shared OTP resend cooldown.
//
// Extracted from LoginView, which has carried this inline since the WhatsApp-OTP
// work. ContactCompletionModal had no resend at all, and a third copy is how a
// countdown quietly drifts out of sync with the server's own rate limit.
//
// A HOOK rather than a shared component, deliberately: LoginView is the auth
// surface, and a shared component would force sign-in to change whenever the
// contact modal does. The hook can be adopted there separately, under its own
// test pass.

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seconds blocked after a successful send. Jordanian carrier SMS can lag 10-60s
 * (see docs/superpowers/specs/2026-07-23-local-sms-otp-provider-design.md), so a
 * retry needs room before it just doubles the traffic.
 */
export const RESEND_COOLDOWN_S = 60;

/**
 * One tick of the countdown. Pure so the off-by-one is testable without React:
 * it must land exactly on 0 and stay there. A negative would render
 * "resend in -3s" and leave the button disabled forever.
 */
export function nextCooldown(seconds: number): number {
  if (seconds <= 1) return 0;
  return seconds - 1;
}

export interface ResendCooldown {
  /** Seconds remaining; 0 means a resend is allowed. */
  cooldown: number;
  /** Start (or restart) the window. Pass a server-imposed wait to honour it. */
  start: (seconds?: number) => void;
  /** Stop and zero the countdown — used once the code actually verifies. */
  clear: () => void;
}

export function useResendCooldown(): ResendCooldown {
  const [cooldown, setCooldown] = useState(0);
  // The interval id lives in a ref so re-renders never spawn a second timer, and
  // the tick uses a functional setState — the ticking value is not a dependency
  // of anything, so there is no stale-closure countdown bug.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((seconds: number = RESEND_COOLDOWN_S) => {
    clearTimer(); // never run two intervals at once
    setCooldown(seconds);
    intervalRef.current = setInterval(() => {
      setCooldown((s) => {
        const next = nextCooldown(s);
        if (next === 0) clearTimer();
        return next;
      });
    }, 1000);
  }, [clearTimer]);

  const clear = useCallback(() => {
    clearTimer();
    setCooldown(0);
  }, [clearTimer]);

  // Leak safety: tear the interval down on unmount.
  useEffect(() => clearTimer, [clearTimer]);

  return { cooldown, start, clear };
}
