import { getCallableFunction } from '../services/firebase';
import { readSimulatorEnabled, subscribeSimulatorEnabled } from '../hooks/useSimulatorEnabled';

/**
 * Module-scope bid-bot manager for the admin auction simulator.
 *
 * Lives OUTSIDE React so bots keep bidding while the SimulatorPanel is
 * unmounted (switching admin tabs, watching the live room). The panel is a
 * thin consumer: start/stop call into here, and useSyncExternalStore over
 * subscribeBots/getBotsSnapshot re-renders it on state changes.
 *
 * Guarantees (ported from the old in-component manager):
 * - ONE interval per auction, ever (double-start is a no-op).
 * - pending guard: ticks skip while a simulateBid call is in flight.
 * - entry-identity check: a tick scheduled before a stop is a no-op.
 * - auto-stop on {noop} responses and on call errors.
 * - master-toggle-off stops every bot (module-level subscription, registered
 *   ONCE on first startBot — it can never stack or leak).
 * - safety backstop: a bot hard-stops after MAX_TICKS ticks or MAX_RUNTIME_MS,
 *   so a forgotten bot can't run forever.
 */

export type Pace = 'slow' | 'fast';
export const PACE_MS: Record<Pace, number> = { slow: 12000, fast: 4000 };

/** Safety backstop: whichever trips first stops the bot with a warning. */
export const MAX_TICKS = 200;
export const MAX_RUNTIME_MS = 30 * 60 * 1000; // 30 minutes

interface BidResponse {
  currentPrice?: number;
  endTime?: number;
  noop?: boolean;
  reason?: string;
}

export interface BotDeps {
  /** Row-message sink (the panel's setRowMsgFor). Bound at start time. */
  onMessage?: (auctionId: string, msg: string) => void;
}

interface BotEntry {
  intervalId: ReturnType<typeof setInterval>;
  /** True while a simulateBid call is in flight — ticks skip instead of stacking. */
  pending: boolean;
  pace: Pace;
  ticks: number;
  startedAt: number;
  onMessage?: BotDeps['onMessage'];
}

const bots = new Map<string, BotEntry>();

// ── Subscribe/notify (useSyncExternalStore-compatible) ─────────────────────
export type BotsSnapshot = Readonly<Record<string, Pace>>;

const listeners = new Set<() => void>();
let snapshot: BotsSnapshot = {};

function notify(): void {
  const next: Record<string, Pace> = {};
  bots.forEach((entry, auctionId) => {
    next[auctionId] = entry.pace;
  });
  snapshot = next; // new reference only when state actually changed
  listeners.forEach((listener) => listener());
}

/** Referentially-stable map of running bots (auctionId → pace). */
export function getBotsSnapshot(): BotsSnapshot {
  return snapshot;
}

export function subscribeBots(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Master-toggle-off subscription (registered once, never leaks) ──────────
let toggleSubscribed = false;

function ensureToggleSubscription(): void {
  if (toggleSubscribed || typeof window === 'undefined') return;
  toggleSubscribed = true; // one module-lifetime subscription — cannot stack
  subscribeSimulatorEnabled(() => {
    if (!readSimulatorEnabled()) stopAllBots('Bot stopped (simulator off)');
  });
}

// ── Public API ──────────────────────────────────────────────────────────────
export function isBotRunning(auctionId: string): boolean {
  return bots.has(auctionId);
}

export function stopBot(auctionId: string, reason?: string): void {
  const entry = bots.get(auctionId);
  if (!entry) return;
  clearInterval(entry.intervalId);
  bots.delete(auctionId);
  notify();
  if (reason) entry.onMessage?.(auctionId, reason);
}

export function stopAllBots(reason?: string): void {
  // Map.forEach visits each entry once even when entries are deleted
  // mid-iteration (stopBot deletes as it goes) — spec-safe.
  bots.forEach((_entry, auctionId) => stopBot(auctionId, reason));
}

export function startBot(auctionId: string, pace: Pace, deps: BotDeps = {}): void {
  if (bots.has(auctionId)) return; // one interval per auction, ever
  ensureToggleSubscription();

  const entry: BotEntry = {
    intervalId: 0 as unknown as ReturnType<typeof setInterval>,
    pending: false,
    pace,
    ticks: 0,
    startedAt: Date.now(),
    onMessage: deps.onMessage,
  };
  const say = (msg: string) => entry.onMessage?.(auctionId, msg);

  const tick = async () => {
    // If the bot was stopped between scheduling and firing, do nothing.
    if (bots.get(auctionId) !== entry) return;
    // Safety backstop: a forgotten bot can't run forever.
    entry.ticks += 1;
    if (entry.ticks > MAX_TICKS || Date.now() - entry.startedAt > MAX_RUNTIME_MS) {
      console.warn(`[simBotManager] bot for ${auctionId} hit the safety cap — stopping.`);
      stopBot(auctionId, 'Bot stopped (safety cap reached)');
      return;
    }
    if (entry.pending) return; // previous call still in flight — never stack
    entry.pending = true;
    try {
      const call = await getCallableFunction<{ auctionId: string }, BidResponse>('simulateBid');
      const res = (await call({ auctionId })).data;
      if (bots.get(auctionId) !== entry) return; // stopped mid-flight — stay stopped
      if (res?.noop) {
        stopBot(auctionId, `Bot stopped (${res.reason || 'noop'})`);
      } else if (typeof res?.currentPrice === 'number') {
        say(`Bot bid → ${res.currentPrice} JOD`);
      }
    } catch (err: any) {
      stopBot(auctionId, `Bot stopped (error: ${err?.message || err})`);
    } finally {
      entry.pending = false;
    }
  };

  entry.intervalId = setInterval(() => {
    void tick();
  }, PACE_MS[pace]);
  bots.set(auctionId, entry);
  notify();
  say(`Bot running (${pace})`);
  void tick(); // first bid immediately
}
