import { describe, it, expect } from 'vitest';
import { resizeImage } from './resizeImage';

// NOTE: this project's vitest config runs with `environment: 'node'` (no
// jsdom), so `document`/`Image`/canvas are unavailable here — which means we
// can't exercise the actual resize/re-encode path in this suite. What we CAN
// (and do) exercise for real is every guard: the type checks that run before
// any DOM API is touched, and the "no DOM available" fallback, which is the
// exact branch this environment hits for a real image input. Together these
// cover every way resizeImage can fall back to the original file untouched.
// A jsdom-based suite (jsdom isn't a project dependency today) would be
// needed to assert on the actual resized output dimensions/bytes.

const makeFile = (name: string, type: string, size = 1024): File => {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
};

describe('resizeImage', () => {
  it('resolves non-image files untouched', async () => {
    const file = makeFile('doc.pdf', 'application/pdf');
    const result = await resizeImage(file);
    expect(result).toBe(file);
  });

  it('resolves files with no MIME type untouched', async () => {
    const file = makeFile('mystery', '');
    const result = await resizeImage(file);
    expect(result).toBe(file);
  });

  it('resolves animated GIFs untouched (would flatten to one frame)', async () => {
    const file = makeFile('meme.gif', 'image/gif');
    const result = await resizeImage(file);
    expect(result).toBe(file);
  });

  it('falls back to the original when no DOM/canvas is available (this test env)', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg');
    const result = await resizeImage(file);
    // In this Node test environment `document`/`Image` are undefined, so the
    // "no DOM available" guard must fire and return the input unchanged —
    // never throw, never hang.
    expect(result).toBe(file);
  });

  it('never rejects, regardless of input', async () => {
    const file = makeFile('video.mp4', 'video/mp4');
    await expect(resizeImage(file)).resolves.toBe(file);
  });
});
