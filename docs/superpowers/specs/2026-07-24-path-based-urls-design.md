# Path-Based URLs Design

Date: 2026-07-24
Status: Approved direction; spec for implementation.

## Problem

The app is a state-driven SPA. Navigation already syncs to the URL via
`src/utils/navUrl.ts` + history effects in `AppContext`, but it uses **query
strings** (`/?view=orders`, `/?auction=<id>`, discovery = clean `/`). Two
consequences the founder flagged:

1. The header logo goes to Discover, not the marketing landing.
2. The landing page and the app share the same URL (`/`), so the landing has no
   distinct address and isn't reachable once a visitor has "entered."

Founder decisions: **logo always → landing**, and **real path URLs** (landing at
`/`, app at `/discover`, `/sell`, …, auctions at `/auction/:id`).

## Approach

Do NOT add react-router. Convert the **existing** nav-sync layer from query
strings to real paths. The history machinery (push/replace/pop, modal-close
collapsing, Firebase auth-callback guard) is reused unchanged — only the string
format the layer emits/parses changes. Additionally, promote **`landing`** to a
first-class `NavView` mapped to `/`, which absorbs the old `entered` gate.

## URL scheme

| Path | NavView |
|---|---|
| `/` | `landing` |
| `/discover` | `discovery` |
| `/sell` | `upload` |
| `/orders` | `orders` |
| `/how-it-works` | `about` |
| `/profile` | `profile` |
| `/seller` | `seller-center` |
| `/wallet` | `wallet` |
| `/admin` | `admin` |
| `/drop-builder` | `drop-builder` |
| `/auction-drop-builder` | `auction-drop-builder` |
| `/prohibited` | `prohibited-items` |
| `/auction/:id` | `live` (+ `auctionId`) |

Modals continue to ride as a query param on top of the path
(`/orders?modal=<name>&<key>=<value>`) — unchanged mechanism, so the modal
back-button behavior and `isModalCloseTransition` logic keep working.

## Components & changes

### 1. `src/utils/navUrl.ts` — path serialize/parse (rewrite)
- Add `'landing'` to `NavView` + `KNOWN_VIEWS`.
- A single source-of-truth bidirectional map `VIEW_PATH: Record<NavView, string>`
  (e.g. `discovery: '/discover'`, `upload: '/sell'`, `about: '/how-it-works'`,
  `'seller-center': '/seller'`, `'prohibited-items': '/prohibited'`, `landing: '/'`,
  …). `live` is special-cased to `/auction/:id`.
- `serializeNav(node)` returns a **`{pathname, search}`**-shaped string, i.e. the
  full relative URL: `path + (modal query)`. Landing → `/`. Live → `/auction/<id>`.
- `parseNav(input)` accepts the **pathname + search** (callers pass
  `window.location.pathname + window.location.search`). Resolution order:
  1. Firebase auth-callback guard (`/__/auth`, `apiKey`/`authType`) → `discovery`.
  2. **Legacy back-compat:** if `pathname === '/'` AND a legacy `?auction=<id>` or
     `?view=<v>` query is present, honor it (→ `live`/that view) so old shared
     links still resolve; the mount effect will `replaceState` them to the new
     path (URL self-heals).
  3. `/auction/:id` → `{view:'live', auctionId}`.
  4. Exact path match in `VIEW_PATH` → that view.
  5. `/` (no legacy query) → `{view:'landing'}`.
  6. Unknown path → `{view:'landing'}` (safe default; SPA fallback serves any path).
- `isModalCloseTransition` unchanged.
- Keep the function names `serializeNav`/`parseNav` (callers unchanged besides the
  input they pass).

### 2. `src/context/AppContext.tsx` — feed pathname to the sync layer
Three call sites (already isolated):
- initial: `parseNav(window.location.pathname + window.location.search)`
- popstate: same
- sync effect: `const url = serializeNav(node)` then push/replace `url` (already
  uses the returned string as the URL — now it's a path, so `url` is used
  directly instead of `search || pathname`).
- `historyNodeRef` continues to store the serialized string for the equality gate
  (now a path string) — no logic change.
- Add `landing` to the `activeView` union type (both the interface field and the
  setter type) to match `NavView`.

### 3. `src/App.tsx` — landing as a view; retire `entered`
- Render `LandingView` whenever `activeView === 'landing'` — BEFORE both the
  unauthenticated browse shell AND the authenticated app shell (a single early
  check near the top of the post-`authReady` render). `onEnter` →
  `setActiveView(target ?? 'discovery')` (navigates to `/discover`).
- Remove the `entered` `useState` and the `resolveUnauthenticatedScreen`
  `entered` input; "has the visitor entered" is now simply `activeView !== 'landing'`.
- `resolveUnauthenticatedScreen` (guestGate) simplifies: given the current view is
  not `landing` (handled above), decide `browse` vs `login` exactly as today
  (guest-browsing flag, signInRequested, canGuestAccessView). Update its signature
  + tests accordingly.
- Deep link on a cold URL (`/auction/:id`) → `activeView` is `live` (not landing),
  so the visitor goes straight to the listing — same as today's `?auction=` deep
  link, now path-based.
- Authenticated users at `/` see the landing too (founder chose logo→landing for
  everyone); the landing's Enter takes them to `/discover`. (Flagged as a
  deliberate choice; trivially changeable later to auto-forward authed `/`.)

### 4. `src/components/DesktopFrame.tsx` — logo → landing
- The logo `onClick` (line ~265) → `setActiveView('landing')` (was `'discovery'`).

### 5. `src/utils/deepLink.ts` — emit path deep links
- `buildAuctionUrl(id, origin)` → `` `${base}/auction/${encodeURIComponent(id)}` ``
  (was `/?auction=`).
- `parseAuctionIdFromSearch` stays (still used by any legacy `?auction=` reader),
  and a new `parseAuctionIdFromPath(pathname)` returns the id from `/auction/:id`.
  Any consumer that must detect "arrived via auction deep link" checks both.

### 6. `src/utils/guestGate.ts`
- `canGuestAccessView` returns `true` for `landing` (a guest may see it).
- `resolveUnauthenticatedScreen` drops the `entered`/`landing` branch (landing is
  handled upstream in App.tsx); keep `browse`/`login`.

## Testing

- `navUrl.test.ts` (rewrite): round-trip every view↔path; `/auction/:id` ↔
  `{live,id}`; landing `/` ↔ `{landing}`; **legacy** `/?auction=<id>` and
  `/?view=orders` still parse; modal query preserved on top of a path; auth-callback
  guard; unknown path → landing.
- `deepLink.test.ts`: `buildAuctionUrl` emits `/auction/:id`; `parseAuctionIdFromPath`.
- `guestGate.test.ts`: updated `resolveUnauthenticatedScreen` signature/branches.
- Existing 494-test suite stays green; `npm run lint` + `npm run build` clean.

## Rollout / safety

- **Customer-facing** (URLs + landing) → build on `feat/path-based-urls`, deploy the
  Vercel preview, founder verifies before merge. Manual preview checks:
  direct-hit `/discover`, `/orders`, `/auction/<id>` load correctly (SPA fallback);
  refresh keeps the view; browser Back walks in-app; an old `/?auction=<id>` link
  redirects to `/auction/<id>`; logo → `/` landing; landing Enter → `/discover`.
- No `vercel.json` change needed — the `/(.*) → /` SPA rewrite already serves any
  path as index.html.
- Non-money-path (pure navigation), but core to the whole app → careful tests + the
  preview gate.

## Out of scope

- Per-view SEO meta / SSR (the SPA renders client-side; a future enhancement).
- Renaming internal admin view paths beyond the table above.
