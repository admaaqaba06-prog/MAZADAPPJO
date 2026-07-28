function normalizePaymentRef(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isValidPaymentRef(raw) {
  return normalizePaymentRef(raw).length >= 4;
}

module.exports = { normalizePaymentRef, isValidPaymentRef };
