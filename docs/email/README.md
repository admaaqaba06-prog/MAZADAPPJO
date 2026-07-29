# Email branding & content

## Where things live

| Thing | Where | Who edits |
|---|---|---|
| **Copy** (subject, heading, body, CTA label) | `functions/emailCopy.js` | this repo, with tests |
| **Footer identity** (entity, address, hours, phones, links) | `BRAND` in `functions/emailCopy.js` | this repo |
| **HTML shell** | `docs/email/transactional.html` | pasted into the n8n workflow |

## Why the copy moved into the repo

Every channel used to share one string from `notify.js copyFor()`, so the email
rendered an in-app toast inside an HTML shell. The live payment reminder read:

> ما زال "ارقيله " بانتظار الدفع. بادر قبل انتهاء المهلة.

No amount. No deadline. No order reference. A stray space inside the quotes. A
generic "افتح التطبيق" button — while the order carried all of it.

In-app has to be terse; email has room. `emailFor(event, data)` is the email's
own copy, and the webhook payload now carries it rendered as `email_content`, so
n8n is a dumb template rather than a second copy map that drifts from this repo.

## Wiring it in n8n

1. In the email node, set **Subject** to `{{ $json.email_content.subject }}`.
2. Set the HTML body to the contents of `transactional.html`.
3. The `{{#each $json.email_content.details}}` block needs an iterator — if the
   node cannot loop, replace that table with a pre-rendered string field and
   add one to `emailFor` instead. **Do not** hard-code the rows in n8n; they
   vary per event and per order.
4. Send only when `{{ $json.channels.email }}` is true — unchanged.

## Transactional vs marketing

`email_content.kind` is `transactional` for everything this template serves.

**Transactional mail carries no unsubscribe link.** A person cannot opt out of
being told they owe money, that their order shipped, or that their account was
restricted. Marketing sends need their own template **with** an unsubscribe, and
the two must not share one footer — that is the usual mistake.

## Still needed from MJ

- **A support email address and a privacy email address.** The footer currently
  offers WhatsApp numbers only. `docs/legal/` has the same gap.
- **A hosted logo URL** — the brand bar is a text wordmark; swap in
  `<img src="…" width="120" alt="مزاد جو">` when one exists.
