'use strict';
// Pure rating helpers. NO firebase deps (root Vitest loads this; #138).
function invalid(msg) { const e = new Error(msg); e.code = 'invalid-argument'; return e; }

function buildBuyerRating(input, nowMs) {
  const stars = Number(input && input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw invalid('stars must be an integer 1–5');
  const text = String((input && input.comment) || '').trim();
  if (text.length > 500) throw invalid('comment must be ≤ 500 characters');
  return { stars, text, createdAt: nowMs };
}

function canSellerRateOrder(order, sellerId, existingSellerRating) {
  if (!order || order.status !== 'completed') return false;
  if (!sellerId || order.sellerId !== sellerId) return false;
  if (existingSellerRating) return false;
  return true;
}

module.exports = { buildBuyerRating, canSellerRateOrder };
