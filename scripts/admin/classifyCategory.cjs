'use strict';
/**
 * Title → category, by keyword, for the one-off backfill of mis-bucketed lots.
 *
 * Returns null for anything it does not recognise, and the caller LEAVES THOSE
 * ALONE. A wrong automatic guess on a live auction is worse than the
 * mis-bucketing it would replace, so there is no fuzzy matching and no
 * "best effort" default.
 *
 * Order matters: phones are checked before generic electronics, so an iPhone
 * lands in Phones rather than Electronics.
 *
 * Word matching is substring-based, which is right for Arabic (شاشة inside
 * شاشات) but means Latin keywords must be distinctive enough not to appear
 * inside unrelated words — that is why the list has 'iphone' and 'macbook'
 * rather than 'pro' or 'air'.
 */
const RULES = [
  {
    category: 'Phones',
    words: [
      'iphone', 'galaxy s', 'galaxy note', 'smartphone', 'redmi', 'huawei p',
      'جوال', 'هاتف', 'ايفون', 'آيفون', 'موبايل',
    ],
  },
  {
    category: 'Vehicles',
    words: [
      'toyota', 'hyundai', 'kia ', 'mercedes', 'bmw', 'nissan', 'corolla',
      'سيارة', 'سياره', 'مركبة', 'تويوتا', 'هيونداي',
    ],
  },
  {
    category: 'Watches',
    words: ['rolex', 'omega', 'seiko', 'casio', 'watch', 'ساعة', 'ساعه', 'رولكس'],
  },
  {
    category: 'Appliances',
    words: [
      'fridge', 'refrigerator', 'washing machine', 'microwave', 'oven',
      'ثلاجة', 'غسالة', 'فرن', 'مايكرويف', 'مكيف',
    ],
  },
  {
    category: 'Electronics',
    words: [
      'tv', 'television', 'laptop', 'macbook', 'playstation', 'xbox', 'ipad',
      'tablet', 'camera', 'شاشة', 'تلفزيون', 'لابتوب', 'كمبيوتر', 'كاميرا',
    ],
  },
  {
    category: 'Home & Furniture',
    words: ['sofa', 'couch', 'wardrobe', 'كنبة', 'طاولة', 'كرسي', 'خزانة', 'سرير'],
  },
  {
    category: 'Real Estate',
    words: ['apartment', 'شقة', 'أرض', 'قطعة أرض', 'فيلا', 'عمارة'],
  },
];

function classifyCategory(title) {
  const t = String(title == null ? '' : title).toLowerCase();
  if (!t.trim()) return null;
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w))) return rule.category;
  }
  return null;
}

module.exports = { classifyCategory, RULES };
