# Global Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every customer message in the recipient's own language, and revive the branded email that has been rendered and discarded on every send since 2026-07-29.

**Architecture:** A pure bilingual `messageCopy.js` becomes the single source of product copy. `notify()` resolves the recipient's language from the user document it already loads, then renders the in-app text, the email, **and** the WhatsApp text server-side. The n8n Build Messages node stops deciding anything and forwards what it is given, keeping its current rendering only as a fallback.

**Tech Stack:** Firebase Cloud Functions v1 (CommonJS, firebase-functions v4), React 19 + TypeScript, Vitest (`environment: 'node'`), n8n Cloud.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-02-global-language-design.md`. Read it before Task 1.
- **The n8n contract is 20 events.** `CHANNEL_POLICY` in `functions/notify.js` has exactly 20 keys and the live workflow silently drops anything else. **Do not add an event.**
- **Arabic is the default and the fallback.** `'en'` only when the user document explicitly says so. Missing document, missing field, junk value, non-string → `'ar'`.
- **The node keeps its fallback.** If `email_content` or `wa_text` is absent, it renders locally exactly as today. This is not optional — it is what stops a bad server deploy sending blank messages.
- **`notify()` must remain non-throwing.** It is called from money paths (`paymentDefaultEnforcer`, settlement) where a throw stops the caller.
- **Vitest is `environment: 'node'`** — no jsdom, no `@testing-library`. Components cannot be rendered. Put logic in pure modules and test that; use source-text assertions for wiring (`functions/secondChanceCallable.test.js`, `src/components/sellerReviewSeeding.test.ts`).
- **`npm run lint` is `tsc --noEmit`**, currently exit 0 with no output. It is WEAK for `.tsx` — `@types/react` is absent and `tsconfig` sets no `strict`, so `useApp()` is `any` and call-site mistakes compile silently. Rely on tests.
- **Do not use fixed-character windows or guessed byte regions in tests.** That mistake appeared in five briefs on this project and one "fix" for it was itself formatting-coupled. Anchor on real syntax; a slice that can't find its anchor must throw, not return an empty haystack.
- **Never push to main.** Branch → PR → squash-merge. Merging to main IS the deploy.
- Baseline: `npx vitest run` → **1927 passing / 137 files**.

---

## File Structure

| File | Responsibility |
|---|---|
| `functions/messageCopy.js` **(new)** | Bilingual `copyFor(event, data, lang)` for all 20 events + `resolveLang(user)`. Pure. |
| `functions/messageCopy.test.js` **(new)** | Every event in both languages, every sub-branch, `resolveLang` edges, and a completeness guard against `CHANNEL_POLICY`. |
| `functions/notify.js` | Re-export `copyFor` from `messageCopy`; `CHANNEL_POLICY` stays. |
| `functions/emailCopy.js` | `emailFor(event, data, lang)`. |
| `functions/index.js` | `notify()` resolves `lang` once and renders all three surfaces with it; adds `wa_text` to the payload. |
| `n8n/build-messages.js` | Forwarder with fallback. |
| `functions/notifyCopyParity.test.js` | Rewritten against `messageCopy`, **extended** to assert the node consumes `email_content` and `wa_text`. |
| `src/context/AppContext.tsx` | `setLanguage` persists to `users/{uid}.language`. |

---

### Task 1: Bilingual copy and language resolution

**Files:**
- Create: `functions/messageCopy.js`, `functions/messageCopy.test.js`
- Modify: `functions/notify.js` (re-export)

**Interfaces:**
- Produces: `copyFor(event, data, lang)` → `{ type, title, description }`; `resolveLang(user)` → `'ar' | 'en'`; `SUPPORTED_LANGS`.
- Consumed by: Task 3 (`notify()`), Task 4 (the parity guard).

**About the English copy.** The Arabic below is the current production wording, copied verbatim from `functions/notify.js` — do not reword it. The English is **new content you must write**, matched to the Arabic in meaning and register: short, direct, no marketing voice. Four worked examples are given to fix the tone; write the remaining sixteen in the same register. The completeness test in Step 1 fails until all twenty exist in both languages, so this cannot be half-done.

- [ ] **Step 1: Write the failing test**

```js
// functions/messageCopy.test.js
// One source of product copy, in both languages.
//
// This existed only in Arabic, in two places: functions/notify.js and a
// hand-mirrored copy inside the n8n Build Messages node. The duplication is
// what let the branded email layer ship dead on 2026-07-29 and stay dead —
// nothing compared what the server rendered to what the node actually sent.
import { describe, it, expect } from 'vitest';
const { copyFor, resolveLang, SUPPORTED_LANGS } = require('./messageCopy.js');
const { CHANNEL_POLICY } = require('./notify.js');

const EVENTS = Object.keys(CHANNEL_POLICY);

describe('completeness — no event may ship half-translated', () => {
  it('covers exactly the events the n8n contract routes', () => {
    // 20 keys. The live workflow silently drops anything else, so an event
    // here that is not in CHANNEL_POLICY is copy that can never be delivered.
    expect(EVENTS).toHaveLength(20);
  });

  it('returns a non-empty title and description for every event, in BOTH languages', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const event of EVENTS) {
        const c = copyFor(event, { auctionTitle: 'X', totalDue: 10 }, lang);
        expect(c.title.trim().length, `${event}/${lang} title`).toBeGreaterThan(0);
        expect(c.description.trim().length, `${event}/${lang} description`).toBeGreaterThan(0);
      }
    }
  });

  it('never returns Arabic text when English was asked for', () => {
    // The failure this catches is a missing English entry silently falling
    // through to the Arabic map.
    const ARABIC = /[؀-ۿ]/;
    for (const event of EVENTS) {
      const c = copyFor(event, { auctionTitle: 'Rolex', totalDue: 10, reason: 'x' }, 'en');
      expect(ARABIC.test(c.title), `${event} title leaked Arabic`).toBe(false);
    }
  });

  it('keeps the same `type` in both languages — it drives the in-app icon', () => {
    for (const event of EVENTS) {
      expect(copyFor(event, {}, 'en').type, event).toBe(copyFor(event, {}, 'ar').type);
    }
  });
});

describe('sub-branches exist in both languages', () => {
  const bothLangs = (event, data, probe) => {
    for (const lang of SUPPORTED_LANGS) {
      const c = copyFor(event, data, lang);
      expect(c.description.trim().length, `${event}/${lang}`).toBeGreaterThan(0);
      if (probe) probe(c, lang);
    }
  };

  it('account_banned has all three reasons', () => {
    const seen = new Set();
    for (const reason of ['payment_default_repeat', 'payment_default', 'admin_ban']) {
      bothLangs('account_banned', { reason }, (c, lang) => seen.add(`${lang}:${c.description}`));
    }
    // Three distinct messages per language, not one repeated.
    expect(seen.size).toBe(6);
  });

  it('return_resolved differs between refunded and not', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'refunded' }, lang);
      const b = copyFor('return_resolved', { auctionTitle: 'X', outcome: 'rejected' }, lang);
      expect(a.description, lang).not.toBe(b.description);
    }
  });

  it('below_reserve_offer has all three second-chance shapes', () => {
    for (const lang of SUPPORTED_LANGS) {
      const plain = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10 }, lang);
      const seller = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: 'pending_seller' }, lang);
      const buyer = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: 'pending_buyer' }, lang);
      expect(new Set([plain.description, seller.description, buyer.description]).size, lang).toBe(3);
    }
  });

  it('a second-chance recipient is never told their bids fell short', () => {
    // The whole reason this event branches. Arabic: «لم تبلغ المزايدات».
    for (const status of ['pending_seller', 'pending_buyer']) {
      const ar = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: status }, 'ar');
      expect(ar.description).not.toMatch(/لم تبلغ المزايدات/);
      const en = copyFor('below_reserve_offer', { auctionTitle: 'X', topBid: 10, secondChance: true, offerStatus: status }, 'en');
      expect(en.description.toLowerCase()).not.toMatch(/did not (reach|meet)/);
    }
  });

  it('below_reserve_declined distinguishes a buyer decline on a second chance', () => {
    for (const lang of SUPPORTED_LANGS) {
      const a = copyFor('below_reserve_declined', { auctionTitle: 'X', secondChance: true, declinedBy: 'buyer' }, lang);
      const b = copyFor('below_reserve_declined', { auctionTitle: 'X' }, lang);
      expect(a.description, lang).not.toBe(b.description);
    }
  });
});

describe('an unknown event falls back safely, in the asked-for language', () => {
  it('never throws and never returns an empty title', () => {
    for (const lang of SUPPORTED_LANGS) {
      const c = copyFor('never_heard_of_it', {}, lang);
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.type).toBe('info');
    }
  });

  it('an unknown LANGUAGE falls back to Arabic rather than breaking', () => {
    const c = copyFor('auction_won', { auctionTitle: 'X' }, 'fr');
    expect(c.description).toBe(copyFor('auction_won', { auctionTitle: 'X' }, 'ar').description);
  });
});

describe('resolveLang', () => {
  it("returns 'en' only when the user doc explicitly says so", () => {
    expect(resolveLang({ language: 'en' })).toBe('en');
  });

  it("returns 'ar' for everything else", () => {
    // Arabic is the market default and the safe direction: nobody receives a
    // language they cannot read by accident.
    for (const user of [
      { language: 'ar' }, {}, null, undefined, { language: '' },
      { language: 'EN' }, { language: 'fr' }, { language: 5 }, { language: {} },
    ]) {
      expect(resolveLang(user), JSON.stringify(user)).toBe('ar');
    }
  });

  it('never throws', () => {
    for (const bad of [null, undefined, 0, '', [], 'string']) {
      expect(() => resolveLang(bad)).not.toThrow();
    }
  });
});

describe('SUPPORTED_LANGS', () => {
  it('is exactly ar and en, frozen', () => {
    expect([...SUPPORTED_LANGS].sort()).toEqual(['ar', 'en']);
    expect(Object.isFrozen(SUPPORTED_LANGS)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run functions/messageCopy.test.js`
Expected: FAIL — cannot resolve `./messageCopy.js`.

- [ ] **Step 3: Write the implementation**

Create `functions/messageCopy.js`. Move the Arabic map **verbatim** from `functions/notify.js:40–83` (do not reword it — it is live production copy), restructure it per language, and write the English.

```js
// The single source of customer-facing product copy, in both languages.
//
// This lived only in Arabic and in TWO places: functions/notify.js and a
// hand-mirrored copy inside the n8n Build Messages node. That duplication is
// why the branded email layer could ship on 2026-07-29 and be dead on arrival
// for four days — the parity guard compared the two copyFor implementations,
// which were both correct, while nothing compared emailFor to what the node
// actually sent.
//
// Pure: no Firestore, no network, no Date.now(). Every branch is testable.

const SUPPORTED_LANGS = Object.freeze(['ar', 'en']);

/**
 * Which language to write for. Arabic unless the user document explicitly says
 * English — missing doc, missing field, junk and non-strings all mean Arabic.
 * Never throws.
 */
function resolveLang(user) {
  const v = user && typeof user === 'object' ? user.language : null;
  return v === 'en' ? 'en' : 'ar';
}

function build(lang, data) {
  const d = data || {};
  const t = d.auctionTitle || d.orderId || '';
  const sc = d.secondChance === true;

  if (lang === 'en') {
    return {
      auction_won: { type: 'win', title: 'You won the auction 🎉', description: `Congratulations — you won "${t}". Amount due ${d.totalDue || ''} JOD.` },
      payment_due: { type: 'order', title: 'Payment due', description: `Please pay for "${t}" within ${d.paymentHours || 24} hours.` },
      payment_reminder: { type: 'order', title: 'Payment reminder', description: `"${t}" is still awaiting payment. Please pay before the window closes.` },
      // …write the remaining seventeen here, in this register: short, direct,
      // no marketing voice, mirroring the Arabic in meaning. The completeness
      // test fails until every event and every sub-branch exists.
    };
  }

  return {
    auction_won: { type: 'win', title: 'فزت بالمزاد 🎉', description: `مبروك! ربحت "${t}". المبلغ المستحق ${d.totalDue || ''} د.أ.` },
    payment_due: { type: 'order', title: 'دفعة مستحقة', description: `يرجى دفع "${t}" خلال ${d.paymentHours || 24} ساعة.` },
    // …the rest, verbatim from functions/notify.js:50–81.
  };
}

const FALLBACK = {
  ar: { type: 'info', title: 'تنبيه', description: 'لديك تحديث جديد.' },
  en: { type: 'info', title: 'Notification', description: 'You have an update.' },
};

function copyFor(event, data = {}, lang = 'ar') {
  const l = SUPPORTED_LANGS.includes(lang) ? lang : 'ar';
  const map = build(l, data);
  return map[event] || FALLBACK[l];
}

module.exports = { copyFor, resolveLang, SUPPORTED_LANGS };
```

**Note on the current Arabic fallback:** `notify.js` returns `description: ''` for an unknown event. The test above requires a non-empty description, because an in-app notification with an empty body is filtered out by `NotificationCenter.tsx:169` and vanishes. Giving it real text is a deliberate, small improvement — record it in your report.

- [ ] **Step 4: Re-export from `notify.js`**

Replace `notify.js`'s `copyFor` with a re-export so there is one implementation. `CHANNEL_POLICY` and `channelsFor` stay where they are — `messageCopy.js` must not import from `notify.js` (the test imports both; a cycle would break it).

```js
const { copyFor } = require('./messageCopy');
// …
module.exports = { CHANNEL_POLICY, channelsFor, copyFor, /* existing exports */ };
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run functions/messageCopy.test.js && npx vitest run functions/notifyCopyParity.test.js`
Expected: the new file passes; the parity guard still passes because the Arabic is byte-identical.

- [ ] **Step 6: Verify with mutants**

| mutant | expected |
|---|---|
| delete one English event entry | FAIL (completeness) |
| make the English map return the Arabic one | FAIL (Arabic-leak) |
| `resolveLang` returns `'en'` for `'EN'` | FAIL |
| `resolveLang` returns `'en'` when the field is missing | FAIL |
| collapse `account_banned`'s three reasons to one | FAIL |
| second-chance branch removed from `below_reserve_offer` | FAIL |
| `copyFor` ignores `lang` and always returns Arabic | FAIL |

- [ ] **Step 7: Commit**

```bash
git add functions/messageCopy.js functions/messageCopy.test.js functions/notify.js
git commit -m "feat(copy): one bilingual source for customer messaging"
```

---

### Task 2: Bilingual email

**Files:**
- Modify: `functions/emailCopy.js`, `functions/emailCopy.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 — `emailCopy.js` owns its own richer copy (subject, preheader, heading, intro, detail rows, CTA).
- Produces: `emailFor(event, data, lang)` → the existing shape, in the requested language.

- [ ] **Step 1: Write the failing test**

Append to `functions/emailCopy.test.js`:

```js
describe('emailFor — both languages', () => {
  const EMAIL_EVENTS = [
    'auction_won', 'payment_due', 'payment_reminder', 'below_reserve_offer',
    'below_reserve_seller_accepted', 'order_preparing', 'order_shipped',
    'order_delivered', 'order_completed', 'order_refunded', 'membership_rejected',
    'order_payment_rejected', 'account_banned', 'ban_lifted', 'return_requested',
    'return_resolved',
  ];
  const ARABIC = /[؀-ۿ]/;

  it('gives every email-enabled event a subject, heading and body in English', () => {
    for (const ev of EMAIL_EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, 'en');
      expect(e.subject.trim().length, ev).toBeGreaterThan(0);
      expect(e.heading.trim().length, ev).toBeGreaterThan(0);
      expect(e.intro.trim().length, ev).toBeGreaterThan(0);
    }
  });

  it('does not leak Arabic into an English subject or heading', () => {
    for (const ev of EMAIL_EVENTS) {
      const e = emailFor(ev, { auctionTitle: 'Rolex', orderId: 'o1' }, 'en');
      expect(ARABIC.test(e.subject), `${ev} subject`).toBe(false);
      expect(ARABIC.test(e.heading), `${ev} heading`).toBe(false);
    }
  });

  it('defaults to Arabic when no language is given — every existing caller', () => {
    const a = emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' });
    const b = emailFor('payment_due', { auctionTitle: 'ساعة', orderId: 'o1' }, 'ar');
    expect(a).toEqual(b);
  });

  it('never leaks an empty detail row in either language', () => {
    for (const lang of ['ar', 'en']) {
      for (const ev of EMAIL_EVENTS) {
        for (const row of emailFor(ev, { auctionTitle: 'X' }, lang).details) {
          expect(String(row.value).trim().length, `${ev}/${lang}/${row.label}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('branches second chance in English too', () => {
    const e = emailFor('below_reserve_offer', { auctionTitle: 'Rolex', auctionId: 'a1', secondChance: true, offerStatus: 'pending_buyer' }, 'en');
    expect(e.intro.toLowerCase()).not.toMatch(/did not (reach|meet)/);
    expect(e.cta.url).toBe('https://www.mazad-jo.com/auction/a1');
  });

  it('keeps the legal identity untranslated — a registered name is not translated', () => {
    expect(BRAND.legalName).toContain('Al Hani');
    expect(BRAND.registration).toBe('200213982');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run functions/emailCopy.test.js`
Expected: FAIL — English subjects come back Arabic.

- [ ] **Step 3: Implement**

Give `emailFor` a third parameter `lang = 'ar'`. Split `CONTENT`, `secondChanceContent`, `FALLBACK` and the `detailRows` labels by language, the same shape as Task 1. `formatJod`'s `د.أ` suffix becomes `JOD` in English; `formatDeadline` keeps `Asia/Amman` but takes an `en-US` locale when English. `BRAND`'s legal identity (name, registration, address) stays as-is — only its **labels** translate.

- [ ] **Step 4: Run tests**

Run: `npx vitest run functions/emailCopy.test.js`
Expected: PASS.

- [ ] **Step 5: Verify with mutants**

| mutant | expected |
|---|---|
| English `CONTENT` falls through to Arabic | FAIL |
| `lang` defaulted to `'en'` instead of `'ar'` | FAIL (the existing-caller test) |
| `formatJod` keeps `د.أ` in English | FAIL if asserted; add the assertion if it does not already |
| second-chance English branch removed | FAIL |

- [ ] **Step 6: Commit**

```bash
git add functions/emailCopy.js functions/emailCopy.test.js
git commit -m "feat(email): bilingual email content"
```

---

### Task 3: `notify()` resolves the language and renders all three surfaces

**Files:**
- Modify: `functions/index.js`
- Test: `functions/notifyLanguage.test.js` **(new)**

**Interfaces:**
- Consumes: `copyFor(event, data, lang)`, `resolveLang(user)` (Task 1); `emailFor(event, data, lang)` (Task 2).
- Produces: a payload carrying `wa_text` alongside the existing `email_content`.

- [ ] **Step 1: Write the failing test**

```js
// functions/notifyLanguage.test.js
// notify() cannot be imported (index.js initialises firebase-admin at module
// load), so the wiring is asserted against the source — the house idiom, see
// functions/secondChanceCallable.test.js. Anchored on real syntax, never on a
// character count: five briefs on this project shipped fixed-width windows and
// every one of them was wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

function notifyBody() {
  const start = SRC.indexOf('async function notify({');
  if (start === -1) throw new Error('notify() not found — anchor moved');
  const end = SRC.indexOf('\n}', start);
  if (end === -1) throw new Error('notify() end not found — anchor moved');
  return SRC.slice(start, end + 2);
}

describe('notify() sends in the recipient language', () => {
  const body = notifyBody();

  it('resolves the language from the user doc it already loaded', () => {
    // The doc is already fetched for phone/email/name, so this costs no extra read.
    expect(body).toMatch(/resolveLang\(user\)/);
  });

  it('resolves it AFTER the user lookup, not before', () => {
    expect(body.indexOf('resolveLang(user)')).toBeGreaterThan(body.indexOf("collection('users')"));
  });

  it('passes the language to the in-app copy', () => {
    expect(body).toMatch(/copyFor\(event,\s*d,\s*lang\)/);
  });

  it('passes the language to the email renderer', () => {
    expect(body).toMatch(/emailFor\(event,\s*\{[^}]*\},\s*lang\)/);
  });

  it('sends wa_text so the n8n node does not have to render it', () => {
    expect(body).toMatch(/wa_text:/);
  });

  it('still sends email_content — the node prefers it', () => {
    expect(body).toMatch(/email_content:/);
  });

  it('gates wa_text on the whatsapp channel, as email_content is gated on email', () => {
    expect(body).toMatch(/channels\.whatsapp\s*\?\s*\{\s*wa_text/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run functions/notifyLanguage.test.js`
Expected: FAIL — no `resolveLang`.

- [ ] **Step 3: Implement**

In `functions/index.js`, add `resolveLang` to the `messageCopy` require. Inside `notify()`, immediately after the user lookup block:

```js
  // The user doc is already loaded above for phone/email/name, so reading the
  // language preference off it costs no extra Firestore read.
  const lang = resolveLang(user);
```

Then thread it through: `copyFor(event, d, lang)` for the in-app write, `emailFor(event, {...}, lang)` for `email_content`, and add the WhatsApp text beside it:

```js
      ...(channels.whatsapp ? { wa_text: (() => {
        const c = copyFor(event, d, lang);
        return c.description ? `${c.title}\n${c.description}` : c.title;
      })() } : {}),
```

That string shape (`title\ndescription`, title alone when there is no description) is exactly what the node produces today — keep it, so the fallback and the server render identically.

- [ ] **Step 4: Run tests and the syntax check**

Run: `npx vitest run functions/notifyLanguage.test.js && node --check functions/index.js`
Expected: PASS, syntax OK.

- [ ] **Step 5: Verify with mutants**

| mutant | expected |
|---|---|
| `resolveLang(user)` → hard-coded `'ar'` | FAIL |
| `copyFor(event, d)` — language dropped from the in-app write | FAIL |
| `emailFor(event, {...})` — language dropped | FAIL |
| `wa_text` removed | FAIL |
| `wa_text` sent unconditionally, not gated on the channel | FAIL |
| `resolveLang` called before the user lookup | FAIL |

- [ ] **Step 6: Commit**

```bash
git add functions/index.js functions/notifyLanguage.test.js
git commit -m "feat(notify): render every surface in the recipient's language"
```

---

### Task 4: The n8n node becomes a forwarder

**Files:**
- Modify: `n8n/build-messages.js`, `functions/notifyCopyParity.test.js`, `n8n/README.md`

**Interfaces:**
- Consumes: the payload from Task 3 (`email_content`, `wa_text`).

- [ ] **Step 1: Write the failing test**

Append to `functions/notifyCopyParity.test.js`:

```js
describe('the node forwards what the server rendered', () => {
  // This is the assertion whose absence let emailFor ship dead on 2026-07-29
  // and stay dead for four days. The existing guard compares the two copyFor
  // implementations — both of which were correct. Nothing checked whether the
  // node read what the server sent.
  it('prefers the server-rendered email over its own', () => {
    expect(n8nSrc).toMatch(/email_content/);
  });

  it('prefers the server-rendered WhatsApp text over its own', () => {
    expect(n8nSrc).toMatch(/wa_text/);
  });

  it('KEEPS a local fallback for both — a bad server render must not send blanks', () => {
    expect(n8nSrc).toMatch(/buildHtml\(/);
    expect(n8nSrc).toMatch(/function copyFor/);
  });

  it('reads the server value before falling back, not after', () => {
    const wa = n8nSrc.indexOf('wa_text');
    const local = n8nSrc.indexOf('const waText');
    expect(wa).toBeGreaterThan(-1);
    expect(local).toBeGreaterThan(-1);
    expect(wa).toBeLessThan(local + 200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run functions/notifyCopyParity.test.js`
Expected: FAIL — `email_content` appears nowhere in `build-messages.js`.

- [ ] **Step 3: Implement the forwarder**

In `n8n/build-messages.js`, keep `copyFor` and `buildHtml` exactly as they are — they are now the fallback, and the parity guard still holds them to the repo's Arabic. Change only what is emitted:

```js
  const ec = b.email_content || null;
  const waText = b.wa_text || (c.description ? `${c.title}\n${c.description}` : c.title);
```

and in the pushed object:

```js
      waText,
      subject: ec ? ec.subject : c.title,
      html: ec ? buildHtmlFromContent(ec, name) : buildHtml(c, name),
```

`buildHtmlFromContent` renders the server's structured content — heading, intro, the detail rows, the CTA and the BRAND footer. Write it in the same table-based, inline-styled shape as `buildHtml` so it renders identically in Gmail, Outlook and Apple Mail without a fetch.

- [ ] **Step 4: Update `n8n/README.md`**

Record that the node is now a forwarder, that `copyFor`/`buildHtml` remain only as the fallback, and that **this paste is the last one needed for copy changes**.

- [ ] **Step 5: Run tests**

Run: `npx vitest run functions/notifyCopyParity.test.js`
Expected: PASS.

- [ ] **Step 6: Verify with mutants**

| mutant | expected |
|---|---|
| `email_content` ignored, always local `buildHtml` | FAIL |
| `wa_text` ignored | FAIL |
| the fallback deleted (`b.email_content` used unguarded) | FAIL |
| `copyFor` deleted from the node | FAIL |

- [ ] **Step 7: Commit**

```bash
git add n8n/build-messages.js n8n/README.md functions/notifyCopyParity.test.js
git commit -m "feat(n8n): forward the server-rendered message; keep local render as fallback"
```

---

### Task 5: Persist the preference, docs, and the PR

**Files:**
- Modify: `src/context/AppContext.tsx`, `docs/BACKLOG.md`
- Test: `src/context/languagePersistence.wiring.test.ts` **(new)**

- [ ] **Step 1: Write the failing test**

```ts
// src/context/languagePersistence.wiring.test.ts
// The toggle wrote only to localStorage, so the server could never know what a
// recipient reads. Source-text: vitest here is environment: 'node' and the
// provider cannot be rendered.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AppContext.tsx', import.meta.url), 'utf8');

function setLanguageBody() {
  const start = SRC.indexOf('const setLanguage = useCallback(');
  if (start === -1) throw new Error('setLanguage not found — anchor moved');
  const end = SRC.indexOf('\n  }, [', start);
  if (end === -1) throw new Error('setLanguage end not found — anchor moved');
  return SRC.slice(start, end);
}

describe('setLanguage persists the preference', () => {
  const body = setLanguageBody();

  it('still writes localStorage, so a signed-out visitor keeps their choice', () => {
    expect(body).toMatch(/localStorage\.setItem\('mazad_language'/);
  });

  it('writes the language onto the user document', () => {
    expect(body).toMatch(/language:\s*lang/);
  });

  it('only writes when there is a signed-in user', () => {
    expect(body).toMatch(/currentUser/);
  });

  it('never lets a failed write break the toggle', () => {
    // The UI language must change even if Firestore is unreachable.
    expect(body).toMatch(/catch/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/context/languagePersistence.wiring.test.ts`
Expected: FAIL — no `language: lang`.

- [ ] **Step 3: Implement**

In `setLanguage` (`AppContext.tsx:2327`), after the existing `localStorage.setItem`:

```tsx
    // The server needs this to pick a language for WhatsApp and email; notify()
    // already loads the user doc, so reading it there costs nothing. Non-fatal:
    // the UI must switch even if the write fails, and the next toggle retries.
    if (currentUser?.id) {
      updateDoc(doc(db, 'users', currentUser.id), { language: lang })
        .catch((e) => console.warn('[setLanguage] preference not persisted:', e));
    }
```

Add `currentUser?.id` to the `useCallback` dependency array.

**No rules change is needed — verified 2026-08-02.** `match /users/{userId}`'s `allow update` (`firestore.rules:61`) gates a self-write with a **denylist**, not an allowlist: `!...affectedKeys().hasAny(['role','isAdmin','isBlocked','isVerified','isSeller','wonCount'])`, plus the email-claim clause and `!touchesSubscriptionGrantFields()`. `language` is in none of those, so an owner may already write it. Do **not** add a rules change; if you find otherwise, stop and report rather than widening the rule.

- [ ] **Step 4: Run tests, build, lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all pass; `tsc --noEmit` exit 0 with no output.

- [ ] **Step 5: Verify with mutants**

| mutant | expected |
|---|---|
| the `updateDoc` removed | FAIL |
| written unconditionally, with no signed-in check | FAIL |
| the `.catch` removed | FAIL |
| `localStorage.setItem` removed | FAIL |

- [ ] **Step 6: Update `docs/BACKLOG.md`**

Record: customer messaging is bilingual and driven by `users/{uid}.language`; Arabic is the default and fallback; the n8n node is now a forwarder and **the paste that ships this is the last one needed for copy changes**; and that `emailCopy.js` was dead from 2026-07-29 until this shipped.

- [ ] **Step 7: Full verification — paste the REAL output into the PR**

```bash
npx vitest run
npm run build
npm run lint
node --check functions/index.js
```

- [ ] **Step 8: Open the PR (do NOT merge)**

The body must carry the four outputs, the mutant tables, and this deploy sequence:

1. **Merge** — that deploys Functions.
2. **Then paste `n8n/build-messages.js` into the Build Messages node and Publish.** Until that happens the node ignores `email_content`/`wa_text` and renders locally — which is exactly today's behaviour, so **the order is safe either way**: nothing breaks if the paste is late, it simply stays Arabic-only with the old email shell.
3. **Verify** by triggering one email-enabled event and confirming the received email carries the Al Hani footer, the amount and the `MZ-` order reference.

- [ ] **Step 9: MJ reads the English**

The English copy is new and unreviewed. The tests prove every string exists and is non-empty; they cannot prove it reads well to a customer. MJ should read the twenty English strings before they reach anyone.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Bilingual `copyFor` for all 20 events | 1 |
| `resolveLang`, Arabic default | 1 |
| Sub-branches mirrored in both languages | 1 |
| `emailFor(event, data, lang)` | 2 |
| Legal identity untranslated | 2 |
| `notify()` resolves lang once, renders all three | 3 |
| `wa_text` on the payload | 3 |
| Node forwards, keeps fallback | 4 |
| Parity guard extended to catch this class | 4 |
| Client persists to `users/{uid}.language` | 5 |
| Non-fatal write | 5 |
| In-app written in the recipient's language at send time | 3 (no schema change) |
| No new n8n event | 1 (completeness test pins 20) |
| No backfill | — (out of scope, stated) |

**Notes for the implementer**

- Tasks 1 and 2 are pure and independently reviewable. Task 4 touches no file Tasks 1–3 touch.
- **Locate anchors by content, never by line number.** The numbers here are from 2026-08-02 and drift; six briefs on this project have been bitten by stale references or fixed-width windows.
- The riskiest step is Task 4's `buildHtmlFromContent` — it is the only new rendering, and it cannot be tested against a real mail client from here. Keep it structurally identical to `buildHtml`.
- Do not add an event to `CHANNEL_POLICY`. The live workflow routes a fixed 20 and silently drops the rest.
