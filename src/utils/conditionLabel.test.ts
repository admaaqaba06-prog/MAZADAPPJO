import { describe, it, expect } from 'vitest';
import { conditionLabel } from './conditionLabel';

describe('conditionLabel', () => {
  it("labels 'new' in both languages", () => {
    expect(conditionLabel('new', false)).toBe('New');
    expect(conditionLabel('new', true)).toBe('جديد');
  });

  it("labels 'used' in both languages", () => {
    expect(conditionLabel('used', false)).toBe('Used');
    expect(conditionLabel('used', true)).toBe('مستعمل');
  });

  it('returns null when the condition is unset', () => {
    expect(conditionLabel(undefined, false)).toBeNull();
    expect(conditionLabel(undefined, true)).toBeNull();
    expect(conditionLabel(null, false)).toBeNull();
    expect(conditionLabel(null, true)).toBeNull();
    expect(conditionLabel('', false)).toBeNull();
    expect(conditionLabel('', true)).toBeNull();
  });

  it('fails closed on an unrecognised value rather than echoing it', () => {
    expect(conditionLabel('refurbished', false)).toBeNull();
    expect(conditionLabel('refurbished', true)).toBeNull();
    // Case and whitespace variants are NOT recognised — the sell forms write
    // the exact lowercase tokens, so anything else is unknown data.
    expect(conditionLabel('New', false)).toBeNull();
    expect(conditionLabel('New', true)).toBeNull();
    expect(conditionLabel(' used ', false)).toBeNull();
    expect(conditionLabel(' used ', true)).toBeNull();
  });
});
