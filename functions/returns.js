'use strict';
// Pure return-claim helpers. NO firebase deps (root Vitest loads this; #138).

const RETURN_REASONS = ['not_as_described', 'damaged'];
const MAX_PHOTOS = 6;

function invalid(msg) {
  const e = new Error(msg);
  e.code = 'invalid-argument';
  return e;
}

function buildReturnClaim(input, nowMs) {
  const reason = input && input.reason;
  if (!RETURN_REASONS.includes(reason)) throw invalid('invalid reason');
  const description = String((input && input.description) || '').trim();
  if (!description) throw invalid('description is required');
  const photoUrls = Array.isArray(input && input.photoUrls) ? input.photoUrls.filter(Boolean) : [];
  if (photoUrls.length < 1) throw invalid('at least one photo is required');
  if (photoUrls.length > MAX_PHOTOS) throw invalid(`at most ${MAX_PHOTOS} photos`);
  return {
    reason, description, photoUrls,
    sellerPaysReturnShipping: true,
    status: 'open',
    createdAt: nowMs,
  };
}

function canRequestReturn(order) {
  if (!order || order.status !== 'shipped') return false;
  if (order.returnClaim) return false;
  return true;
}

module.exports = { RETURN_REASONS, MAX_PHOTOS, buildReturnClaim, canRequestReturn };
