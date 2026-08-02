# Global Language for Customer Messaging (Design Spec)

**Date:** 2026-08-02 · **Status:** LOCKED with MJ.

## Why

MJ asked for "global language setting across all customer touchpoints including whatsapp and email." Investigating it surfaced two problems, and the second is worse than the first.

### 1. The server cannot know anyone's language

Language lives in `localStorage` only (`mazad_language`, `AppContext.tsx:781`). It is never written to the user document, so `notify()` has no way to know what a recipient reads. Every WhatsApp and every email is Arabic, because Arabic is the only copy that exists — `functions/notify.js`'s `copyFor()` has no English variants at all.

### 2. The branded email layer has been dead since the day it shipped

`functions/index.js:147` renders `email_content` via `emailFor()` on every email-enabled notification. **Nothing consumes it.** `n8n/build-messages.js` — the live Build Messages node — has **never** referenced `email_content` in any commit of its history (`git log -S` returns empty). It builds its own `subject` and `html` from its own `copyFor`, and that is what Resend sends.

So everything in `emailCopy.js` — the branded shell, the Al Hani footer with registration 200213982, the amount, the deadline, the `MZ-` order reference, the deep link, and the second-chance branching — is computed and discarded on every send. Shipped `fad74be` (2026-07-29); dead ever since. Confirmed against a real received email: greeting, bare title and description, «افتح التطبيق», and «هذه رسالة آلية من مزاد جو» as the entire footer.

**Correction to the record.** During the Second Chance work this was reported as *"Email is already correct; WhatsApp is not until the node is re-pasted."* That was wrong in both directions. The email **wording** comes from the node's `copyFor` — the same function as WhatsApp — so it depended on that paste exactly as much. The email **branding** comes from `emailCopy.js`, which nothing reads, so the paste could not fix it and did not.

Current state:

| | works | rendered by |
|---|---|---|
| Email wording | yes | the n8n node's `copyFor` |
| WhatsApp wording | yes | the n8n node's `copyFor` |
| Email branding, footer, amount, deadline, order ref | **dead** | `emailCopy.js`, unread |

### The shared cause

The n8n node holds a second copy of the product's messaging, outside the repo, editable only by hand. That is what let a whole feature ship dead for four days unnoticed, and it is why "re-paste the Build Messages node" keeps appearing as a manual deploy step.

## Decisions taken with MJ (2026-08-02)

1. **The server renders everything; n8n forwards.** Both the email and the WhatsApp text are rendered in Cloud Functions and sent on the payload. Chosen over the two smaller options after MJ asked about cost — see below.
2. **Cost is not a factor.** `notify()` already reads the user doc, so language costs **zero** extra Firestore reads. The server already renders `email_content`, so that work exists today. Adding a WhatsApp string is a template literal. n8n Cloud bills per execution, not per node complexity, and execution volume is unchanged. The real cost of the status quo is operational, and it has already been paid: a dead feature and two manual pastes.
3. **Language comes from the app toggle, persisted to `users/{uid}.language`.**
4. **No preference means Arabic.** Nobody receives a language they cannot read by accident, and it matches the market.
5. **The node keeps a fallback.** If `email_content` or `wa_text` is missing, it renders locally as it does today. Without this, "the server renders everything" becomes "a bad deploy sends blank messages."

## Architecture

### `functions/messageCopy.js` (new)

Bilingual `copyFor(event, data, lang)` covering all 20 events in `CHANNEL_POLICY`. Today's Arabic moves here unchanged and gains an English twin. Several events carry sub-branches that must be mirrored in both languages: `account_banned` (three `reason` cases), `return_resolved` (two `outcome` cases), and `below_reserve_offer` / `below_reserve_seller_accepted` (the `secondChance` + `offerStatus` branches).

Pure — no Firestore, no network — so every branch is testable.

`functions/notify.js`'s existing `copyFor` is replaced by a re-export, keeping `CHANNEL_POLICY` where it is. The drift guard that asserts the node mirrors `copyFor` lives at **`functions/notifyCopyParity.test.js`** (not under `n8n/`) and is rewritten against the new source. It is the test that would have caught this class of drift and did not, because it compares `copyFor` to the node's `copyFor` — both of which are correct. Nothing compared `emailFor` to what the node actually sends.

### `functions/emailCopy.js`

`emailFor(event, data, lang)`. The structure already supports this — `CONTENT`, `secondChanceContent`, `BRAND` and `detailRows` each need an English sibling. `BRAND`'s legal identity (registered name, registration number) is stated identically in both languages with only its **labels** translated, since a registered name is not translated.

**Exception, approved 2026-08-02 (Task 2):** the ADDRESS and OPENING HOURS *are* translated, not just labelled. They were originally scoped as identity; they are not. They are wayfinding prose — an English-only reader cannot navigate by Arabic script, and «مقابل حبيبة» / "opposite Habibah" is how Amman addressing genuinely works, so a label alone leaves the value unusable. `BRAND.addressEn` / `BRAND.hoursEn` therefore exist alongside the Arabic. This is a deliberate deviation from "only labels translate", not drift. Related: both languages' hours and address use **Western digits** per `ARABIC_UI_DIGITS`, and `hoursEn` is 24-hour to match every deadline the module renders.

### `notify()` in `functions/index.js`

One change, at the point where the user doc is already in hand:

```
const lang = resolveLang(user);          // 'ar' | 'en', Arabic when unknown
```

Then the in-app write, `email_content` and the new `wa_text` are all rendered with that `lang`. In-app copy is written **in the recipient's language at send time** and stays that way; the schema permits `titleAr`/`titleEn` (`firestore.rules:547`) but `NotificationCenter` reads only `title`, and making that reactive is a separate change for little gain.

`resolveLang` is pure and lives in `messageCopy.js`: `'en'` only when the user doc explicitly says so, `'ar'` otherwise — including missing docs, missing fields and junk values.

### `n8n/build-messages.js`

Becomes a forwarder:

```
subject/html ← body.email_content   (fall back to local buildHtml)
waText       ← body.wa_text         (fall back to local copyFor)
```

Channel gating (`sendWhatsapp`/`sendEmail`) is unchanged — Functions already own the policy and the node only honours it plus a real destination.

**This requires one final manual paste.** After it, copy changes never need another.

### Client

`setLanguage` (`AppContext.tsx:2327`) additionally writes `users/{uid}.language` when signed in. Failure is non-fatal: the toggle must not break because a write failed, and the next toggle retries.

`firestore.rules` already permits a user to update their own document; confirm `language` is not excluded by a field allowlist before relying on it.

## Error handling

- A failed language write leaves the previous preference; the user simply gets their old language until the next toggle.
- `resolveLang` never throws and never returns anything but `'ar'` or `'en'`.
- The node's fallback covers a missing, malformed or partially-rendered payload.
- `notify()` must remain non-throwing, as today.

## Testing

Vitest is `environment: 'node'` — no jsdom.

- `messageCopy.test.js`: every one of the 20 events returns non-empty `title` and `description` in **both** languages; every sub-branch in both; a guard that the event list matches `CHANNEL_POLICY`'s keys exactly, so a new event cannot ship half-translated; `resolveLang` across missing doc, missing field, `'en'`, `'ar'`, junk, and non-string.
- `emailCopy.test.js` extended: both languages for every email-enabled event; no empty detail rows in either; the second-chance branch in both.
- Source-text wiring: `notify()` passes `lang` to all three renderers; `build-messages.js` prefers `email_content`/`wa_text` **and** retains its fallback.
- `functions/notifyCopyParity.test.js`, rewritten against `messageCopy.js`, **and extended**: it must also assert the node consumes `email_content` and `wa_text`. The existing guard only compared the two `copyFor` implementations, which is exactly why a dead `emailFor` went unnoticed for four days.

## Explicitly NOT in scope

- Translating **user-generated** content — auction titles, descriptions, seller names. Only product copy is bilingual.
- Reactive in-app notifications (re-rendering history when a user switches language).
- A backfill of the ~65k existing users; they default to Arabic until they touch the toggle.
- Any new n8n event. The contract stays at 20.
- Admin-facing copy.

## Risk to name plainly

After this the server is the **single point of failure for message copy**. Today a bad Functions deploy still leaves n8n rendering something; afterwards a bad render would send whatever the fallback produces. The fallback is the mitigation and is not optional.

The second risk is quieter: 20 events × 2 languages × several sub-branches is a lot of copy written by someone who is not a native Arabic marketer. The English is new and unreviewed. Worth MJ reading the English strings once before they reach a customer — the tests can prove they exist and are non-empty, not that they are good.
