import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, getCallableFunction } from '../services/firebase';
import { useApp } from '../context/AppContext';
import { isAdminUser } from '../utils/adminAuth';
import { useSimulatorEnabled } from '../hooks/useSimulatorEnabled';
import {
  startBot,
  stopBot,
  stopAllBots,
  subscribeBots,
  getBotsSnapshot,
  type Pace,
} from '../utils/simBotManager';
import {
  FlaskConical,
  Play,
  Square,
  Trash2,
  Gavel,
  TimerOff,
  Bot,
  Plus,
  Zap,
  Turtle,
} from 'lucide-react';

/**
 * Admin-only auction simulator console (Wave 2).
 *
 * Self-contained: talks to the Wave 1 admin callables (simulateSpawnAuction /
 * simulateBid / simulateSettleNow / simulateCleanup) and its own live
 * `isSimulated == true` auctions query. English-only — internal tool.
 *
 * Bid bots live in the module-scope simBotManager (src/utils/simBotManager.ts),
 * NOT in this component — they deliberately SURVIVE unmount so an admin can
 * switch tabs or watch the live room while the bot keeps bidding. Bots still
 * stop on Stop, on {noop} responses, when the auction leaves live status, on
 * master-toggle-off (manager-level subscription), before cleanup, and via the
 * manager's safety cap (200 ticks / 30 min).
 */

interface SpawnParams {
  title?: string;
  startingPrice?: number;
  durationSec?: number;
  category?: string;
  channel?: string;
  status?: 'live' | 'upcoming';
}

interface SettleResponse {
  settled: boolean;
  orderId?: string;
  reason?: string;
}

interface CleanupResponse {
  deleted: { auctions: number; bids: number; orders: number };
}

const PRESETS: { id: string; label: string; params: SpawnParams }[] = [
  {
    id: 'phone',
    label: 'Phone · 2 min',
    params: { title: 'TEST — Phone', category: 'Phones', channel: 'phones', startingPrice: 25, durationSec: 120 },
  },
  {
    id: 'car',
    label: 'Car · 5 min',
    params: { title: 'TEST — Car', category: 'Cars', channel: 'cars', startingPrice: 500, durationSec: 300 },
  },
  {
    id: 'watch',
    label: 'Watch · 30s snipe',
    params: { title: 'TEST — Watch (snipe)', category: 'Watches', channel: 'misc', startingPrice: 50, durationSec: 30 },
  },
  {
    id: 'upcoming',
    label: 'Upcoming · starts in 1 min',
    params: { title: 'TEST — Upcoming drop', category: 'Electronics', channel: 'misc', startingPrice: 25, durationSec: 120, status: 'upcoming' },
  },
];

const CATEGORY_OPTIONS = ['Phones', 'Cars', 'Watches', 'Electronics', 'Misc'] as const;
const CATEGORY_CHANNEL: Record<string, string> = {
  Phones: 'phones',
  Cars: 'cars',
  Watches: 'misc',
  Electronics: 'misc',
  Misc: 'misc',
};

/** Normalize Firestore Timestamp / {seconds} / ISO / epoch-ms to epoch ms. */
const tsToMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const auctionEndMs = (a: any): number => tsToMillis(a?.endTime) || tsToMillis(a?.endsAt);

const fmtCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const isLiveStatus = (status: any): boolean => status === 'live' || status === 'active';

export const SimulatorPanel: React.FC = () => {
  const { currentUser } = useApp();
  const isAdmin = isAdminUser(currentUser);

  const [enabled, setEnabled] = useSimulatorEnabled();

  const [simAuctions, setSimAuctions] = useState<any[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  // In-flight flags: 'spawn:<preset|custom>' | 'settle:<id>' | 'end:<id>' | 'cleanup'
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [panelMsg, setPanelMsg] = useState<string>('');
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  // Bid bots — owned by the module-scope simBotManager so they survive
  // unmount; this is a live read-only mirror (auctionId → pace) for rendering.
  const runningBots = useSyncExternalStore(subscribeBots, getBotsSnapshot);
  const [pace, setPace] = useState<Pace>('slow');

  // Two-click inline confirms (no window.confirm — it blocks automation).
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const setBusyKey = (key: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [key]: value }));
  const setRowMsgFor = (auctionId: string, msg: string) =>
    setRowMsg((prev) => ({ ...prev, [auctionId]: msg }));

  // ── Live simulated-auctions subscription ─────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'auctions'), where('isSimulated', '==', true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a: any, b: any) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
        setSimAuctions(rows);
      },
      (err) => {
        console.warn('[SimulatorPanel] simulated-auctions subscription failed:', err);
        setPanelMsg(`Live list failed: ${err?.message || err}`);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  // Local 1s ticker for time-left displays.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // ── Bid bots (module-scope manager — survive tab switches) ────────────────
  // Auto-stop bots whose auction left live status (settled, ended, deleted).
  // Row messages are set here (not just inside the manager) so the CURRENT
  // mount always sees why a bot stopped, even for bots started by an earlier
  // mount of this panel.
  useEffect(() => {
    Object.keys(runningBots).forEach((auctionId) => {
      const auction = simAuctions.find((a: any) => a.id === auctionId);
      if (!auction) {
        stopBot(auctionId);
        setRowMsgFor(auctionId, 'Bot stopped (auction removed)');
      } else if (!isLiveStatus(auction.status)) {
        stopBot(auctionId);
        setRowMsgFor(auctionId, `Bot stopped (status ${auction.status})`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simAuctions, runningBots]);

  // Master toggle off → all bots stop. Handled INSIDE simBotManager via its
  // own useSimulatorEnabled subscription, so it works even with no panel
  // mounted. No unmount teardown here — bots surviving unmount is the point.

  // ── Actions ───────────────────────────────────────────────────────────────
  const spawn = async (key: string, params: SpawnParams) => {
    setBusyKey(`spawn:${key}`, true);
    setPanelMsg('');
    try {
      const call = await getCallableFunction<SpawnParams, { auctionId: string }>('simulateSpawnAuction');
      const res = (await call(params)).data;
      setPanelMsg(`Spawned "${params.title || 'test auction'}" (${res.auctionId})`);
    } catch (err: any) {
      setPanelMsg(`Spawn failed: ${err?.message || err}`);
    } finally {
      setBusyKey(`spawn:${key}`, false);
    }
  };

  const endNow = async (auctionId: string) => {
    setConfirmEndId(null);
    setBusyKey(`end:${auctionId}`, true);
    try {
      // Admin direct update (passes rules): auction ends immediately; the
      // closer cron (or Settle now) then settles it.
      await updateDoc(doc(db, 'auctions', auctionId), {
        endTime: Date.now(),
        endsAt: Timestamp.now(),
      });
      setRowMsgFor(auctionId, 'Ended — settle via cron or "Settle now"');
    } catch (err: any) {
      setRowMsgFor(auctionId, `End failed: ${err?.message || err}`);
    } finally {
      setBusyKey(`end:${auctionId}`, false);
    }
  };

  const settleNow = async (auctionId: string) => {
    stopBot(auctionId); // don't keep bidding on an auction we're settling
    setBusyKey(`settle:${auctionId}`, true);
    try {
      const call = await getCallableFunction<{ auctionId: string }, SettleResponse>('simulateSettleNow');
      const res = (await call({ auctionId })).data;
      if (res.settled) {
        setRowMsgFor(auctionId, res.orderId ? `Settled → order ${res.orderId}` : 'Settled (no winner — no order)');
      } else {
        setRowMsgFor(auctionId, `Not settled (${res.reason || 'unknown'})`);
      }
    } catch (err: any) {
      setRowMsgFor(auctionId, `Settle failed: ${err?.message || err}`);
    } finally {
      setBusyKey(`settle:${auctionId}`, false);
    }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    stopAllBots('Bot stopped (cleanup)');
    setBusyKey('cleanup', true);
    setPanelMsg('');
    try {
      const call = await getCallableFunction<Record<string, never>, CleanupResponse>('simulateCleanup');
      const res = (await call({})).data;
      const d = res.deleted;
      setPanelMsg(`Cleared — ${d.auctions} auctions, ${d.bids} bids, ${d.orders} orders deleted`);
      setRowMsg({});
    } catch (err: any) {
      setPanelMsg(`Cleanup failed: ${err?.message || err}`);
    } finally {
      setBusyKey('cleanup', false);
    }
  };

  // ── Custom spawn form ─────────────────────────────────────────────────────
  const [customTitle, setCustomTitle] = useState('');
  const [customPrice, setCustomPrice] = useState('25');
  const [customDuration, setCustomDuration] = useState('120');
  const [customCategory, setCustomCategory] = useState<string>('Electronics');

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const startingPrice = Number(customPrice);
    const durationSec = Number(customDuration);
    void spawn('custom', {
      title: customTitle.trim() || undefined,
      startingPrice: Number.isFinite(startingPrice) && startingPrice > 0 ? startingPrice : undefined,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : undefined,
      category: customCategory,
      channel: CATEGORY_CHANNEL[customCategory] || 'misc',
    });
  };

  // Defense in depth: the dashboard is admin-gated AND the tab render checks
  // isAdminUser, but never render simulator controls for a non-admin.
  if (!isAdmin) return null;

  const anySpawnBusy = PRESETS.some((p) => busy[`spawn:${p.id}`]) || !!busy['spawn:custom'];
  const spawnDisabled = !enabled || anySpawnBusy;

  const statusBadge = (a: any) => {
    const ended = isLiveStatus(a.status) && auctionEndMs(a) > 0 && auctionEndMs(a) <= now;
    if (a.status === 'upcoming') return { label: 'UPCOMING', cls: 'bg-sky-50 text-sky-600 border-sky-100' };
    if (ended) return { label: 'ENDED (unsettled)', cls: 'bg-amber-50 text-amber-600 border-amber-100' };
    if (isLiveStatus(a.status)) return { label: 'LIVE', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
    return { label: String(a.status || 'unknown').toUpperCase(), cls: 'bg-gray-50 text-gray-500 border-gray-150' };
  };

  const timeLeftLabel = (a: any): string => {
    if (a.status === 'upcoming') {
      const startMs = tsToMillis(a.scheduledStartAt);
      return startMs > 0 ? `starts in ${fmtCountdown(startMs - now)}` : 'awaiting opener';
    }
    const endMs = auctionEndMs(a);
    if (!endMs) return '—';
    const left = endMs - now;
    return left > 0 ? fmtCountdown(left) : 'ended';
  };

  const btnBase = 'px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="space-y-4" id="simulator-panel">
      {/* ── Master toggle + banner ─────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 leading-none">Auction Simulator</h3>
              <p className="text-[10px] text-gray-400 mt-1">
                Spawn flagged test auctions, run bid bots, force-settle, and wipe. All data carries isSimulated.
              </p>
            </div>
          </div>
          <button
            id="simulator-master-toggle"
            onClick={() => setEnabled(!enabled)}
            role="switch"
            aria-checked={enabled}
            className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${enabled ? 'bg-violet-600' : 'bg-gray-200'}`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>

        {enabled ? (
          <div className="bg-violet-50 border border-violet-200 text-violet-800 rounded-2xl px-4 py-2.5 text-xs font-bold flex items-center gap-2">
            <span aria-hidden="true">🧪</span>
            Simulator ON — test data visible to admins only
            <span className="ms-auto w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-150 text-gray-500 rounded-2xl px-4 py-2.5 text-xs font-bold">
            Simulator OFF — spawning and bots disabled. Existing test data can still be cleared below.
          </div>
        )}

        {panelMsg && (
          <p className="text-[11px] font-mono text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 break-all">
            {panelMsg}
          </p>
        )}
      </div>

      {/* ── Spawn ──────────────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 space-y-4">
        <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Spawn test auction
        </h4>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              id={`sim-spawn-${preset.id}`}
              onClick={() => void spawn(preset.id, preset.params)}
              disabled={spawnDisabled}
              className={`${btnBase} bg-gray-900 text-white hover:bg-gray-700 shadow-sm px-4 py-2`}
            >
              {busy[`spawn:${preset.id}`] ? 'Spawning…' : preset.label}
            </button>
          ))}
        </div>

        <form onSubmit={submitCustom} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <label className="col-span-2 md:col-span-2 text-[10px] font-bold text-gray-500 space-y-1">
            <span>TITLE</span>
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="TEST — Custom"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none focus:border-violet-400"
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500 space-y-1">
            <span>PRICE (JOD)</span>
            <input
              type="number"
              min="1"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:border-violet-400"
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500 space-y-1">
            <span>DURATION (SEC)</span>
            <input
              type="number"
              min="10"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:border-violet-400"
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500 space-y-1">
            <span>CATEGORY</span>
            <select
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 bg-white focus:outline-none focus:border-violet-400"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={spawnDisabled}
            className={`${btnBase} col-span-2 md:col-span-5 justify-center bg-violet-600 text-white hover:bg-violet-500 shadow-sm px-4 py-2`}
          >
            {busy['spawn:custom'] ? 'Spawning…' : 'Spawn custom auction'}
          </button>
        </form>
        {!enabled && (
          <p className="text-[10px] text-gray-400 font-semibold">Turn the simulator ON to spawn.</p>
        )}
      </div>

      {/* ── Active simulated auctions ──────────────────────────────────── */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
            <Gavel className="w-3.5 h-3.5" /> Simulated auctions ({simAuctions.length})
          </h4>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400">BOT PACE</span>
            <button
              onClick={() => setPace('slow')}
              className={`${btnBase} ${pace === 'slow' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
            >
              <Turtle className="w-3.5 h-3.5" /> Slow · 12s
            </button>
            <button
              onClick={() => setPace('fast')}
              className={`${btnBase} ${pace === 'fast' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
            >
              <Zap className="w-3.5 h-3.5" /> Fast · 4s
            </button>
            <span className="text-[9px] text-gray-300 font-semibold hidden md:inline">applies on start</span>
          </div>
        </div>

        {simAuctions.length === 0 ? (
          <p className="text-xs text-gray-400 font-semibold py-4 text-center">
            No simulated auctions. Spawn one above.
          </p>
        ) : (
          <div className="space-y-2">
            {simAuctions.map((a: any) => {
              const badge = statusBadge(a);
              const live = isLiveStatus(a.status) && (auctionEndMs(a) === 0 || auctionEndMs(a) > now);
              const botPace = runningBots[a.id];
              return (
                <div key={a.id} className="border border-gray-100 rounded-2xl p-3.5 space-y-2 bg-gray-50/40">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-black text-gray-900 truncate">{a.title || a.id}</span>
                      {botPace && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 flex items-center gap-1 shrink-0">
                          <Bot className="w-3 h-3 animate-pulse" /> BOT · {botPace.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-gray-600 shrink-0">
                      <span className="font-black text-gray-900">{a.currentPrice ?? a.startingPrice ?? 0} JOD</span>
                      <span>{a.totalBids ?? 0} bids</span>
                      <span className="text-gray-400">{timeLeftLabel(a)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {botPace ? (
                      <button
                        onClick={() => {
                          stopBot(a.id);
                          setRowMsgFor(a.id, 'Bot stopped');
                        }}
                        className={`${btnBase} bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100`}
                      >
                        <Square className="w-3 h-3" /> Stop bot
                      </button>
                    ) : (
                      <button
                        onClick={() => startBot(a.id, pace, { onMessage: setRowMsgFor })}
                        disabled={!enabled || !live}
                        className={`${btnBase} bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100`}
                      >
                        <Play className="w-3 h-3" /> Start bot
                      </button>
                    )}

                    {confirmEndId === a.id ? (
                      <button
                        onClick={() => void endNow(a.id)}
                        disabled={!!busy[`end:${a.id}`]}
                        className={`${btnBase} bg-amber-500 text-white hover:bg-amber-400`}
                      >
                        <TimerOff className="w-3 h-3" /> End now? Click to confirm
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmEndId(a.id)}
                        disabled={!live || !!busy[`end:${a.id}`]}
                        className={`${btnBase} bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100`}
                      >
                        <TimerOff className="w-3 h-3" /> {busy[`end:${a.id}`] ? 'Ending…' : 'End now'}
                      </button>
                    )}

                    <button
                      onClick={() => void settleNow(a.id)}
                      disabled={!isLiveStatus(a.status) || !!busy[`settle:${a.id}`]}
                      className={`${btnBase} bg-gray-900 text-white hover:bg-gray-700`}
                    >
                      <Gavel className="w-3 h-3" /> {busy[`settle:${a.id}`] ? 'Settling…' : 'Settle now'}
                    </button>
                  </div>

                  {rowMsg[a.id] && (
                    <p className="text-[10px] font-mono text-gray-500 break-all">{rowMsg[a.id]}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Clear all ──────────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-3xl border border-gray-150 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-gray-500">Danger zone</h4>
          <p className="text-[10px] text-gray-400 mt-1">
            Stops all bots, then deletes every isSimulated auction, bid, and order.
          </p>
        </div>
        {confirmClear ? (
          <button
            onClick={() => void clearAll()}
            disabled={!!busy['cleanup']}
            className={`${btnBase} bg-rose-600 text-white hover:bg-rose-500 px-4 py-2`}
          >
            <Trash2 className="w-3.5 h-3.5" /> Really delete ALL simulated data? Click to confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirmClear(true)}
            disabled={!!busy['cleanup']}
            className={`${btnBase} bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 px-4 py-2`}
          >
            <Trash2 className="w-3.5 h-3.5" /> {busy['cleanup'] ? 'Clearing…' : 'Clear all simulated data'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SimulatorPanel;
