import { describe, it, expect } from 'vitest';
import {
  validateReason,
  recentBroadcasts,
  isFeaturedCapped,
  nextAllowedAt,
  capMessage,
  renderFeaturedAlert,
  FEATURED_MAX_PER_WINDOW,
  FEATURED_WINDOW_MS,
  REASON_MAX,
} from './featuredAlert.js';
import { renderDigest } from './dailyDigest.js';

const AT = (iso) => Date.parse(iso);
const NOW = AT('2026-09-12T19:00:00+03:00');
const DAY = 24 * 60 * 60 * 1000;

describe('the reason', () => {
  it('is required', () => {
    // "Featured" on its own says nothing, and an alert that says nothing is
    // the one people mute.
    expect(validateReason('').ok).toBe(false);
    expect(validateReason('   ').ok).toBe(false);
    expect(validateReason(undefined).ok).toBe(false);
    expect(validateReason('').code).toBe('reason_required');
  });

  it('is rejected when it is a paragraph', () => {
    // It renders directly under the product name in a WhatsApp message.
    expect(validateReason('x'.repeat(REASON_MAX + 1)).ok).toBe(false);
    expect(validateReason('x'.repeat(REASON_MAX + 1)).code).toBe('reason_too_long');
  });

  it('accepts and tidies a real one', () => {
    const r = validateReason('  سعره بادي   من ٥ دنانير  ');
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('سعره بادي من ٥ دنانير');
  });
});

describe('the 2-per-7-days cap', () => {
  it('allows the first two', () => {
    expect(isFeaturedCapped([], NOW)).toBe(false);
    expect(isFeaturedCapped([NOW - DAY], NOW)).toBe(false);
  });

  it('refuses the THIRD in the same week', () => {
    // The acceptance criterion, stated directly.
    expect(isFeaturedCapped([NOW - DAY, NOW - 2 * DAY], NOW)).toBe(true);
  });

  it('lets a broadcast out of the window stop counting', () => {
    expect(isFeaturedCapped([NOW - DAY, NOW - 8 * DAY], NOW)).toBe(false);
  });

  it('ignores timestamps it cannot trust', () => {
    // Junk, and anything dated in the future — neither is evidence a send
    // happened, and counting them would block a legitimate alert.
    expect(isFeaturedCapped(['nonsense', null, NOW + DAY], NOW)).toBe(false);
    expect(recentBroadcasts([NOW + DAY], NOW)).toEqual([]);
  });

  it('reads a Firestore Timestamp as happily as a number', () => {
    const ts = { toMillis: () => NOW - DAY };
    expect(recentBroadcasts([ts], NOW)).toEqual([NOW - DAY]);
  });

  it('says when the next one is allowed — the OLDEST blocker leaving the window', () => {
    // A refusal with no next-allowed time reads as a bug and invites someone
    // to go looking for a way around it.
    const older = NOW - 5 * DAY;
    const newer = NOW - DAY;
    expect(nextAllowedAt([newer, older], NOW)).toBe(older + FEATURED_WINDOW_MS);
  });

  it('has no next-allowed time when nothing is blocking', () => {
    expect(nextAllowedAt([NOW - DAY], NOW)).toBeNull();
  });

  it('names the date in the blocking message', () => {
    const msg = capMessage(AT('2026-09-15T19:00:00+03:00'), 'ar');
    expect(msg).toContain('15/9');
    expect(msg).toContain(String(FEATURED_MAX_PER_WINDOW));
    expect(capMessage(AT('2026-09-15T19:00:00+03:00'), 'en')).toMatch(/cannot be overridden/);
  });
});

describe('the message', () => {
  const auction = {
    id: 'a1',
    title: 'تويوتا كامري 2019',
    startingPriceFils: 5000,
    endsAt: AT('2026-09-12T22:00:00+03:00'),
  };
  const reason = 'سعره بادي من ٥ دنانير';

  it('leads with the reason, right under the name', () => {
    const msg = renderFeaturedAlert({ auction, reason, lang: 'ar' });
    const lines = msg.split('\n');
    expect(lines[lines.indexOf('تويوتا كامري 2019') + 1]).toBe(reason);
  });

  it('carries price, closing time and a link', () => {
    const msg = renderFeaturedAlert({ auction, reason, lang: 'ar' });
    expect(msg).toContain('5 د.أ');
    expect(msg).toContain('22:00');
    expect(msg).toContain('https://www.mazzado.com/auction/a1');
  });

  it('always ends with the opt-out line', () => {
    expect(renderFeaturedAlert({ auction, reason, lang: 'ar' })).toContain('للإيقاف، ارسل "إيقاف"');
    expect(renderFeaturedAlert({ auction, reason, lang: 'en' })).toContain('To stop these, reply "STOP"');
  });

  it('is TEXTUALLY DISTINCT from the daily digest', () => {
    // Someone scanning a WhatsApp list has to be able to tell the two apart
    // without opening either. If these ever converge, the alert stops being an
    // interruption and becomes more of the routine people already ignore.
    const alert = renderFeaturedAlert({ auction, reason, lang: 'ar' });
    const digest = renderDigest({ picks: [auction], lang: 'ar' });
    expect(alert.split('\n')[0]).not.toBe(digest.split('\n')[0]);
    expect(alert).toContain('🔥 مزاد مميز');
    expect(digest).toContain('مزادات جديدة بتهمك');
    expect(alert).not.toContain('مزادات جديدة بتهمك');
  });

  it('refuses to render without a reason', () => {
    // The required-reason rule enforced at the renderer too, so a caller that
    // skipped validation still cannot produce a bare "featured!" message.
    expect(renderFeaturedAlert({ auction, reason: '', lang: 'ar' })).toBeNull();
    expect(renderFeaturedAlert({ auction, reason: '   ', lang: 'ar' })).toBeNull();
    expect(renderFeaturedAlert({ auction: null, reason, lang: 'ar' })).toBeNull();
  });

  it('never renders a nameless lot', () => {
    expect(renderFeaturedAlert({ auction: { id: 'x' }, reason, lang: 'ar' })).toContain('قطعة مميزة');
  });
});
