import { describe, it, expect } from 'vitest';
import { docHasMedia, draftHasMedia } from './listingMedia';

describe('docHasMedia', () => {
  it('accepts a lot with only a cover image', () => {
    expect(docHasMedia({ thumbnailUrl: 'https://x/a.jpg' })).toBe(true);
  });

  it('accepts a lot with only a video', () => {
    expect(docHasMedia({ videoUrl: 'https://x/a.mp4' })).toBe(true);
  });

  it('accepts a lot with only a gallery', () => {
    expect(docHasMedia({ mediaUrls: ['https://x/a.jpg'] })).toBe(true);
  });

  it('rejects a lot with nothing', () => {
    expect(docHasMedia({})).toBe(false);
    expect(docHasMedia({ thumbnailUrl: '', videoUrl: null, mediaUrls: [] })).toBe(false);
  });

  it('rejects a whitespace-only url, which is not an image', () => {
    expect(docHasMedia({ thumbnailUrl: '   ' })).toBe(false);
  });
});

describe('draftHasMedia', () => {
  it('accepts a draft with only a cover file', () => {
    expect(draftHasMedia({ thumbnailFile: {} })).toBe(true);
  });

  it('accepts a draft with only a video file', () => {
    expect(draftHasMedia({ videoFile: {} })).toBe(true);
  });

  it('accepts a draft with only gallery photos', () => {
    expect(draftHasMedia({ gallery: [{}] })).toBe(true);
  });

  it('rejects an empty draft', () => {
    expect(draftHasMedia({})).toBe(false);
    expect(draftHasMedia({ thumbnailFile: null, videoFile: null, gallery: [] })).toBe(false);
  });
});

describe('the two adapters agree', () => {
  // They read different shapes (a saved doc's urls vs a draft's unsaved File
  // objects) but encode ONE rule. If they drift, one publish path silently
  // reopens the hole that made the stock-photo fallback necessary in the first
  // place.
  const pairs: { name: string; doc: boolean; draft: boolean }[] = [
    { name: 'cover only', doc: docHasMedia({ thumbnailUrl: 'u' }), draft: draftHasMedia({ thumbnailFile: {} }) },
    { name: 'video only', doc: docHasMedia({ videoUrl: 'u' }), draft: draftHasMedia({ videoFile: {} }) },
    { name: 'gallery only', doc: docHasMedia({ mediaUrls: ['u'] }), draft: draftHasMedia({ gallery: [{}] }) },
    { name: 'nothing', doc: docHasMedia({}), draft: draftHasMedia({}) },
  ];

  it.each(pairs)('agree on $name', ({ doc, draft }) => {
    expect(doc).toBe(draft);
  });
});
