# Mazzado — Deploy & Test

Two deploy surfaces, and they are **separate**:

| What | How it deploys |
|------|----------------|
| **Frontend** (the React web app) | **Auto** — `.github/workflows/firebase-hosting-deploy.yml` builds and deploys `main` to Firebase Hosting on every merge. Nothing to run. |
| **Firebase backend** (Firestore rules, Storage rules, Cloud Functions) | **Was manual** — this is what silently went stale. Now automated via GitHub Actions (below); can still be run by hand. |

> The lesson that cost an hour: merging to `main` auto-ships the frontend but **not** Firebase — so correct code ran against stale server rules. The GitHub Action below closes that gap.

> **The frontend moved off Vercel to Firebase Hosting** (same project, `mazadjoapp`), so both surfaces now deploy from one place with one auth secret. The DNS cutover completed **2026-08-18** and `vercel.json` is deleted — nothing in the serving path touches Vercel.
>
> **What the migration was actually forcing:** Vercel had returned `HTTP 402 DEPLOYMENT_DISABLED` on every hostname, so the customer-facing site was fully down. The cutover was the fix.
>
> **DNS lives in Cloudflare** (zone `mazad-jo.com`, an account outside the team — see backlog #218):
>
> | record | value |
> |---|---|
> | `mazad-jo.com` A | `199.36.158.100` |
> | `www.mazad-jo.com` CNAME | `mazadjoapp.web.app` |
> | `mazad-jo.com` TXT | `hosting-site=mazadjoapp` |
>
> All **DNS-only (grey cloud)** — Cloudflare's proxy breaks Firebase certificate issuance.
>
> **Two traps if you ever touch these records.** The apex carries a *second* TXT record,
> `v=spf1 a mx include:websitewelcome.com ~all` — editing "the TXT record" instead of the
> hosting one breaks outbound email. And `199.36.158.100` is a Firebase IP **shared across
> all customers**: which site it serves is decided solely by the `hosting-site=` TXT. A
> Google AI Studio app in an unrelated Firebase project had claimed this domain first, so
> straight after the cutover the apex served *"My Google AI Studio App"* until Firebase
> re-polled the TXT. If a stranger's app ever appears on the apex, that is why.

---

## Automated backend deploy (GitHub Actions)

`.github/workflows/firebase-deploy.yml` deploys `firestore:rules,storage,functions` to `mazadjoapp` on every merge to `main` that touches `firestore.rules`, `storage.rules`, `firebase.json`, or `functions/**` (and can be run manually from the Actions tab).

### One-time setup (needs GCP/Firebase owner access — do this once)
1. **Google Cloud Console** → project `mazadjoapp` → **IAM & Admin → Service Accounts → Create service account** (e.g. `github-deployer`).
2. Grant it these roles (targeted):
   - **Firebase Rules Admin** (`roles/firebaserules.admin`) — Firestore + Storage rules
   - **Cloud Functions Admin** (`roles/cloudfunctions.admin`) — functions
   - **Service Account User** (`roles/iam.serviceAccountUser`) — to act as the functions runtime SA
   - **Cloud Build Editor** (`roles/cloudbuild.builds.editor`) + **Artifact Registry Writer** (`roles/artifactregistry.writer`) — functions build step
   - *Simplest fallback if you hit a permission error:* grant **Editor** + **Firebase Admin** (broader, but reliable).
3. On that service account → **Keys → Add key → Create new key → JSON** → download it.
4. **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the **entire** JSON file contents.
5. Done. The next relevant merge auto-deploys; or trigger it now via **Actions → "Deploy Firebase" → Run workflow**.

> Alternative auth (quicker, less preferred): `firebase login:ci` locally → store the token as secret `FIREBASE_TOKEN` and change the deploy step to `firebase deploy --only ... --token "$FIREBASE_TOKEN"`. Works, but the token is tied to a user account and is being phased out — the service account above is the durable choice.

---

## Manual backend deploy (fallback / first run before the Action is set up)

From the repo root, on latest `main`, with the Firebase CLI logged in (`firebase login`) to `mazadjoapp`:

```bash
firebase deploy --only firestore:rules,storage,functions
```

Or individually:
```bash
firebase deploy --only firestore:rules   # phone-signup rule + auction go-live lock
firebase deploy --only storage           # auction-videos (≤250MB) + thumbnails (≤20MB) — required for uploads
firebase deploy --only functions         # activates scheduledAuctionOpener (auto-open)
```

Also one-time in the Firebase Console: **Authentication → Sign-in method → enable Phone**, and add the production + `localhost` domains under **Authorized domains**.

---

## Adding or changing a custom domain

Backlog item 22. **`authDomain` is a custom domain, not `mazadjoapp.firebaseapp.com`** (`src/services/firebase.ts`), so the order below is load-bearing. Get it wrong and the site loads perfectly while every phone and Google sign-in fails — that exact failure already shipped once on `mazad-jo.com`.

Do these IN ORDER. Do not merge the code change until steps 1-5 are green.

1. **Firebase Console -> Hosting -> Add custom domain** — add the apex and `www`. Firebase issues a TXT record for ownership, then the A records to serve on. **Use the values the console prints**, not any written here; they change.
2. **DNS at the registrar** — add exactly those records. If the domain currently serves another site (a Squarespace/Wix/marketing page), **disconnect it there first**, or that platform keeps rewriting its own A records back over yours.
3. **Firebase Console -> Authentication -> Settings -> Authorized domains** — add BOTH hosts. This is the step that breaks sign-in when skipped, and it fails silently: hosting works, auth does not.
4. **Google Cloud Console -> APIs & Services -> Credentials -> the OAuth 2.0 Client -> Authorized redirect URIs** — add `https://{host}/__/auth/handler` for BOTH hosts. **Step 3 does not do this**, nothing in the Firebase console mentions it, and skipping it is what killed Google sign-in on `mazzado.com` for the whole first day after the cutover. See [Three requirements, not one](#three-requirements-not-one) below.
5. Wait for the Firebase Hosting cert to reach **Connected** (minutes to ~24h). `/__/auth/handler` must return 200 on the new host before continuing. **A 200 here is not proof sign-in works** — the handler is Hosting; the redirect URI is Google. Run the real flow.
6. **Only now** merge the `authDomain` change in `src/services/firebase.ts`, plus `SITE` in `functions/emailCopy.js`.
7. **Deploy functions.** `emailCopy.js` is server-side, so every transactional email link stays on the old domain until a `functions/**` change deploys.
8. **Re-paste the n8n nodes.** `n8n/build-messages.js` and `n8n/webhook-receiver-v2.json` are the repo's copy; n8n Cloud runs its own. Editing the repo changes nothing until a human pastes it in.
9. **Email sender identity is a SEPARATE migration — do not rush it.** The Resend `from` address lives in the n8n node (`n8n/webhook-receiver-v2.json`, currently `no-reply@mazzado.com`) and sending is only authorised for a domain Resend has verified, which needs its own SPF/DKIM/DMARC records at the registrar. Changing the `from` to a new domain before Resend verifies it does not degrade — **every transactional email stops sending**. Verify the new domain in Resend, add its DNS records, send a test, and only then change the `from`. Until that is done the link inside the email may point at the new host while the sender stays on the old one, which is fine and is the safe intermediate state.
10. Smoke-test on the new host: phone signup, Google sign-in, an auction deep link, and one transactional email.

### Three requirements, not one

A host can only be used as `authDomain` when **all three** of these are true. They live in three different consoles and satisfying one does not satisfy the next:

| # | Requirement | Where | Symptom when missing |
|---|---|---|---|
| 1 | Firebase Hosting serves `/__/auth/*` on the host | Hosting -> Domains | `/__/auth/handler` 404s or shows *Site not found* |
| 2 | Host is in **Authorized domains** | Authentication -> Settings | Firebase refuses the popup/redirect before Google is reached |
| 3 | `https://{host}/__/auth/handler` is an **Authorized redirect URI** | Google Cloud -> Credentials -> OAuth 2.0 Client | Google's *Access blocked*, `Error 400: redirect_uri_mismatch` |

**Requirement 3 is the one that bites.** The Mazzado cutover satisfied 1 and 2, added the hosts to `KNOWN_AUTH_HOSTS`, and every Google sign-in failed from that moment until the redirect URIs were added by hand.

Measured per host on 2026-08-25, same OAuth client each time, by running the real flow rather than probing the handler:

| Host | Before the URIs were added | After |
|---|---|---|
| `www.mazzado.com` | `redirect_uri_mismatch` | account picker, *"to continue to mazzado.com"* |
| `mazadjoapp.web.app` | `redirect_uri_mismatch` | unchanged — see below |
| `mazadjoapp.firebaseapp.com` | account picker | account picker |

`.web.app` still fails, for the same reason: Firebase registers the `.firebaseapp.com` handler automatically, not the `.web.app` one. It is nonetheless listed in `KNOWN_AUTH_HOSTS`, so **Google sign-in is broken for anyone reaching the app on `mazadjoapp.web.app`** — a known, unclosed gap rather than a decision. Close it either by adding `https://mazadjoapp.web.app/__/auth/handler` to the OAuth client, or by dropping the host from the array so it falls back to `mazadjoapp.firebaseapp.com`. Production traffic arrives on `www.mazzado.com`, which is why this has not hurt anyone.

**Two verification rules, both learned the expensive way:**

- **A 200 from `/__/auth/handler` proves nothing about sign-in.** It proves Hosting is serving the file. The redirect URI is checked by Google, later, and only during a real handshake.
- **Presence in Firebase's authorized-domains list proves nothing either.** It was verified present via the Identity Toolkit config endpoint on the very hosts that were failing.

The only sufficient test is completing an actual Google sign-in on the host and reading the domain name Google prints on the consent screen.

**Retiring the old domain** is a separate, later step. Firebase Hosting serves every attached domain, so the old one keeps working until it is removed under Hosting -> Domains. Removing it breaks every auction link already shared over WhatsApp and every link in email already delivered.

---

## Test checklist (run after a backend deploy)

Report each pass/fail with console errors.

1. **Phone signup** (new number, production domain) → SMS arrives, OTP verifies, **user doc creates + wallet loads** (no "insufficient permissions").
2. **Video upload + auction creation** (Sell flow) → upload completes (not stuck at 0%), auction appears.
3. **Drop Builder** (admin → "Auction Drop") → Arabic caption + `?auction=…` deep link; Copy caption/link work.
4. **Auto-open** → a scheduled drop flips **live** on its own within ~1 min of its start time. *(For a hand-made Firestore test doc, set both `endTime` and `endsAt`.)*
5. **Bidding** → the displayed bid amount is **accepted** (not rejected as below minimum); viewer/activity numbers are real (no fake counts/bots).
6. **Savings reveal** → win an auction with a market price set → "you saved X vs market".
7. **No regressions** → email + Google login still work.

## Notes
- Rules are **additive/secure**: non-admins can only create `pending` auctions (need admin approval); nothing auto-opens without an admin. Phone users create a profile with an empty email (never a fabricated one).
- reCAPTCHA falling back from Enterprise to v2 (console warning) is **not blocking** — v2 works for phone auth.
