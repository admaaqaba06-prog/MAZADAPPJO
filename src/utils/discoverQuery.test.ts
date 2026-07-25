import { describe, expect, it } from 'vitest';
import {
  PAGE,
  buildLiveFeedConstraints,
  buildUpcomingFeedConstraints,
  hasNewerDrops,
  isDisplayableLive,
} from './discoverQuery';

describe('PAGE', () => {
  it('is 24', () => {
    expect(PAGE).toBe(24);
  });
});

describe('buildLiveFeedConstraints', () => {
  it('has no category clause for "All"', () => {
    expect(buildLiveFeedConstraints({ category: 'All' })).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('has no category clause when category is undefined', () => {
    expect(buildLiveFeedConstraints({})).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('adds a category clause for a specific category', () => {
    expect(buildLiveFeedConstraints({ category: 'Watches' })).toEqual({
      where: [
        ['status', '==', 'live'],
        ['category', '==', 'Watches'],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('sets startAfter when a cursor is passed', () => {
    const cursor = { id: 'doc-42' };
    expect(buildLiveFeedConstraints({ category: 'Watches', cursor })).toEqual({
      where: [
        ['status', '==', 'live'],
        ['category', '==', 'Watches'],
      ],
      orderBy: [['endsAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });

  it('sets startAfter with no category clause when only a cursor is passed', () => {
    const cursor = { id: 'doc-7' };
    expect(buildLiveFeedConstraints({ cursor })).toEqual({
      where: [['status', '==', 'live']],
      orderBy: [['endsAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });
});

describe('buildUpcomingFeedConstraints', () => {
  it('builds upcoming constraints with no cursor', () => {
    expect(buildUpcomingFeedConstraints({})).toEqual({
      where: [['status', '==', 'upcoming']],
      orderBy: [['scheduledStartAt', 'asc']],
      startAfter: null,
      limit: 24,
    });
  });

  it('sets startAfter when a cursor is passed', () => {
    const cursor = { id: 'up-9' };
    expect(buildUpcomingFeedConstraints({ cursor })).toEqual({
      where: [['status', '==', 'upcoming']],
      orderBy: [['scheduledStartAt', 'asc']],
      startAfter: cursor,
      limit: 24,
    });
  });
});

describe('hasNewerDrops', () => {
  it('is false when latest is null', () => {
    expect(hasNewerDrops(100, null)).toBe(false);
    expect(hasNewerDrops(null, null)).toBe(false);
  });

  it('is true when nothing is loaded yet but a latest exists', () => {
    expect(hasNewerDrops(null, 100)).toBe(true);
  });

  it('is true when latest is newer than loaded', () => {
    expect(hasNewerDrops(100, 200)).toBe(true);
  });

  it('is false when latest is equal to or older than loaded', () => {
    expect(hasNewerDrops(200, 200)).toBe(false);
    expect(hasNewerDrops(200, 100)).toBe(false);
  });
});

describe('isDisplayableLive', () => {
  const now = 1_000;

  it('passes a live lot ending in the future', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 2_000 }, now)).toBe(true);
  });

  it('passes a live lot with no endTime', () => {
    expect(isDisplayableLive({ status: 'live' }, now)).toBe(true);
  });

  it('fails a simulated lot', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 2_000, isSimulated: true }, now)).toBe(false);
  });

  it('fails a lot whose endTime has passed', () => {
    expect(isDisplayableLive({ status: 'live', endTime: 500 }, now)).toBe(false);
  });

  it('fails an upcoming lot', () => {
    expect(isDisplayableLive({ status: 'upcoming', endTime: 2_000 }, now)).toBe(false);
  });
});
