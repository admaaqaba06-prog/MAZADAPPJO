import { describe, it, expect } from 'vitest';
import {
  MAX_GALLERY_PHOTOS,
  addGalleryPhotos,
  removeGalleryPhoto,
  isImageFile,
  type PickedPhoto,
} from './mediaPickerState';

const photo = (n: number): PickedPhoto => ({ file: { name: `${n}.jpg` } as any, url: `blob:${n}` });

describe('isImageFile', () => {
  it('accepts image mime types', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/png' })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
  // Must be a prefix match on the full `image/` type, not a substring search
  // and not a bare `image` prefix.
  it('matches the type prefix rather than a substring', () => {
    expect(isImageFile({ type: 'application/image' })).toBe(false);
    expect(isImageFile({ type: 'text/not-an-image/jpeg' })).toBe(false);
    expect(isImageFile({ type: 'imagexml/foo' })).toBe(false);
  });
});

describe('MAX_GALLERY_PHOTOS', () => {
  // The live auction room and the seller wizard both assume this cap.
  it('is three', () => {
    expect(MAX_GALLERY_PHOTOS).toBe(3);
  });
});

describe('addGalleryPhotos', () => {
  it('appends to the end', () => {
    expect(addGalleryPhotos([photo(1)], [photo(2)]).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('caps the gallery at three', () => {
    const result = addGalleryPhotos([], [photo(1), photo(2), photo(3), photo(4), photo(5)]);
    expect(result).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('drops overflow when the gallery is already partly full', () => {
    const result = addGalleryPhotos([photo(1), photo(2)], [photo(3), photo(4)]);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('is a no-op for an empty incoming list', () => {
    const prev = [photo(1)];
    expect(addGalleryPhotos(prev, [])).toEqual(prev);
  });

  // Value equality alone would pass on a rewritten copy, which would churn
  // React state for a picker that added nothing.
  it('returns the very same array for an empty incoming list', () => {
    const prev = [photo(1)];
    expect(addGalleryPhotos(prev, [])).toBe(prev);
  });

  it('drops everything incoming once the gallery is already full', () => {
    const full = [photo(1), photo(2), photo(3)];
    expect(addGalleryPhotos(full, [photo(4)]).map((p) => p.url))
      .toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('keeps the existing photos ahead of the new ones', () => {
    const result = addGalleryPhotos([photo(9)], [photo(1), photo(2)]);
    expect(result.map((p) => p.url)).toEqual(['blob:9', 'blob:1', 'blob:2']);
  });

  it('does not mutate the previous array', () => {
    const prev = [photo(1)];
    addGalleryPhotos(prev, [photo(2)]);
    expect(prev).toHaveLength(1);
  });
});

describe('removeGalleryPhoto', () => {
  it('removes the photo at the given index', () => {
    expect(removeGalleryPhoto([photo(1), photo(2), photo(3)], 1).map((p) => p.url))
      .toEqual(['blob:1', 'blob:3']);
  });

  it('ignores an out-of-range index', () => {
    const prev = [photo(1)];
    expect(removeGalleryPhoto(prev, 5)).toEqual(prev);
    expect(removeGalleryPhoto(prev, -1)).toEqual(prev);
  });

  // A guardless filter() returns a value-equal *copy*, so identity is the only
  // assertion that proves the out-of-range case truly no-ops.
  it('returns the very same array for an out-of-range index', () => {
    const prev = [photo(1), photo(2)];
    expect(removeGalleryPhoto(prev, 5)).toBe(prev);
    expect(removeGalleryPhoto(prev, -1)).toBe(prev);
    expect(removeGalleryPhoto(prev, prev.length)).toBe(prev);
    expect(removeGalleryPhoto([], 0)).toHaveLength(0);
  });

  it('removes the first and last photo at the boundary indices', () => {
    const prev = [photo(1), photo(2), photo(3)];
    expect(removeGalleryPhoto(prev, 0).map((p) => p.url)).toEqual(['blob:2', 'blob:3']);
    expect(removeGalleryPhoto(prev, 2).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('does not mutate the previous array', () => {
    const prev = [photo(1), photo(2)];
    removeGalleryPhoto(prev, 0);
    expect(prev.map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });
});
