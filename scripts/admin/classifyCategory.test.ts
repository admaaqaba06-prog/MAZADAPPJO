import { describe, it, expect } from 'vitest';
// @ts-expect-error — .cjs module, no type declarations
import { classifyCategory } from './classifyCategory.cjs';

describe('classifyCategory', () => {
  it('reads an English television as Electronics', () => {
    expect(classifyCategory('Skyworth 55" Smart TV')).toBe('Electronics');
  });

  it('reads an Arabic television as Electronics', () => {
    expect(classifyCategory('شاشة سكاي ورث ٥٥ بوصة')).toBe('Electronics');
  });

  it('reads a watch in either language', () => {
    expect(classifyCategory('Rolex Submariner')).toBe('Watches');
    expect(classifyCategory('ساعة رولكس')).toBe('Watches');
  });

  it('reads a phone as Phones, not generic Electronics', () => {
    // Order matters in RULES — phones are checked first.
    expect(classifyCategory('iPhone 15 Pro Max')).toBe('Phones');
    expect(classifyCategory('جوال ايفون ١٥')).toBe('Phones');
  });

  it('reads a car in either language', () => {
    expect(classifyCategory('Toyota Corolla 2019')).toBe('Vehicles');
    expect(classifyCategory('سيارة تويوتا كورولا')).toBe('Vehicles');
  });

  it('reads a fridge as Appliances', () => {
    expect(classifyCategory('Samsung Refrigerator 500L')).toBe('Appliances');
    expect(classifyCategory('ثلاجة سامسونج')).toBe('Appliances');
  });

  it('LEAVES an unrecognised title alone rather than guessing', () => {
    // A wrong auto-guess on a live auction is worse than the status quo, so
    // "I do not know" must be representable and must not fall through to a
    // default bucket.
    expect(classifyCategory('لوحة فنية قديمة')).toBeNull();
    expect(classifyCategory('Vintage oil painting')).toBeNull();
    expect(classifyCategory('')).toBeNull();
    expect(classifyCategory('   ')).toBeNull();
    expect(classifyCategory(undefined)).toBeNull();
    expect(classifyCategory(null)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(classifyCategory('SAMSUNG REFRIGERATOR')).toBe('Appliances');
    expect(classifyCategory('MACBOOK PRO 16')).toBe('Electronics');
  });

  it('only ever returns a canonical category value', () => {
    const canonical = [
      'Vehicles', 'Phones', 'Electronics', 'Watches',
      'Appliances', 'Home & Furniture', 'Real Estate', 'Fashion',
    ];
    const samples = ['iPhone 15', 'ساعة', 'Toyota', 'شاشة', 'sofa', 'شقة', 'ثلاجة'];
    for (const s of samples) {
      const got = classifyCategory(s);
      expect(canonical, `${s} → ${got}`).toContain(got);
    }
  });
});
