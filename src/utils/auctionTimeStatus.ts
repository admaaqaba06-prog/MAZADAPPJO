/**
 * One answer to "where is this lot in time", for every surface.
 *
 * The pieces existed — `isLiveNow`, `isAwaitingFirstBid`, the settled-status
 * lists — but each surface assembled them itself, so the answers disagreed. A
 * scheduled lot showed an absolute "Tue 20:00" on the Discover preview and
 * "Starts in" on the desktop live layout, and nothing showed a countdown to a
 * start at all.
 *
 * The `live`-but-expired case is why this is a resolver rather than a lookup:
 * the closing cron is not instant, so a lot can be `status: 'live'` with an end
 * time already in the past. Reporting that as "Live now" invites a bid the
 * server will reject.
 */
import { isAwaitingFirstBid } from './auctionPhase';

export type AuctionPhase = 'upcoming' | 'awaiting' | 'live' | 'ended';

export interface AuctionTimeStatus {
  phase: AuctionPhase;
  /** ms until it opens; null when unscheduled or not upcoming. */
  msUntilStart: number | null;
  /** ms until it closes; null when there is no clock (awaiting/upcoming/ended). */
  msUntilEnd: number | null;
}

interface TimedAuction {
  status?: string | null;
  scheduledStartAt?: number | null;
  endTime?: number | null;
  startMode?: string | null;
  totalBids?: number | null;
}

const SETTLED = ['ended', 'completed', 'reserve_not_met', 'cancelled'];

export function auctionTimeStatus(
  auction: TimedAuction | null | undefined,
  now: number = Date.now(),
): AuctionTimeStatus {
  const none: AuctionTimeStatus = { phase: 'ended', msUntilStart: null, msUntilEnd: null };
  if (!auction || !auction.status) return none;

  const status = String(auction.status);

  if (SETTLED.includes(status)) return none;

  if (status === 'upcoming') {
    const at = auction.scheduledStartAt;
    return {
      phase: 'upcoming',
      msUntilStart: typeof at === 'number' ? at - now : null,
      msUntilEnd: null,
    };
  }

  if (status === 'live' || status === 'active') {
    // A first-bid lot is open but has no clock until someone bids.
    if (isAwaitingFirstBid(auction as any)) {
      return { phase: 'awaiting', msUntilStart: null, msUntilEnd: null };
    }
    const end = auction.endTime;
    // Past its end but not yet closed by the cron — ended, not live.
    if (typeof end === 'number' && end <= now) return none;
    return {
      phase: 'live',
      msUntilStart: null,
      msUntilEnd: typeof end === 'number' ? end - now : null,
    };
  }

  // Anything else (processing, rejected, draft) is not biddable and shows no clock.
  return none;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * "Starts in 3d" / "Starts in 5h" / "Starts in 20m" / "Starting now".
 *
 * Coarse on purpose: a lot opening in three days does not need a second hand,
 * and a per-second tick on a card is a re-render per card per second. The last
 * minute collapses to "Starting now" rather than counting to "in 0m", which
 * reads as broken.
 */
export function startsInLabel(msUntilStart: number | null | undefined, isAr: boolean): string {
  if (msUntilStart == null) return isAr ? 'يبدأ قريباً' : 'Starts soon';
  if (msUntilStart < MIN) return isAr ? 'يبدأ الآن' : 'Starting now';

  if (msUntilStart >= DAY) {
    const d = Math.floor(msUntilStart / DAY);
    return isAr ? `يبدأ خلال ${d} يوم` : `Starts in ${d}d`;
  }
  if (msUntilStart >= HOUR) {
    const h = Math.floor(msUntilStart / HOUR);
    return isAr ? `يبدأ خلال ${h} ساعة` : `Starts in ${h}h`;
  }
  const m = Math.floor(msUntilStart / MIN);
  return isAr ? `يبدأ خلال ${m} دقيقة` : `Starts in ${m}m`;
}
