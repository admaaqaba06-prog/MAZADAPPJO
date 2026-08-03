import { describe, it, expect } from 'vitest';
import { REJECTION_PRESETS, rejectionPresetLabel } from './rejectionReasons';

describe('rejection presets', () => {
  it('covers the two reasons that actually recur', () => {
    const keys = REJECTION_PRESETS.map(p => p.key);
    expect(keys).toContain('wrong_category');
    expect(keys).toContain('bad_photos');
  });

  it('phrases every preset as an instruction, not a verdict', () => {
    // The seller reads this as their next action. "Rejected" tells them they
    // failed; "Fix the category" tells them what to do.
    for (const p of REJECTION_PRESETS) {
      expect(p.ar.trim(), p.key).not.toBe('');
      expect(p.en.trim(), p.key).not.toBe('');
    }
  });

  it('labels a known preset in both languages', () => {
    expect(rejectionPresetLabel('wrong_category', false)).toBe('Fix the category');
    expect(rejectionPresetLabel('wrong_category', true)).toBe('صحّح التصنيف');
  });

  it('echoes a historical free-text reason unchanged', () => {
    // Reasons stored before presets existed are arbitrary strings, written by
    // admins into the reject box, and must still render to the seller.
    expect(rejectionPresetLabel('blurry photo of the box', false)).toBe('blurry photo of the box');
  });

  it('never renders an empty instruction', () => {
    expect(rejectionPresetLabel('', true)).toBe('');
  });
});
