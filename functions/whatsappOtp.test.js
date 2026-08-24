import { describe, it, expect } from 'vitest';
const {
  normalizeJordanPhone, generateOtpCode, hashOtp, canSendOtp, checkOtp,
  OTP_TTL_MS, SEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, CODE_LENGTH, isRelayDelivered,
} = require('./whatsappOtp');

describe('normalizeJordanPhone', () => {
  it('normalizes local + international shapes to +9627XXXXXXXX', () => {
    expect(normalizeJordanPhone('0791234567')).toBe('+962791234567');
    expect(normalizeJordanPhone('+962 79 123 4567')).toBe('+962791234567');
    expect(normalizeJordanPhone('00962791234567')).toBe('+962791234567');
  });
  it('rejects junk / non-Jordan-mobile', () => {
    expect(normalizeJordanPhone('123')).toBeNull();
    expect(normalizeJordanPhone('0611234567')).toBeNull(); // not a 7-prefixed mobile
    expect(normalizeJordanPhone('')).toBeNull();
  });
});

describe('generateOtpCode', () => {
  it('is a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
      expect(c.length).toBe(CODE_LENGTH);
    }
  });
});

describe('hashOtp', () => {
  it('is deterministic + salt-sensitive + not the plaintext', () => {
    expect(hashOtp('123456', 's1')).toBe(hashOtp('123456', 's1'));
    expect(hashOtp('123456', 's1')).not.toBe(hashOtp('123456', 's2'));
    expect(hashOtp('123456', 's1')).not.toContain('123456');
  });
});

describe('canSendOtp', () => {
  const cfg = { cooldownMs: SEND_COOLDOWN_MS, windowMs: 3600000, maxPerWindow: MAX_SENDS_PER_HOUR };
  it('allows a first send (no record)', () => {
    expect(canSendOtp(null, 1_000_000, cfg).ok).toBe(true);
  });
  it('blocks inside the cooldown with a retryAfter', () => {
    const r = canSendOtp({ lastSentAt: 1_000_000, sendCount: 1, windowStartAt: 1_000_000 }, 1_030_000, cfg);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
  it('allows again after the cooldown', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 1, windowStartAt: 1_000_000 }, 1_070_000, cfg).ok).toBe(true);
  });
  it('blocks once the hourly cap is hit', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 5, windowStartAt: 1_000_000 }, 1_100_000, cfg).ok).toBe(false);
  });
  it('resets after the window elapses', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 5, windowStartAt: 1_000_000 }, 1_000_000 + 3_700_000, cfg).ok).toBe(true);
  });
});

describe('checkOtp', () => {
  const salt = 's';
  const rec = (over = {}) => ({ codeHash: hashOtp('123456', salt), salt, expiresAt: 2_000_000, attempts: 0, ...over });
  it('accepts the right code before expiry', () => {
    expect(checkOtp(rec(), '123456', 1_500_000)).toEqual({ ok: true });
  });
  it('rejects the wrong code', () => {
    expect(checkOtp(rec(), '000000', 1_500_000).ok).toBe(false);
  });
  it('rejects an expired code', () => {
    expect(checkOtp(rec(), '123456', 2_500_000).ok).toBe(false);
  });
  it('rejects when attempts exhausted', () => {
    expect(checkOtp(rec({ attempts: MAX_ATTEMPTS }), '123456', 1_500_000).ok).toBe(false);
  });
  it('rejects a missing record', () => {
    expect(checkOtp(null, '123456', 1_500_000).ok).toBe(false);
  });
});

const { normalizePhone } = require('./whatsappOtp');
describe('normalizePhone (any country)', () => {
  it('validates + canonicalizes E.164', () => {
    expect(normalizePhone('+962791234567')).toBe('+962791234567');
    expect(normalizePhone('+19084058109')).toBe('+19084058109');
    expect(normalizePhone('962791234567')).toBe('+962791234567'); // missing + tolerated
  });
  it('rejects invalid', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

/* ======================================================================
   isRelayDelivered — the OTP relay's own answer, not an assumption.

   The relay call was `await fetch(url, ...)` inside a bare try/catch, and the
   callable returned `{ ok: true }` whatever came back. Two failures were
   invisible: `fetch` only rejects on a TRANSPORT error, so an HTTP 404 or 500 —
   a deactivated workflow, a renamed webhook path — resolved as a successful
   send. With the relay's measured failure rate at ~60%, most people who signed
   in were told a WhatsApp code was on its way when nothing had been sent, and
   the SMS fallback sat unnoticed under the button.
   ====================================================================== */
describe('isRelayDelivered', () => {
  it('trusts an explicit ok', () => {
    expect(isRelayDelivered({ ok: true, status: 200 })).toBe(true);
    expect(isRelayDelivered({ ok: false, status: 404 })).toBe(false);
    expect(isRelayDelivered({ ok: false, status: 500 })).toBe(false);
  });

  it('treats a missing response as not delivered', () => {
    // This is the `fetch` threw / timed out path.
    expect(isRelayDelivered(null)).toBe(false);
    expect(isRelayDelivered(undefined)).toBe(false);
  });

  it('falls back to the status code when ok is absent', () => {
    expect(isRelayDelivered({ status: 200 })).toBe(true);
    expect(isRelayDelivered({ status: 204 })).toBe(true);
    expect(isRelayDelivered({ status: 404 })).toBe(false);
    expect(isRelayDelivered({ status: 302 })).toBe(false);
  });

  it('does not invent a failure from an unrecognised shape', () => {
    // Deciding "not delivered" here would tell a user the code failed when it
    // may well have arrived. Only a shape that positively reports failure counts
    // as failure.
    expect(isRelayDelivered({})).toBe(true);
  });

  it('rejects the exact 404 n8n returns for an inactive workflow', () => {
    // Measured against the live endpoint: an unregistered/deactivated webhook
    // answers 404 with a JSON body. `fetch` resolves, so only the status shows it.
    expect(isRelayDelivered({ ok: false, status: 404, json: () => ({ code: 404 }) })).toBe(false);
  });
});
