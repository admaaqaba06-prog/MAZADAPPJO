import { describe, it, expect } from 'vitest';
import { areReelPropsEqual } from './MobileLiveAuctionLayout';

// Regression test for the Wave 3c review P0: sellerProfile/hasUserBid/
// winnerOrderId were hoisted out of the reel's own useApp() reads into derived
// props, but the memo comparator was never updated to compare them — a change
// to any of the three was silently dropped, most visibly on the winner's
// "View Order" tap (winnerOrderId arrives after the reel goes quiescent).

function baseProps(overrides: Record<string, any> = {}) {
  return {
    auction: { id: 'a1', currentPrice: 100, endTime: 0, status: 'completed', totalBids: 3 },
    isActive: false,
    shouldLoad: true,
    isMuted: false,
    isPlaying: false,
    onPlayPauseToggle: () => {},
    activePrice: 100,
    isSaved: false,
    activeComments: [],
    activeActivities: [],
    commentText: '',
    setCommentText: () => {},
    onCommentSubmit: () => {},
    nextBidAmount: 105,
    onBidExecute: () => {},
    currentUser: { id: 'u1' },
    language: 'en',
    isAr: false,
    onOpenDetails: () => {},
    onMuteToggle: () => {},
    onShareClick: () => {},
    onSaveToggle: () => {},
    onLikeToggle: () => {},
    onClose: () => {},
    sellerProfile: null,
    hasUserBid: true,
    winnerOrderId: null,
    setActiveView: () => {},
    setGlobalSelectedOrderId: () => {},
    ...overrides,
  } as any;
}

describe('areReelPropsEqual (Wave 3c hoisted-prop regression)', () => {
  it('forces a re-render when winnerOrderId newly arrives (the winner order-arrival case)', () => {
    const prev = baseProps({ winnerOrderId: null });
    const next = baseProps({ winnerOrderId: 'order-123' });
    expect(areReelPropsEqual(prev, next)).toBe(false);
  });

  it('forces a re-render when hasUserBid changes', () => {
    const prev = baseProps({ hasUserBid: false });
    const next = baseProps({ hasUserBid: true });
    expect(areReelPropsEqual(prev, next)).toBe(false);
  });

  it('forces a re-render when sellerProfile verificationStatus changes', () => {
    const prev = baseProps({ sellerProfile: { userId: 's1', verificationStatus: 'not_verified', storeLogo: 'x' } });
    const next = baseProps({ sellerProfile: { userId: 's1', verificationStatus: 'verified', storeLogo: 'x' } });
    expect(areReelPropsEqual(prev, next)).toBe(false);
  });

  it('skips re-render when nothing tracked changed (identical values, new object refs)', () => {
    const prev = baseProps({ sellerProfile: { userId: 's1', verificationStatus: 'verified', storeLogo: 'x' } });
    const next = baseProps({ sellerProfile: { userId: 's1', verificationStatus: 'verified', storeLogo: 'x' } });
    expect(areReelPropsEqual(prev, next)).toBe(true);
  });
});
