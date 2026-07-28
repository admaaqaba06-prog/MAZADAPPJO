import { describe, it, expect } from 'vitest';
import { reviewCountLabel } from './reviewCount';

describe('reviewCountLabel — English', () => {
  it('uses singular at 1 (no "1 reviews")', () => {
    expect(reviewCountLabel(1, 'en')).toBe('1 review');
  });
  it('uses plural at 0', () => {
    expect(reviewCountLabel(0, 'en')).toBe('0 reviews');
  });
  it('uses plural for 2+', () => {
    expect(reviewCountLabel(2, 'en')).toBe('2 reviews');
    expect(reviewCountLabel(37, 'en')).toBe('37 reviews');
  });
});

describe('reviewCountLabel — Arabic', () => {
  it('none at 0', () => {
    expect(reviewCountLabel(0, 'ar')).toBe('لا تقييمات');
  });
  it('singular at 1 (never the plural "تقييمات")', () => {
    expect(reviewCountLabel(1, 'ar')).toBe('تقييم واحد');
    expect(reviewCountLabel(1, 'ar')).not.toContain('تقييمات');
  });
  it('dual at 2', () => {
    expect(reviewCountLabel(2, 'ar')).toBe('تقييمان');
  });
  it('small plural for 3–10', () => {
    expect(reviewCountLabel(3, 'ar')).toBe('3 تقييمات');
    expect(reviewCountLabel(10, 'ar')).toBe('10 تقييمات');
  });
  it('accusative singular for 11+', () => {
    expect(reviewCountLabel(11, 'ar')).toBe('11 تقييمًا');
    expect(reviewCountLabel(150, 'ar')).toBe('150 تقييمًا');
  });
});

describe('reviewCountLabel — guards', () => {
  it('floors and clamps negatives', () => {
    expect(reviewCountLabel(-4, 'en')).toBe('0 reviews');
    expect(reviewCountLabel(2.9, 'en')).toBe('2 reviews');
  });
});
