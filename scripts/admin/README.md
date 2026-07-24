# Admin scripts

One-off operational scripts that talk to **production** Firestore with a
service-account key. Not part of the app build or CI.

## Setup (once)

1. Firebase console → Project settings → **Service accounts** → *Generate new
   private key*. Save the JSON **outside the repo** (e.g. `~/keys/`). It grants
   full admin — never commit it (`.gitignore` blocks the common names, but keep
   it out of the tree anyway).
2. `firebase-admin` is vendored by `scripts/loadtest` — run `npm ci` there once
   if you haven't (`cd scripts/loadtest && npm ci`).

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
```

## unblock-user.cjs

Clears a payment-default (or manual) block on a buyer, and optionally deletes
the stale `waiting_payment`/`defaulted` orders that caused it. Background: the
`paymentDefaultEnforcer` sets `users/{uid}.isBlocked = true` on any buyer with an
order past its `paymentDeadlineAt`; the client bid gates and `placeBid` both key
off that flag. Unbanning alone won't stick while a `waiting_payment` order
remains — it re-defaults and re-blocks. This clears both.

```bash
# diagnose (read-only): show the user, block state, and their orders
node scripts/admin/unblock-user.cjs 0790005753

# unblock only
node scripts/admin/unblock-user.cjs 0790005753 --fix

# unblock + delete stale waiting_payment/defaulted orders (never touches paid)
node scripts/admin/unblock-user.cjs 0790005753 --fix --clear-orders
```

Phone can be local (`0790005753`) or E.164 (`+962790005753`) — Jordan variants
are matched automatically. Completed/paid orders are never deleted.
