import { describe, it, expect } from 'vitest';
import { mediaFileName } from './dropMedia';

describe('mediaFileName', () => {
  it('names the cover with its extension', () => {
    expect(mediaFileName('https://x/y/photo.jpg?alt=media', 'cover')).toBe('cover.jpg');
  });
  it('numbers gallery photos from 1', () => {
    expect(mediaFileName('https://x/pic.png', 'gallery', 0)).toBe('gallery-1.png');
    expect(mediaFileName('https://x/pic.png', 'gallery', 2)).toBe('gallery-3.png');
  });
  it('names the video', () => {
    expect(mediaFileName('https://x/clip.mp4', 'video')).toBe('video.mp4');
  });
  it('falls back to jpg when no extension is present', () => {
    expect(mediaFileName('https://x/noext', 'cover')).toBe('cover.jpg');
  });
});
