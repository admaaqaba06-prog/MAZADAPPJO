# Discover Funnel Polish — Plan (post-Core-Happy-Path quick pass)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Two tasks.

**Goal:** Make the logged-in Discover home a funnel: non-members see one unmissable path to join; empty inventory sells the schedule instead of a dead end; one category taxonomy; no retired-model (escrow/wallet) language; Sell = concierge.

**Global constraints:** All new strings AR + EN (site's existing `isAr` patterns). Arabic copy in Jordanian colloquial tone where the file already uses it. WhatsApp CTA URL constant: `https://wa.me/962781444899`. `npm run build` must pass per task. Hide-don't-delete.

---

### Task A: The funnel — join banner + empty state that sells the schedule

**Files:** Modify `src/components/DiscoveryFeedView.tsx`.

1. **Join banner** (renders at the top of the feed content, above the search bar, ONLY when `currentUser?.subscriptionStatus !== 'active'`): a slim card, brand-orange accent, containing the 3-step money story as three inline steps with icons/numbers — AR: «① انضم بدينار واحد ② زايد مجاناً ③ ادفع فقط عند الفوز (+٥٪ عمولة)» EN: "① Join for 1 JD ② Bid freely ③ Pay only when you win (+5% premium)" — and a primary button AR «انضم الآن — ١ د.أ» / EN "Join now — 1 JD" that calls `setActiveView('wallet')`. Use the component's existing `useApp()` access (extend destructuring if needed).
2. **Empty state** (the "NO AUCTIONS FOUND" card): replace copy with schedule-selling content. AR title «المزادات تُعلن يومياً 📢», body «تابع قناتنا على واتساب ليوصلك موعد كل مزاد أول بأول — أو تفقد المواعيد القادمة.», EN title "Auctions are announced daily 📢", body "Follow our WhatsApp channel to catch every drop — or check the upcoming schedule." Two buttons: (a) outline WhatsApp button «تابعنا على واتساب» / "Follow on WhatsApp" → opens the WhatsApp URL constant in a new tab; (b) subtle button «المواعيد القادمة» / "Upcoming drops" that switches the feed to the existing Upcoming tab (reuse whatever state toggles the 'Active live feed' / 'Upcoming drops' tabs at ~:659-671). Keep the existing icon plate.

### Task B: Taxonomy + retired-language sweep + Sell concierge

**Files:** Modify `src/components/DiscoveryFeedView.tsx`, `src/components/DesktopFrame.tsx`, `src/App.tsx`; Create `src/components/SellWithUsView.tsx`.

1. **One taxonomy:** the top pill row (`categoriesList` with Luxury/Vehicles/Electronics/Fashion at ~:319) becomes All + the five real categories: سيارات/Cars, عقارات/Real Estate, هواتف/Phones, ساعات/Watches, إلكترونيات/Electronics (keep icon style — pick sensible lucide icons). DELETE the duplicate second pill row added earlier (~:684, the `{ ar: 'سيارات', en: 'Cars' }` array row) so only one category system remains, wired to whatever filtering the top row already does.
2. **Search placeholder** → AR «ابحث: سيارات، ساعات، عقارات…» / EN "Search: cars, watches, real estate…".
3. **DesktopFrame right rail:** `:546` «تنبيهات ومعاملات الضمان» / "ESCROW LEDGER & ALERTS" → «الطلبات والتنبيهات» / "ORDERS & ALERTS"; `:585` escrow-protection footer → AR «مدفوعاتك عبر كليك إلى حساب مزادو في كابيتال بنك.» / EN "Payments via CliQ to Mazzado's Capital Bank account."
4. **Sell concierge:** create `SellWithUsView.tsx` — centered card: headline AR «بيع معنا 🤝» / EN "Sell with us 🤝", body AR «فريقنا بفحص كل قطعة قبل عرضها — تواصل معنا على واتساب ونرتب لك كل شي.» / EN "Our team inspects every item before listing — message us on WhatsApp and we'll handle everything.", primary button → WhatsApp URL constant (new tab). In `src/App.tsx` `case 'upload':` render `ListingWizardView` ONLY for admins (same `isStrictAdmin` pattern used by the 'admin' case), else `SellWithUsView`.

**Verify per task:** `npm run build`; Task B also: `grep -rn "ESCROW LEDGER\|escrow protection" src/components/DesktopFrame.tsx` → 0.
