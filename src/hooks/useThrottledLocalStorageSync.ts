import { useEffect, useRef } from 'react';

/**
 * Persists `value` to `localStorage[key]` at most once every `intervalMs`,
 * instead of synchronously JSON.stringify-ing on every state change.
 *
 * Used for collections that are seeded from localStorage on boot (offline
 * cache for instant paint) but are also updated frequently from Firestore
 * snapshots — e.g. chat messages, wallet, escrows. Stringifying an 80-item
 * array on every delta is a synchronous main-thread cost; throttling keeps
 * the localStorage copy fresh within a few seconds without paying that cost
 * per-delta.
 *
 * Flushes on unmount and on tab hide (visibilitychange) so a pending write
 * isn't lost if the user backgrounds/closes the app between ticks.
 */
export function useThrottledLocalStorageSync<T>(key: string, value: T, intervalMs = 3000): void {
  const lastWriteRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(key, JSON.stringify(valueRef.current));
      } catch {
        // storage unavailable/quota exceeded — nothing else to do here.
      }
      lastWriteRef.current = Date.now();
    };

    const scheduleOrWrite = () => {
      const elapsed = Date.now() - lastWriteRef.current;
      if (elapsed >= intervalMs) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        write();
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          write();
        }, intervalMs - elapsed);
      }
    };

    scheduleOrWrite();

    return () => {
      // Effect re-runs (or unmounts) — nothing to clean up here; the timer
      // itself is cleared/flushed by the mount-scoped effect below.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, intervalMs]);

  // Flush immediately on tab hide/close and on true unmount, so backgrounding
  // the app doesn't drop a pending throttled write.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        try {
          localStorage.setItem(key, JSON.stringify(valueRef.current));
        } catch {
          // storage unavailable/quota exceeded — nothing else to do here.
        }
        lastWriteRef.current = Date.now();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
