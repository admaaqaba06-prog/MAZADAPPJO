import { describe, it, expect } from 'vitest';
import {
  isUserFacingNotification,
  userFacingNotifications,
  unreadUserFacingCount,
} from './notifications';
import type { Notification } from '../types';

const makeNotif = (
  type: Notification['type'],
  read = false,
  id = `${type}-${Math.random()}`
): Notification => ({
  id,
  userId: 'user-current',
  title: 'title',
  description: 'description',
  type,
  timestamp: Date.now(),
  read,
});

describe('isUserFacingNotification (Wave D allowlist)', () => {
  it('allows the bidder-relevant types', () => {
    (['outbid', 'win', 'loss', 'refund', 'order', 'subscription'] as const).forEach(t =>
      expect(isUserFacingNotification(t), t).toBe(true)
    );
  });

  it('excludes internal / ops / escrow-jargon types', () => {
    (['info', 'verify', 'alert', 'bid', 'wallet', 'admin'] as const).forEach(t =>
      expect(isUserFacingNotification(t), t).toBe(false)
    );
  });
});

describe('userFacingNotifications', () => {
  it('filters a mixed list down to the allowlisted subset, preserving order', () => {
    const list = [
      makeNotif('outbid', false, 'a'),
      makeNotif('admin', false, 'b'),
      makeNotif('win', false, 'c'),
      makeNotif('wallet', false, 'd'),
      makeNotif('order', false, 'e'),
    ];
    expect(userFacingNotifications(list).map(n => n.id)).toEqual(['a', 'c', 'e']);
  });

  it('is safe on null/undefined', () => {
    expect(userFacingNotifications(null)).toEqual([]);
    expect(userFacingNotifications(undefined)).toEqual([]);
  });
});

describe('unreadUserFacingCount', () => {
  it('counts only unread allowlisted notifications', () => {
    const list = [
      makeNotif('outbid', false), // counts
      makeNotif('outbid', true), // read
      makeNotif('admin', false), // excluded type
      makeNotif('subscription', false), // counts
      makeNotif('info', false), // excluded type
    ];
    expect(unreadUserFacingCount(list)).toBe(2);
  });

  it('is 0 on empty/null input', () => {
    expect(unreadUserFacingCount([])).toBe(0);
    expect(unreadUserFacingCount(null)).toBe(0);
  });
});
