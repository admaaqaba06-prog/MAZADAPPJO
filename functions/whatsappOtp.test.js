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

   There are TWO ways a resolved fetch can still be a failed delivery:
   1. HTTP 404/500 — fetch resolves, but the relay endpoint rejected it.
   2. HTTP 200 + `{ success:false }` — n8n/WaSender reached the provider, but
      the linked WhatsApp session (or provider send) failed. This second case
      is the one that silently reported "code sent" for every user while the
      dashboard stayed green.
   ====================================================================== */
describe('isRelayDelivered', () => {
  it('trusts an explicit successful HTTP result when there is no failure body', async () => {
    expect(await isRelayDelivered({ ok: true, status: 200 })).toBe(true);
    expect(await isRelayDelivered({ ok: false, status: 404 })).toBe(false);
    expect(await isRelayDelivered({ ok: false, status: 500 })).toBe(false);
  });

  it('treats a missing response as not delivered', async () => {
    // This is the `fetch` threw / timed out path.
    expect(await isRelayDelivered(null)).toBe(false);
    expect(await isRelayDelivered(undefined)).toBe(false);
  });

  it('falls back to the status code when ok is absent', async () => {
    expect(await isRelayDelivered({ status: 200 })).toBe(true);
    expect(await isRelayDelivered({ status: 204 })).toBe(true);
    expect(await isRelayDelivered({ status: 404 })).toBe(false);
    expect(await isRelayDelivered({ status: 302 })).toBe(false);
  });

  it('does not invent a failure from an unrecognised shape', async () => {
    // Deciding "not delivered" here would tell a user the code failed when it
    // may well have arrived. Only a shape that positively reports failure counts
    // as failure.
    expect(await isRelayDelivered({})).toBe(true);
  });

  it('rejects the exact 404 n8n returns for an inactive workflow', async () => {
    // Measured against the live endpoint: an unregistered/deactivated webhook
    // answers 404 with a JSON body. `fetch` resolves, so HTTP alone catches it.
    expect(await isRelayDelivered({ ok: false, status: 404, json: async () => ({ code: 404 }) })).toBe(false);
  });

  it('rejects HTTP 200 when WaSender says success:false in the body', async () => {
    // Regression: this is the exact class of failure that was laundered through
    // n8n -> fetch -> callable -> client as a successful WhatsApp send.
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: false, message: 'WhatsApp session disconnected' }),
    };
    expect(await isRelayDelivered(response)).toBe(false);
  });

  it('accepts HTTP 200 when the provider explicitly says success:true', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    };
    expect(await isRelayDelivered(response)).toBe(true);
  });

  it('reads a one-item n8n last-node array and wrapped provider body', async () => {
    expect(await isRelayDelivered({
      ok: true,
      status: 200,
      json: async () => [{ success: false }],
    })).toBe(false);

    expect(await isRelayDelivered({
      ok: true,
      status: 200,
      json: async () => ({ body: { success: false } }),
    })).toBe(false);
  });
});
