import { describe, it, expect } from 'vitest';
import { buildAuctionCaption } from './dropCaption';

const sample = {
  auctionNumber: 1706,
  startTime: '7:30',
  durationLabel: '30 دقيقة',
  startingPriceJod: 125,
  productName: 'Green Home غسالة',
  specs: ['السعة: 7 كغم', 'تحميل أمامي', 'شاشة رقمية'],
  condition: 'جديدة كلياً',
  deepLink: 'https://mazadjo.app/?auction=auction-123',
};

describe('buildAuctionCaption', () => {
  it('includes the auction number and start time', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('مزاد رقم: 1706');
    expect(out).toContain('يبدأ الساعة: 7:30');
  });

  it('includes duration, starting price and product name', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('مدة المزاد: 30 دقيقة');
    expect(out).toContain('يبدأ المزاد من: (125 دينار)');
    expect(out).toContain('اسم المنتج: Green Home غسالة');
  });

  it('renders every spec as a bullet and the condition', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('• السعة: 7 كغم');
    expect(out).toContain('• تحميل أمامي');
    expect(out).toContain('• شاشة رقمية');
    expect(out).toContain('جديدة كلياً');
  });

  it('includes the subscribers-only rule, the guarantee and the deep link', () => {
    const out = buildAuctionCaption(sample);
    expect(out).toContain('المزايدة للمشتركين فقط');
    expect(out).toContain('كفالة المزاد: شهر استرجاع');
    expect(out).toContain('https://mazadjo.app/?auction=auction-123');
  });
});
