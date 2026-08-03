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

describe('the real catch-all vocabulary', () => {
  // Every title below is a REAL one from the production Fashion bucket, taken
  // from the backfill's phase-1 report. The first pass of this classifier left
  // all of them unclassified.
  it.each([
    ['ميكروويف منزلي رقمي عملاق', 'Appliances'],
    ['🍽️ * ميكرويف *Sona* مع شواية', 'Appliances'],
    ['خلاط البيك ستيل مع مطحنة', 'Appliances'],
    ['مقلى هواء/قلاية هوائية ذكية بدون زيت', 'Appliances'],
    ['صانعة ثلج منزلية سريعة', 'Appliances'],
    ['إبريق غلي الماء الكهربائي (غلاية)', 'Appliances'],
    ['مروحة عمودية/برجية ذكية', 'Appliances'],
    ['سلاقة بيض كهربائية Sonifer', 'Appliances'],
    ['مكنسة *Panasonic MC-CG713', 'Appliances'],
    ['كشاف طاقة شمسية LED – *500 واط*', 'Appliances'],
    ['PS4', 'Electronics'],
    ['📱  ايباد 11 (iPad 11)', 'Electronics'],
    ['طاولة زجاج مودرن', 'Home & Furniture'],
    ['طقم كورنر', 'Home & Furniture'],
  ])('reads %s as %s', (title, expected) => {
    expect(classifyCategory(title)).toBe(expected);
  });

  it('reads a water cooler as an appliance, not as furniture', () => {
    // 'برادة مياه طاولة' contains طاولة (table). Appliances must be checked
    // first or a water cooler is filed as furniture.
    expect(classifyCategory('برادة مياه طاولة موصولة مباشرة بالخط')).toBe('Appliances');
  });

  it('still declines the genuinely ambiguous ones', () => {
    // Left for a human, deliberately.
    for (const t of ['علم', 'العاب', 'مكبتج', 'دلة قهوة']) {
      expect(classifyCategory(t), t).toBeNull();
    }
  });
});
