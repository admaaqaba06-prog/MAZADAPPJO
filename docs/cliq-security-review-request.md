# MAZZADO × Bank al Etihad — Embedded CliQ security review request

**For:** Fares (CSO, Staq)
**From:** MAZZADO engineering
**Status of integration:** UX/UI and data model complete; **no BAE API call is implemented yet**
**Feature state in production:** behind `enableCliqGateway`, **OFF**, fail-closed

---

## Why we are writing

We have built the buyer-facing CliQ flow and its server-side state machine to your UX/UI
checklist, but we have **not** connected to your API. Before we do, we would like your review
of the security model — specifically the parts where our assumptions about CliQ could be
wrong, because those are the parts we cannot test from our side.

Nothing below is a production incident. The rail is disabled and has never processed a
payment.

---

## What we have built

| Area | Implementation |
|---|---|
| Amount | Read from the settled order the server wrote. Never recomputed at checkout, never taken from the browser. The client sends its displayed total **only** so a mismatch can be refused. |
| Duplicate requests | 90-minute lock enforced inside a Firestore transaction on the Admin SDK, not in the browser. A refresh, a second tab or a replayed call cannot mint a second request. |
| Marking a payment paid | Only the webhook path. No client-reachable route sets `paid`. Enforced by Firestore rules, not just by UI. |
| Payer identifier | Alias or Jordanian mobile, validated and normalised on both sides. Stored in an **admin-only** document; only a masked form (`••••123`) is on the order, which other parties can read. |
| Analytics | Nine funnel events carrying the **bank name only**. The payer's alias, mobile and IBAN never leave our backend. |
| Secrets | No endpoint, key, certificate or alias in the repository. `.gitignore` refuses `*.crt`, `*.pem`, `*.key`. The signed certificate you issued has not been committed. |

---

## Questions where we need your answer

These are the ones we cannot resolve by reading our own code.

### 1. Is the 90-minute window authoritative on your side, or advisory?

We enforce it ourselves and refuse a second request inside the window. If BAE *also* enforces
it, our refusal is a UX nicety. If BAE does **not**, ours is the only guard.

**We specifically need to know what happens if we raise a second request for the same payment
anyway** — is it rejected, does it supersede the first, or can both be approved by the payer?
Our current design assumes rejection and we would like that confirmed rather than inferred.

### 2. What identifies a payment as ours on the return path?

We plan to reconcile on the request id you return. If a payer approves a request **after** it
has expired on your side, or approves a stale one, does the webhook still fire, and with which
id? We treat a webhook whose id does not match the order's current request as stale and ignore
it — we would like to confirm that is correct rather than lossy.

### 3. Webhook authenticity

How is the webhook signed, and what exactly should we verify — payload, timestamp, replay
window? We have reserved a secret for this (`CLIQ_WEBHOOK_SECRET`) but have implemented no
verification yet, and we will not go live without it.

We would also like to know whether webhooks can arrive **out of order** (e.g. `expired`
after `paid`), since we currently treat `paid` as terminal and ignore anything after it.

### 4. The out-of-band payment case

This is our sharpest question.

Our marketplace gives a winner a payment deadline. If that deadline passes while a CliQ
request is still outstanding, the order may already have moved on — in the worst case the item
has been offered to the runner-up. If the payer then approves the request, **money moves for an
order we can no longer fulfil.**

We have made that case safe on our side: the payment is recorded, an operations alert is
raised, and the order is *not* silently revived. But we would rather prevent it.

**Can a pending CliQ request be cancelled or revoked by the requesting merchant before the
payer acts?** If yes, we will cancel on deadline instead of relying on reconciliation. If no,
we will extend our deadline to cover your window, and we would like your view on which you
consider correct practice.

### 5. The receiving alias

Your onboarding note says the gateway alias must not be the business name, so that gateway
payments are distinguishable from manual transfers sent directly to the public alias. We
understand and agree.

Our situation: our public alias `MAZZADO` is registered and is the **live destination for
manual transfers today**. We have not renamed it. We intend to register a separate technical
alias for the gateway, and hold it in secret storage rather than in code.

**Please confirm the naming constraints** and whether you recommend a separate account behind
it for reconciliation, as your note suggested.

### 6. Bank code list

We map the IBAN prefix you return to a payer bank name for the confirmation screen. Your
worked example (`JO20UBSI` → Bank al Etihad) is implemented. **We do not have the full bank
code list** — it was referenced as attached but has not reached us.

Until it does, any unrecognised code falls back to neutral copy (*"the bank linked to your
account"*) rather than a guessed bank name. Please send the list.

---

## Two things we would like you to challenge

We are not asking for a rubber stamp. If you disagree with either of these, we would rather
hear it now.

**a) We do not auto-verify a gateway payment.** A bank-confirmed payment still passes through
our human verification step before funds are released to the seller. This is deliberate
conservatism on our side, but it means a CliQ payment is not faster to settle than a manual
transfer. If you consider gateway confirmation sufficient to skip that step, say so.

**b) We enforce the duplicate lock in a database transaction, not with a distributed lock.**
Our reasoning is that all writes go through one Firestore document, so the transaction
serialises them. If CliQ semantics make that insufficient — for example if a request can be
created through any path other than our own backend — we need to know.

---

## What we are not asking for

We are not asking you to review our application code, and we have not attached it. If it would
help, we can walk through the payment state machine on a call.

---

## Contact

Please reply to this thread. If anything here suggests we have misunderstood the CliQ model,
we would prefer to correct the design before connecting to your API rather than after.
