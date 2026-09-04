'use strict';

/**
 * The WhatsApp OTP message, owned by this repo.
 *
 * WHY THIS FILE EXISTS
 *
 * Until now the OTP wording lived only inside the n8n Cloud workflow's Send OTP
 * node: `postOtpToRelay` posted `{ phone, code }` and n8n composed the sentence.
 * That put the single most-read message the product sends — every sign-in, every
 * registration — in the one place with no tests, no brand guard, no code review
 * and no git history.
 *
 * What that cost: the live message read «رمز الدخول إلى مزاد جو», naming a brand
 * that was retired and is not allowed to appear. Nothing could have caught it.
 * src/constants/brand.ts says of itself that "every surface reads it from this
 * constant" — n8n was a surface that could not.
 *
 * This follows the precedent the notification pipe already set: Cloud Functions
 * render the string, n8n forwards it. n8n/README.md states the rule outright —
 * "Copy is owned by the repo. The node is a forwarder… It decides no wording."
 *
 * PURE on purpose: node built-ins only, no firebase, no network, no Date.now(),
 * so root Vitest loads it and every branch is testable — same contract as
 * whatsappOtp.js and messageCopy.js.
 */

const { OTP_TTL_MS } = require('./whatsappOtp');

/**
 * The brand, mirrored from src/constants/brand.ts.
 *
 * Functions cannot import from src/ (CommonJS here, TypeScript ESM there and no
 * build step across the boundary), so the value is repeated on purpose — the
 * same pattern emailCopy.js uses for the support phone. brandParity.test.ts
 * reads BOTH files as text and fails if they ever disagree, so this copy cannot
 * drift away from the constant the way the n8n wording did.
 *
 * Follows src/constants/brand.ts. Change it THERE first.
 */
const BRAND_AR = 'مزادو';
const BRAND_EN = 'Mazzado';

/**
 * Arabic is the market default and the safe direction, exactly as
 * messageCopy.js resolveLang() and emailCopy.js normalizeLang() have it:
 * undefined, junk, a non-string and an unsupported language all mean Arabic.
 */
function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'ar';
}

/**
 * Arabic counts the noun differently at 1, 2, 3-10 and above, so a bare
 * `${n} دقائق` is wrong for every value except the 3-10 band.
 *
 * The TTL is 10 minutes today, which lands in that band — but the whole point of
 * deriving the number from OTP_TTL_MS is that changing the constant must not
 * quietly produce «صالح لـ1 دقائق» in the most-read message the product sends.
 */
function arabicMinutes(n) {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتين';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

/**
 * The verification message, ready for the relay to forward verbatim.
 *
 * The validity is DERIVED from OTP_TTL_MS rather than written out. The n8n text
 * hardcoded "10 دقائق" next to a constant it could not see; the two happened to
 * agree, but nothing held them together.
 *
 * @param {string} code  the OTP, already generated
 * @param {'ar'|'en'} [lang='ar']
 * @returns {string}
 */
function otpMessage(code, lang = 'ar') {
  const l = normalizeLang(lang);
  const c = String(code == null ? '' : code);
  const minutes = Math.round(OTP_TTL_MS / 60000);

  if (l === 'en') {
    return `${BRAND_EN} verification code: ${c}\n`
      + `Valid for ${minutes} minute${minutes === 1 ? '' : 's'}. Do not share it with anyone.`;
  }
  return `رمز تحقق ${BRAND_AR}: ${c}\n`
    + `صالح لـ${arabicMinutes(minutes)}. لا تشاركه مع أي أحد.`;
}

module.exports = { otpMessage, normalizeLang, arabicMinutes, BRAND_AR, BRAND_EN };
