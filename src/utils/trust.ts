import { SellerProfile } from '../types';

/**
 * Dynamically calculates a trust score (0 to 100) based on platform factors:
 * - Completed Orders (+5 pts each, max 40)
 * - Successful Deliveries (+5 pts each, max 20)
 * - Cancelled Orders (-10 pts each)
 * - Disputes Lost (-20 pts each)
 * - Average Rating (up to 30 pts: rating * 6)
 * - Account Age (+1 pt per month, max 10)
 * - Verification Status: Verified (+10), Premium Verified (+20)
 */
export function calculateTrustScore(
  verificationStatus: 'not_verified' | 'pending' | 'verified' | 'premium_verified',
  completedCount: number,
  deliveredCount: number,
  cancelledCount: number,
  disputesLostCount: number,
  averageRating: number,
  accountAgeMonths: number
): number {
  let score = 50; // Base baseline score

  // Completed Orders
  score += Math.min(40, completedCount * 5);

  // Successful Deliveries
  score += Math.min(20, deliveredCount * 5);

  // Cancelled Orders penalty
  score -= (cancelledCount * 10);

  // Disputes Lost penalty
  score -= (disputesLostCount * 20);

  // Rating contribution (max 30 pts)
  if (averageRating > 0) {
    score += Math.round(averageRating * 6);
  } else {
    score += 24; // Default baseline rating contribution (equivalent to 4.0 stars)
  }

  // Account Age
  score += Math.min(10, accountAgeMonths);

  // Verification status bonus
  if (verificationStatus === 'verified') {
    score += 10;
  } else if (verificationStatus === 'premium_verified') {
    score += 20;
  }

  // Force boundaries
  return Math.max(0, Math.min(100, score));
}

/**
 * Computes badges for a seller profile dynamically
 */
export function getSellerBadges(
  verificationStatus: 'not_verified' | 'pending' | 'verified' | 'premium_verified',
  completedCount: number,
  averageRating: number,
  responseTime?: string
): string[] {
  const list: string[] = [];

  if (verificationStatus === 'verified') {
    list.push('Verified');
  } else if (verificationStatus === 'premium_verified') {
    list.push('Verified');
    list.push('Premium Seller');
  }

  if (completedCount >= 5) {
    list.push('Top Seller');
  }
  if (completedCount >= 10) {
    list.push('Trusted Seller');
  }
  if (completedCount >= 100) {
    list.push('100 Sales');
  }
  if (completedCount >= 500) {
    list.push('500 Sales');
  }
  if (completedCount >= 1000) {
    list.push('1000 Sales');
  }

  if (averageRating >= 4.8 && completedCount >= 3) {
    list.push('Trusted Seller');
  }

  if (responseTime && (responseTime.includes('15 mins') || responseTime.includes('hour') || responseTime.includes('ساعة') || responseTime.includes('دقائق'))) {
    list.push('Fast Shipper');
  }

  // Deduplicate
  return Array.from(new Set(list));
}
