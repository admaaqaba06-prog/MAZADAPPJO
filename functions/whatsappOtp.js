'use strict';
// Pure WhatsApp-OTP helpers. Only node crypto (no firebase) so root Vitest loads it (#138).
const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const OTP_TTL_MS = 10 * 60 * 1000;       // code valid 10 min
const SEND_COOLDOWN_MS = 60 * 1000;      // 60s between sends
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

function normalizeJordanPhone(input) {
  if (!input) return null;
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('00962')) d = d.slice(5);
  else if (d.startsWith('962')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^7\d{8}$/.test(d)) return null;
  return `+962${d}`;
}

// Any-country E.164 validator: the client sends a full E.164 (it owns country
// selection); we validate + canonicalize. Tolerates a missing leading '+'.
function normalizePhone(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s.startsWith('+')) s = `+${s.replace(/[^\d]/g, '')}`;
  const p = parsePhoneNumberFromString(s);
  return p && p.isValid() ? p.number : null;
}

function generateOtpCode() {
  // crypto-random, zero-padded, uniform over [0, 10^CODE_LENGTH)
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
}

function hashOtp(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function canSendOtp(record, nowMs, cfg) {
  const cooldownMs = cfg.cooldownMs, windowMs = cfg.windowMs, maxPerWindow = cfg.maxPerWindow;
  if (!record) return { ok: true };
  const sinceLast = nowMs - (record.lastSentAt || 0);
  if (sinceLast < cooldownMs) {
    return { ok: false, retryAfterSec: Math.ceil((cooldownMs - sinceLast) / 1000) };
  }
  const windowStart = record.windowStartAt || 0;
  const inWindow = nowMs - windowStart < windowMs;
  if (inWindow && (record.sendCount || 0) >= maxPerWindow) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (nowMs - windowStart)) / 1000) };
  }
  return { ok: true };
}

function checkOtp(record, code, nowMs) {
  if (!record || !record.codeHash) return { ok: false, reason: 'no_code' };
  if (nowMs >= (record.expiresAt || 0)) return { ok: false, reason: 'expired' };
  if ((record.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  const candidate = hashOtp(String(code || ''), record.salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(record.codeHash);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  return match ? { ok: true } : { ok: false, reason: 'mismatch' };
}

module.exports = {
  OTP_TTL_MS, SEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, CODE_LENGTH,
  normalizeJordanPhone, normalizePhone, generateOtpCode, hashOtp, canSendOtp, checkOtp,
};
