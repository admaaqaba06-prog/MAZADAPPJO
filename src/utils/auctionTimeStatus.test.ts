import { describe, it, expect } from 'vitest';
import { auctionTimeStatus, startsInLabel } from './auctionTimeStatus';

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('auctionTimeStatus', () => {
  it('reads a scheduled lot as upcoming', () => {
    const s = auctionTimeStatus({ status: 'upcoming', scheduledStartAt: NOW + 2 * HOUR }, NOW);
    expect(s.phase).toBe('upcoming');
    expect(s.msUntilStart).toBe(2 * HOUR);
  });

  it('reads a running lot as live', () => {
    const s = auctionTimeStatus({ status: 'live', endTime: NOW + 10 * MIN }, NOW);
    expect(s.phase).toBe('live');
    expect(s.msUntilEnd).toBe(10 * MIN);
  });

  it('reads a live lot past its end time as ended', () => {
    // The closer cron is not instant, so a lot can be status 'live' with an
    // end time in the past. Showing that as "Live now" invites a bid that
    // cannot land.
    expect(auctionTimeStatus({ status: 'live', endTime: NOW - MIN }, NOW).phase).toBe('ended');
  });

  it('reads a first-bid lot with no clock as awaiting', () => {
    const s = auctionTimeStatus(
      { status: 'live', startMode: 'first_bid', endTime: null, totalBids: 0 },
      NOW,
    );
    expect(s.phase).toBe('awaiting');
    expect(s.msUntilEnd).toBeNull();
  });

  it('reads a first-bid lot that HAS been bid on as live', () => {
    const s = auctionTimeStatus(
      { status: 'live', startMode: 'first_bid', endTime: NOW + 5 * MIN, totalBids: 1 },
      NOW,
    );
    expect(s.phase).toBe('live');
  });

  it('reads the settled statuses as ended', () => {
    for (const status of ['ended', 'completed', 'reserve_not_met']) {
      expect(auctionTimeStatus({ status }, NOW).phase, status).toBe('ended');
    }
  });

  it('reads an upcoming lot with no scheduled time as upcoming with no countdown', () => {
    const s = auctionTimeStatus({ status: 'upcoming', scheduledStartAt: null }, NOW);
    expect(s.phase).toBe('upcoming');
    expect(s.msUntilStart).toBeNull();
  });

  it('does not blow up on junk', () => {
    expect(auctionTimeStatus(null, NOW).phase).toBe('ended');
    expect(auctionTimeStatus({}, NOW).phase).toBe('ended');
  });
});

describe('startsInLabel', () => {
  it('counts down in days, hours and minutes', () => {
    expect(startsInLabel(3 * DAY, false)).toBe('Starts in 3d');
    expect(startsInLabel(5 * HOUR, false)).toBe('Starts in 5h');
    expect(startsInLabel(20 * MIN, false)).toBe('Starts in 20m');
  });

  it('says starting now inside the last minute rather than "in 0m"', () => {
    expect(startsInLabel(30_000, false)).toBe('Starting now');
    expect(startsInLabel(0, false)).toBe('Starting now');
    expect(startsInLabel(-5000, false)).toBe('Starting now');
  });

  it('is bilingual', () => {
    expect(startsInLabel(3 * DAY, true)).toMatch(/[؀-ۿ]/);
    expect(startsInLabel(30_000, true)).toMatch(/[؀-ۿ]/);
  });

  it('says "soon" when there is no scheduled time to count to', () => {
    expect(startsInLabel(null, false)).toBe('Starts soon');
    expect(startsInLabel(null, true)).toMatch(/[؀-ۿ]/);
  });
});
