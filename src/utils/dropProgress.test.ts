import { describe, it, expect } from 'vitest';
import { photoUploadLabel, uploadStageLabel, type UploadStage } from './dropProgress';

const STAGES: UploadStage[] = ['video', 'thumbnail', 'saving'];

describe('photoUploadLabel', () => {
  it('counts from one, not from zero', () => {
    // The loop index is zero-based; "Uploading photo 0 of 3" is a bug report.
    expect(photoUploadLabel(0, 3, false)).toBe('Uploading photo 1 of 3…');
    expect(photoUploadLabel(0, 3, true)).toBe('جارٍ رفع الصورة 1 من 3…');
  });

  it('reaches the total on the last photo', () => {
    expect(photoUploadLabel(2, 3, false)).toBe('Uploading photo 3 of 3…');
    expect(photoUploadLabel(2, 3, true)).toBe('جارٍ رفع الصورة 3 من 3…');
  });

  it('reads correctly for a single photo', () => {
    expect(photoUploadLabel(0, 1, false)).toBe('Uploading photo 1 of 1…');
  });

  it('never returns the same sentence for both languages', () => {
    expect(photoUploadLabel(1, 3, true)).not.toBe(photoUploadLabel(1, 3, false));
  });
});

describe('uploadStageLabel', () => {
  it('names the video stage with its percentage', () => {
    expect(uploadStageLabel(42, 'video', false)).toBe('Uploading video… 42%');
    expect(uploadStageLabel(42, 'video', true)).toBe('جارٍ رفع الفيديو… 42%');
  });

  it('names the cover stage with its percentage', () => {
    expect(uploadStageLabel(7, 'thumbnail', false)).toBe('Uploading cover… 7%');
    expect(uploadStageLabel(7, 'thumbnail', true)).toBe('جارٍ رفع صورة الغلاف… 7%');
  });

  it('does not confuse the video and cover stages', () => {
    // Same percentage, so only the stage branch distinguishes them.
    expect(uploadStageLabel(50, 'video', false)).not.toBe(uploadStageLabel(50, 'thumbnail', false));
    expect(uploadStageLabel(50, 'video', true)).not.toBe(uploadStageLabel(50, 'thumbnail', true));
  });

  it('shows no percentage while saving', () => {
    // The write has no meaningful byte progress; a number here would be invented.
    expect(uploadStageLabel(100, 'saving', false)).toBe('Creating auction…');
    expect(uploadStageLabel(100, 'saving', true)).toBe('جارٍ إنشاء المزاد…');
  });

  it('ignores the progress value entirely while saving', () => {
    expect(uploadStageLabel(0, 'saving', false)).toBe(uploadStageLabel(37, 'saving', false));
    expect(uploadStageLabel(0, 'saving', true)).toBe(uploadStageLabel(37, 'saving', true));
  });

  it('rounds a fractional percentage', () => {
    expect(uploadStageLabel(42.4, 'video', false)).toBe('Uploading video… 42%');
    expect(uploadStageLabel(42.6, 'video', false)).toBe('Uploading video… 43%');
  });

  it('never shows NaN for a zero-byte upload', () => {
    // Firebase computes bytesTransferred/totalBytes; totalBytes 0 gives NaN.
    expect(uploadStageLabel(NaN, 'video', false)).toBe('Uploading video… 0%');
    expect(uploadStageLabel(NaN, 'thumbnail', true)).toBe('جارٍ رفع صورة الغلاف… 0%');
  });

  it('never shows Infinity, and does not read it as finished', () => {
    // Any non-finite reading is "we do not know", which shows as 0 rather than
    // 100 — a button claiming 100% on a garbage number looks done when it isn't.
    expect(uploadStageLabel(Infinity, 'video', false)).toBe('Uploading video… 0%');
    expect(uploadStageLabel(-Infinity, 'video', false)).toBe('Uploading video… 0%');
  });

  it('clamps out-of-range percentages to 0 and 100', () => {
    expect(uploadStageLabel(-5, 'video', false)).toBe('Uploading video… 0%');
    expect(uploadStageLabel(100.4, 'video', false)).toBe('Uploading video… 100%');
    expect(uploadStageLabel(140, 'thumbnail', false)).toBe('Uploading cover… 100%');
  });

  it('shows the true bounds unchanged', () => {
    // The clamp must not swallow a legitimate 0% or 100%.
    expect(uploadStageLabel(0, 'video', false)).toBe('Uploading video… 0%');
    expect(uploadStageLabel(100, 'video', false)).toBe('Uploading video… 100%');
  });

  it('never returns the same sentence for both languages, in any stage', () => {
    for (const stage of STAGES) {
      expect(uploadStageLabel(50, stage, true)).not.toBe(uploadStageLabel(50, stage, false));
    }
  });

  it('always returns a non-empty label', () => {
    // The button falls back to "Creating…" only on an EMPTY progressLabel, so a
    // stage returning '' would look like the upload had not started.
    for (const stage of STAGES) {
      for (const isAr of [true, false]) {
        expect(uploadStageLabel(0, stage, isAr).length).toBeGreaterThan(0);
      }
    }
  });
});
