import { describe, it, expect } from 'vitest';
const { userStatusForSubscriptionRequest } = require('./subscriptionRequestStatus');

describe('userStatusForSubscriptionRequest', () => {
  it('keeps an already-active member ACTIVE (upgrade must not revoke bidding)', () => {
    expect(userStatusForSubscriptionRequest('active')).toBe('active');
  });
  it('sets pending for a first-time / non-active user', () => {
    for (const s of ['none', 'expired', 'rejected', 'pending', undefined, null, '']) {
      expect(userStatusForSubscriptionRequest(s)).toBe('pending');
    }
  });
});
