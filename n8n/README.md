# n8n — notification relay

Source-of-truth copies of the n8n Cloud workflows that turn Cloud Functions
events into WhatsApp + email. n8n Cloud is the live system; these files are
checked in so the logic is reviewable and recoverable.

Instance: `https://mazadjo.app.n8n.cloud`

## Live: `webhook-receiver-v2.json` (id `VF3Xi0DYFDi5cliB`)

```
Webhook POST /incoming
   └─> Build Messages            (Code — per-event Arabic copy, mirrors functions/notify.js copyFor)
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

**Copy lives in two places and must stay in sync**: `functions/notify.js`
→ `copyFor()` (in-app bell) and `n8n/build-messages.js` (WhatsApp + email).
`build-messages.js` is a verbatim port — same wording, same interpolation.
It covers all 20 events in `CHANNEL_POLICY`.

Channel policy is *not* decided in n8n. Functions resolve it via `channelsFor()`
and send `channels: {inapp, whatsapp, email}` on every payload; n8n only honours
that, and additionally requires the destination to exist (phone ≥ 8 digits /
well-formed email). Currently that resolves to 19 WhatsApp-eligible and 16
email-eligible events.

### Payload contract (`$json.body`)
`{ event, phone, email, name, channels:{inapp,whatsapp,email}, ...eventData, ts }`
— produced by `notify()` in `functions/index.js`.

### Credentials (in n8n, not here)
- `Bearer Auth account` (`3UwG5ADn5LzQ2oLx`) — WasenderAPI bearer token
- `Resend (mazad-jo.com)` (`C4KesNWdTiMHi3Ts`) — HTTP header auth, `Authorization: Bearer re_…`

### Email sending
Resend, domain `mazad-jo.com`, region Ireland (`eu-west-1`), verified 2026-07-27.
From: `مزاد جو <no-reply@mazad-jo.com>`. DNS lives in Cloudflare:
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
