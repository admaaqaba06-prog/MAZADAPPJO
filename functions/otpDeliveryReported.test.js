// A failed OTP send must reach the user, not just the logs.
//
// THE BUG. `postOtpToRelay` returned nothing and swallowed everything:
//
//   try { await fetch(url, {...}); }
//   catch (e) { console.warn('[otp] relay send failed:', e && e.message); }
//
// …and the callable answered `{ ok: true }` regardless. So the sign-in screen
// said "we sent a code on WhatsApp to +962…" even when nothing had been sent.
// Measured on the live n8n instance the day this was written: 156 of 261
// production executions failing, a 59.8% failure rate, up 58 percentage points.
// Most people who tried to sign in were waiting for a message that was not
// coming, with the SMS fallback unnoticed beneath the button.
//
// Two failures were invisible, not one. `fetch` only rejects on a TRANSPORT
// error, so an HTTP 404 or 500 — a deactivated workflow, a renamed webhook path
// — resolved as a successful send and was never even logged. Probing the live
// endpoint returns exactly that: a 404 with a JSON body.
//
// Source-text assertions for the wiring; the decision itself is EXECUTED in
// whatsappOtp.test.js against `isRelayDelivered`. `functions/index.js` needs the
// Admin SDK and cannot be imported here, which is why the repo tests it this way
// (see functions/txnPurity.test.js for the same approach).
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const INDEX = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const LOGIN = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'components', 'LoginView.tsx'), 'utf8');
const CONTEXT = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'context', 'AppContext.tsx'), 'utf8');

/** The body of `postOtpToRelay`, declaration to the next one. */
function relayBody() {
  const start = INDEX.indexOf('async function postOtpToRelay');
  if (start === -1) throw new Error('postOtpToRelay not found — was it renamed?');
  const end = INDEX.indexOf('\nfunction ', start) === -1
    ? INDEX.indexOf('\n// resolveLang', start)
    : INDEX.indexOf('\nfunction ', start);
  if (end === -1) throw new Error('could not bound postOtpToRelay');
  return INDEX.slice(start, end);
}

describe('the OTP relay reports whether it delivered', () => {
  it('checks the HTTP status instead of trusting a resolved fetch', () => {
    const body = relayBody();
    // The whole point: a 404 from a dead webhook resolves, so only the status
    // distinguishes it from a real send.
    expect(body).toMatch(/isRelayDelivered\(/);
  });

  it('AWAITS isRelayDelivered — an unawaited Promise is always truthy', () => {
    // `isRelayDelivered` is async. Called without `await`, it hands back a
    // pending Promise, and `if (!delivered)` on a Promise is never true — so
    // the one server-side log line that reports a rejected relay send goes
    // silent, and the only remaining evidence of a failure is the client's
    // banner. The callable's return value still comes out right (an async
    // function unwraps a returned Promise), which is exactly why this hides.
    expect(relayBody()).toMatch(/await\s+isRelayDelivered\(/);
  });

  it('logs the rejected status, so a failure is visible server-side too', () => {
    const body = relayBody();
    expect(body).toMatch(/if \(!delivered\)[\s\S]{0,200}console\.warn/);
  });

  it('returns a boolean on every path, including both failure paths', () => {
    const body = relayBody();
    // unset URL, rejected send, and the thrown/timed-out catch.
    expect(body).toMatch(/return false;[\s\S]*return delivered;|return delivered;[\s\S]*return false;/);
    expect((body.match(/return false;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('still never throws — the code is already committed', () => {
    // A relay outage must not fail the callable: the OTP row is written first,
    // and throwing here would lose a code the user could still verify.
    expect(relayBody()).toMatch(/catch \(e\) \{/);
  });
});

describe('the callable passes delivery through to the client', () => {
  it('returns `delivered` alongside `ok`', () => {
    // `ok` keeps meaning "a code was issued" — verify still depends on it.
    expect(INDEX).toMatch(/const delivered = await postOtpToRelay\(/);
    expect(INDEX).toMatch(/return \{ ok: true, delivered, retryAfterSec/);
  });

  it('does NOT roll back the rate-limit bookkeeping on a failed send', () => {
    // Deliberate: resetting the 60s cooldown and the 5/hour window whenever the
    // relay fails would let a caller lift the abuse guard by forcing failures.
    // The user is not stuck — SMS is a separate provider with its own limit.
    const after = INDEX.slice(INDEX.indexOf('const delivered = await postOtpToRelay('));
    const upToReturn = after.slice(0, after.indexOf('return {'));
    expect(upToReturn).not.toMatch(/tx\.set|\.update\(|\.delete\(/);
  });
});

describe('the client stops claiming a code was sent when it was not', () => {
  it('types `delivered` on both the context signature and the callable', () => {
    expect(CONTEXT).toMatch(/requestWhatsappOtp: \(phone: string\) => Promise<\{ ok: boolean; delivered\?: boolean/);
    expect(CONTEXT).toMatch(/getCallableFunction<\{ phone: string \}, \{ ok: boolean; delivered\?: boolean/);
  });

  it('reads it and records the failure', () => {
    expect(LOGIN).toMatch(/res\.delivered === false/);
    expect(LOGIN).toMatch(/setWaDeliveryFailed\(/);
  });

  it('replaces the "we sent a code" line rather than contradicting it', () => {
    // Showing "we sent a code on WhatsApp" above "could not send over WhatsApp"
    // is worse than either alone.
    expect(LOGIN).toMatch(/waDeliveryFailed[\s\S]{0,200}لم نتمكن من إرسال الرمز عبر واتساب/);
  });

  it('clears the flag when a retry starts', () => {
    // Otherwise a later successful send still shows the old failure.
    expect(LOGIN).toMatch(/setWaDeliveryFailed\(false\)/);
  });

  it('still advances to the code step, where the SMS link lives', () => {
    // The error line and the SMS fallback button both render on the code step.
    // Staying on the phone field would hide the message AND the way out.
    const send = LOGIN.slice(LOGIN.indexOf('const handleWaSend'));
    const body = send.slice(0, send.indexOf('const handleWaVerify'));
    expect(body).toMatch(/setWaSent\(true\)/);
  });
});

// The override the runbook tells you to reach for has to actually arrive.
//
// `postOtpToRelay` reads `process.env.N8N_OTP_WEBHOOK_URL` and falls back to a
// hardcoded `OTP_RELAY_URL`. The deploy workflow writes functions/.env on the
// CI runner, and it wrote N8N_WEBHOOK_URL / N8N_API_KEY / N8N_BASE_URL — but
// not N8N_OTP_WEBHOOK_URL. So setting that repo secret to repoint OTP at a new
// n8n workspace was a no-op: the constant won, every time, silently.
//
// This asserts the invariant rather than the one variable — any future
// `process.env.N8N_*` read in index.js must be written by the workflow too.
describe('every N8N_* var the functions read is written by the deploy workflow', () => {
  const WORKFLOW = fs.readFileSync(
    path.join(__dirname, '..', '.github', 'workflows', 'firebase-deploy.yml'), 'utf8');

  it('writes each one into functions/.env', () => {
    const read = [...new Set(
      [...INDEX.matchAll(/process\.env\.(N8N_[A-Z0-9_]+)/g)].map((m) => m[1]),
    )];
    // Guard the guard: if the reads ever stop matching, this test proves nothing.
    expect(read).toContain('N8N_OTP_WEBHOOK_URL');
    for (const name of read) {
      expect(WORKFLOW).toMatch(new RegExp(`printf '${name}=`));
      expect(WORKFLOW).toMatch(new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
    }
  });
});
