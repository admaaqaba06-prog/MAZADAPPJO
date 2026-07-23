import { describe, it, expect } from 'vitest';
import { getAuctionMedia } from './auctionMedia';

describe('getAuctionMedia', () => {
  it('orders video first, then thumbnail, then mediaUrls, then conciergePhotos', () => {
    const items = getAuctionMedia({
      videoUrl: 'https://cdn.test/video.mp4',
      thumbnailUrl: 'https://cdn.test/thumb.jpg',
      mediaUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
      conciergePhotos: ['https://cdn.test/c.jpg'],
    });
    expect(items).toEqual([
      { type: 'video', url: 'https://cdn.test/video.mp4' },
      { type: 'image', url: 'https://cdn.test/thumb.jpg' },
      { type: 'image', url: 'https://cdn.test/a.jpg' },
      { type: 'image', url: 'https://cdn.test/b.jpg' },
      { type: 'image', url: 'https://cdn.test/c.jpg' },
    ]);
  });

  it('omits the video entry when videoUrl is empty', () => {
    const items = getAuctionMedia({
      videoUrl: '',
      thumbnailUrl: 'https://cdn.test/thumb.jpg',
      mediaUrls: ['https://cdn.test/a.jpg'],
    });
    expect(items).toEqual([
      { type: 'image', url: 'https://cdn.test/thumb.jpg' },
      { type: 'image', url: 'https://cdn.test/a.jpg' },
    ]);
  });

  it('de-duplicates the thumbnail when it repeats inside mediaUrls', () => {
    const items = getAuctionMedia({
      videoUrl: '',
      thumbnailUrl: 'https://cdn.test/thumb.jpg',
      mediaUrls: ['https://cdn.test/thumb.jpg', 'https://cdn.test/a.jpg'],
      conciergePhotos: ['https://cdn.test/a.jpg'],
    });
    expect(items).toEqual([
      { type: 'image', url: 'https://cdn.test/thumb.jpg' },
      { type: 'image', url: 'https://cdn.test/a.jpg' },
    ]);
  });

  it('returns [] when everything is empty or missing', () => {
    expect(getAuctionMedia({})).toEqual([]);
    expect(getAuctionMedia({ videoUrl: '', thumbnailUrl: '', mediaUrls: [], conciergePhotos: [] })).toEqual([]);
    expect(getAuctionMedia(null)).toEqual([]);
    expect(getAuctionMedia(undefined)).toEqual([]);
  });

  it('skips blank/whitespace-only urls inside the arrays', () => {
    const items = getAuctionMedia({
      thumbnailUrl: 'https://cdn.test/thumb.jpg',
      mediaUrls: ['', '   ', 'https://cdn.test/a.jpg'],
    });
    expect(items).toEqual([
      { type: 'image', url: 'https://cdn.test/thumb.jpg' },
      { type: 'image', url: 'https://cdn.test/a.jpg' },
    ]);
  });

  it('falls back to legacy imageUrl when thumbnailUrl is empty', () => {
    const items = getAuctionMedia({
      videoUrl: '',
      thumbnailUrl: '',
      imageUrl: 'https://cdn.test/legacy.jpg',
    });
    expect(items).toEqual([{ type: 'image', url: 'https://cdn.test/legacy.jpg' }]);
  });
});
