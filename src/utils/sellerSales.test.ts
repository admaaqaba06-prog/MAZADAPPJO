import { describe, it, expect } from 'vitest';
import { sumPaidSalesThisMonth } from './sellerSales';

// `now` is fixed to mid-July 2026 (Amman); createdAt mirrors the shapes the
// SellerCenterView orders actually carry: epoch ms number OR a Firestore
// timestamp `{ seconds }`.
const NOW = new Date(2026, 6, 15, 12, 0, 0); // July = month index 6
const inMonthMs = new Date(2026, 6, 10, 9, 0, 0).getTime();
const lastMonthMs = new Date(2026, 5, 20, 9, 0, 0).getTime(); // June

describe('sumPaidSalesThisMonth', () => {
  it('excludes an in-month waiting_payment order', () => {
    const orders = [
      { status: 'waiting_payment', winningBidAmount: 100, createdAt: inMonthMs },
    ];
    expect(sumPaidSalesThisMonth(orders, NOW)).toBe(0);
  });

  it('excludes an in-month defaulted order', () => {
    const orders = [
      { status: 'defaulted', winningBidAmount: 250, createdAt: inMonthMs },
    ];
    expect(sumPaidSalesThisMonth(orders, NOW)).toBe(0);
  });

  it('includes in-month paid and completed orders', () => {
    const orders = [
      { status: 'paid', winningBidAmount: 100, createdAt: inMonthMs },
      { status: 'completed', winningBidAmount: 50, createdAt: { seconds: Math.floor(inMonthMs / 1000) } },
    ];
    expect(sumPaidSalesThisMonth(orders, NOW)).toBe(150);
  });

  it('excludes a paid order from last month', () => {
    const orders = [
      { status: 'paid', winningBidAmount: 999, createdAt: lastMonthMs },
    ];
    expect(sumPaidSalesThisMonth(orders, NOW)).toBe(0);
  });

  it('sums only the qualifying orders in a mixed batch', () => {
    const orders = [
      { status: 'paid', winningBidAmount: 100, createdAt: inMonthMs }, // in
      { status: 'completed', winningBidAmount: 40, createdAt: inMonthMs }, // in
      { status: 'waiting_payment', winningBidAmount: 500, createdAt: inMonthMs }, // out: status
      { status: 'defaulted', winningBidAmount: 500, createdAt: inMonthMs }, // out: status
      { status: 'paid', winningBidAmount: 999, createdAt: lastMonthMs }, // out: month
    ];
    expect(sumPaidSalesThisMonth(orders, NOW)).toBe(140);
  });
});
