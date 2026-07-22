import { useSyncExternalStore } from 'react';

/**
 * Master switch for the admin auction simulator.
 *
 * Persisted in localStorage so it survives reloads, and broadcast via a
 * custom window event so ANY component (Wave 3 visibility filters, banners)
 * can subscribe without importing the SimulatorPanel itself.
 */
export const SIMULATOR_ENABLED_KEY = 'mazad_simulator_enabled';
export const SIMULATOR_TOGGLE_EVENT = 'mazad-simulator-toggle';

/** Read the persisted toggle. Safe in non-browser contexts (returns false). */
export function readSimulatorEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SIMULATOR_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the toggle and notify all subscribers in this tab. */
export function writeSimulatorEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SIMULATOR_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage unavailable (private mode quota etc.) — still broadcast so
    // in-tab UI stays consistent for this session.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIMULATOR_TOGGLE_EVENT, { detail: { enabled } }));
  }
}

/**
 * Subscribe to toggle changes: same-tab via the custom event, cross-tab via
 * the native `storage` event. Returns an unsubscribe function.
 */
export function subscribeSimulatorEnabled(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SIMULATOR_TOGGLE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SIMULATOR_TOGGLE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * React hook: `[enabled, setEnabled]` bound to the persisted master toggle.
 * `setEnabled` is a stable module-level function (safe in dep arrays).
 */
export function useSimulatorEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(
    subscribeSimulatorEnabled,
    readSimulatorEnabled,
    () => false // SSR snapshot
  );
  return [enabled, writeSimulatorEnabled];
}
