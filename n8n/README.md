# n8n — notification relay

Source-of-truth copies of the n8n Cloud workflows that turn Cloud Functions
events into WhatsApp + email. n8n Cloud is the live system; these files are
checked in so the logic is reviewable and recoverable.

Instance: `https://mazadjo.app.n8n.cloud`

## Live: `webhook-receiver-v2.json` (id `VF3Xi0DYFDi5cliB`)

```
Webhook POST /incoming
   └─> Build Messages            (Code — templates the copy Functions already rendered)
         ├─> Send WhatsApp?      (IF sendWhatsapp)  ─> Send: WhatsApp  (WasenderAPI)
         └─> Send Email?         (IF sendEmail)     ─> Send: Email     (Resend)
                                                          └─> Both Channels Done (Merge)
                                                                └─> Assert Sent (Code)
```

**Why the Merge + Assert Sent.** Both sends hang off one Code node, so with
`executionOrder: v1` a throw in the WhatsApp branch aborts the run *before* the
email branch executes — one channel failing would silently swallow the other.
So both HTTP nodes use `onError: continueRegularOutput`, the Merge waits for
both branches, and `Assert Sent` re-raises any failure at the end. Net effect:
every channel is always attempted, and a failure still turns the execution red
so n8n failure-rate monitoring sees it.

**Copy is owned by the repo. The node is a forwarder.**

Cloud Functions render every customer message in the *recipient's* language
(`functions/messageCopy.js` for WhatsApp, `functions/emailCopy.js` for email)
and put the result on the payload:

- `wa_text` — the WhatsApp body, a ready string.
- `email_content` — a structure, not HTML:
  `{ event, lang, kind, subject, preheader, heading, intro, details[], cta, brand }`.

`build-messages.js` templates that structure (`buildHtmlFromContent`) and
forwards `wa_text` as-is. It decides **no wording**. Direction and `lang` come
from `email_content.lang`, so an English email renders `dir="ltr" lang="en"`
and left-aligned rather than being forced RTL.

Four rules the template enforces on what it is handed:

- **An `email_content` without the bilingual `brand` is not usable.**
  `usableContent()` requires `subject`, `heading`, and all five footer labels
  (`brand.labels.registration/address/hours/support/payments`). Anything else
  goes to the local Arabic fallback. See "Paste order" below — this is the guard,
  not a nicety.
- **No preference means Arabic.** English is opt-in and spelled exactly `'en'`;
  a missing, null or unrecognised `lang` renders the Arabic RTL shell. The
  audience is Jordanian — an unresolved language must not fall to English.
- **`dir`/`lang` are set on a body-level wrapper as well as on `<html>`.** Gmail
  and Outlook.com strip `<html>`, `<head>` and `<body>` before rendering, so
  attributes set only on the document element reach nobody in the two biggest
  clients. Alignment is inline on every cell for the same reason.
- **`wa_text` is used only when it is a string**, and `cta.url` only when it is
  `http:`/`https:`. Anything else falls back to the local render / renders no
  button — a non-string `wa_text` would send `[object Object]` to a customer,
  and `esc()` stops a quote closing the `href` but says nothing about the scheme.

> **This paste is the last one needed for copy changes.** Wording, subjects,
> detail rows, CTA labels and the footer all change in the repo from here on —
> in review, with tests — and reach production on the next Functions deploy.
> Re-paste this node only if the *template or forwarding logic* itself changes.

### Paste order: merge, let the deploy finish, THEN paste

The two halves ship separately — this node by hand, `functions/emailCopy.js` with
a Firebase deploy — so the order matters and it is **not** symmetric. An earlier
version of this file said it was "safe either way". It was not.

- **Merge first (correct).** The old node consumes only the fields it always did
  and ignores `email_content` / `wa_text`, so until the paste lands every message
  is exactly today's Arabic. The one visible effect is a mixed-language window —
  in-app bell in the recipient's language, WhatsApp and email still Arabic — and
  it self-heals the moment you paste. Verified by running the new payload through
  the old node body.
- **Paste first (don't).** The still-deployed old `emailFor` sends an
  `email_content` whose `brand` is the raw `BRAND`: no `labels`, no `name`, no
  `legal`, no `address`, no `hours`. Subject and heading are both present, so the
  original subject/heading-only gate accepted it and the branded template rendered
  an email with **no header row, no company name, no address, no hours and a
  footer of three bare unlabelled numbers** — measured on the real artefacts.

The footer-labels requirement in `usableContent()` exists for exactly that case:
the pre-bilingual shape is now rejected and falls back to the node's own complete
Arabic email, so a wrong-order paste degrades instead of mutilating.
`functions/notifyCopyParity.test.js` feeds that shape through the real node and
asserts the fallback. **Follow the order anyway** — the guard is a floor, not a
licence.

**`copyFor` and `buildHtml` remain in the node ONLY as the fallback**, used when
the payload carries no usable render (a half-landed deploy, a renamed field, a
truncated body). Without them the server would be a single point of failure for
message copy and a bad render would post a blank subject and a blank body into a
customer's inbox. They still mirror `functions/messageCopy.js` verbatim and
`functions/notifyCopyParity.test.js` fails the moment they drift — so if you
change that Arabic, change it here too. They cover all 20 events in
`CHANNEL_POLICY`.

`functions/notifyCopyParity.test.js` runs this file for real (`new Function`
with `$input` injected) and asserts on what it *emits*, not on its source text:
a node that merely mentions `email_content` in a comment fails. That gap is why
the branded email layer shipped dead on 2026-07-29 and stayed dead for four days.

Channel policy is *not* decided in n8n. Functions resolve it via `channelsFor()`
and send `channels: {inapp, whatsapp, email}` on every payload; n8n only honours
that, and additionally requires the destination to exist (phone ≥ 8 digits /
well-formed email). Currently that resolves to 19 WhatsApp-eligible and 16
email-eligible events.

### Payload contract (`$json.body`)
`{ event, phone, email, name, channels:{inapp,whatsapp,email}, ...eventData,
   wa_text?, email_content?, ts }`
— produced by `notify()` in `functions/index.js`. `wa_text` is present only when
the whatsapp channel is on, `email_content` only when the email channel is on.

### Credentials (in n8n, not here)
- `Bearer Auth account` (`3UwG5ADn5LzQ2oLx`) — WasenderAPI bearer token
- `Resend (mazad-jo.com)` (`C4KesNWdTiMHi3Ts`) — HTTP header auth, `Authorization: Bearer re_…`

### Email sending
Resend, domain `mazad-jo.com`, region Ireland (`eu-west-1`), verified 2026-07-27.
From: `مزادو <no-reply@mazad-jo.com>`. DNS lives in Cloudflare:
`TXT resend._domainkey`, `MX send` → `feedback-smtp.eu-west-1.amazonses.com`,
`TXT send` → `v=spf1 include:amazonses.com ~all`.
The apex MX (Bluehost) is deliberately untouched — Resend's optional "enable
receiving" record was **not** added, as it would break existing inbound mail.

## Retired: `webhook-receiver-v1-RETIRED-2026-07-27.json` (id `F8kFAQkiwlmxSYMI`)

The original switch fan-out: 2 nodes per event (filter on phone + HTTP send),
covering only 8 events, WhatsApp only, ignoring `channels`. Kept deactivated as
a rollback point. To roll back: deactivate v2, set this one's webhook path back
to `incoming`, activate.

## Editing

Prefer editing `build-messages.js` here, then paste into the `Build Messages`
node (or PUT the workflow via the public API). Re-export after any UI edit so
this copy does not drift.

**`build-messages.js` and `webhook-receiver-v2.json` are one artefact — commit
them together.** The export embeds the node body in
`nodes[Build Messages].parameters.jsCode`, and re-importing the export is a
supported recovery path, so a stale export silently reverts whatever the file
says. `functions/notifyCopyParity.test.js` fails if the embedded copy is not
byte-identical to the file, and separately runs the *embedded* copy to prove it
still forwards. To re-embed after editing the file:

```
python3 - <<'PY'
import json
d = json.load(open('n8n/webhook-receiver-v2.json', encoding='utf-8'))
src = open('n8n/build-messages.js', encoding='utf-8').read()
next(n for n in d['nodes'] if n['name'] == 'Build Messages')['parameters']['jsCode'] = src
open('n8n/webhook-receiver-v2.json', 'w', encoding='utf-8').write(
    json.dumps(d, indent=2, ensure_ascii=False))
PY
```

`build-messages.js` is a bare Code-node body: `$input` is injected and the file
ends in a top-level `return out;`. It is therefore **not a module** — no
`require`, no `import`, no `module.exports`, no external fetch — and
`node --check` will reject it (illegal top-level return). The parity test proves
it parses and runs instead.
