# Mazad JO — Deploy & Test

Two deploy surfaces, and they are **separate**:

| What | How it deploys |
|------|----------------|
| **Frontend** (the React web app) | **Auto** — Vercel deploys `main` on every merge. Nothing to run. |
| **Firebase backend** (Firestore rules, Storage rules, Cloud Functions) | **Was manual** — this is what silently went stale. Now automated via GitHub Actions (below); can still be run by hand. |

> The lesson that cost an hour: merging to `main` auto-ships the frontend but **not** Firebase — so correct code ran against stale server rules. The GitHub Action below closes that gap.

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
