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

/**
 * Did the relay actually accept the OTP for delivery?
 *
 * `fetch` only rejects on a TRANSPORT failure — DNS, connection refused, the
 * 5s abort. An HTTP 404 or 500 resolves normally. There is a second failure
 * class too: WaSender can answer HTTP 200 while its JSON body says
 * `{ success: false }` (for example when its linked WhatsApp session drops).
 * Treating only the HTTP status as delivery launders that provider failure into
 * a green n8n run and eventually into a false "code sent" message in the UI.
 *
 * Reading a Fetch Response body is asynchronous, so callers MUST await this
 * helper. `clone()` is used when available so this check does not consume the
 * original response body. Test doubles without clone() may expose json()
 * directly.
 *
 * An explicit provider/body failure wins over a 2xx status. If the body is
 * empty, non-JSON, or has no recognised boolean, preserve the old HTTP fallback
 * semantics; the n8n workflow should separately be configured to return the
 * final WaSender body and fail its execution when that body says success:false.
 */
async function isRelayDelivered(res) {
  if (!res) return false;

  // Transport reached a server, but HTTP itself rejected the request.
  if (typeof res.ok === 'boolean' && res.ok === false) return false;
  if (typeof res.status === 'number' && (res.status < 200 || res.status >= 300)) return false;

  let body;
  try {
    if (typeof res.clone === 'function') {
      const copy = res.clone();
      if (copy && typeof copy.json === 'function') body = await copy.json();
    } else if (typeof res.json === 'function') {
      body = await res.json();
    } else if (res.body && typeof res.body === 'object') {
      // Simple test doubles may provide an already-parsed body object.
      body = res.body;
    }
  } catch (_) {
    // Empty/non-JSON body: fall back to the HTTP result below.
  }

  // n8n may return the last node as an array; some HTTP-request configurations
  // wrap the provider payload under `body` or `data`. Inspect only these narrow,
  // known shapes and only boolean flags — never infer failure from a message.
  const candidates = [];
  if (Array.isArray(body)) {
    if (body.length === 1) candidates.push(body[0]);
  } else if (body && typeof body === 'object') {
    candidates.push(body);
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (typeof candidate.success === 'boolean') return candidate.success;
    if (typeof candidate.ok === 'boolean') return candidate.ok;
    for (const key of ['body', 'data']) {
      const nested = candidate[key];
      if (!nested || typeof nested !== 'object') continue;
      if (typeof nested.success === 'boolean') return nested.success;
      if (typeof nested.ok === 'boolean') return nested.ok;
    }
  }

  if (typeof res.ok === 'boolean') return res.ok;
  if (typeof res.status === 'number') return res.status >= 200 && res.status < 300;
  return true;
}

module.exports = {
  OTP_TTL_MS, SEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, CODE_LENGTH,
  normalizeJordanPhone, normalizePhone, generateOtpCode, hashOtp, canSendOtp, checkOtp,
  isRelayDelivered,
};
