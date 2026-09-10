# POLICY_CONFLICTS.md — ما سيخالف السياسة المنشورة عند إطلاق المرحلة ١

> جرد **قراءة فقط** لكل نصّ منشور تجعله المرحلة ١ غير صحيح.
> نُفِّذ بوكيلين متوازيين + ناقد تحقّق من النصوص حرفاً بحرف وفحص الحزمة المنشورة.
> **89** تعارضاً بعد إزالة التكرار، منها **13** مُلزِمة قانونياً.

**التغيير محلّ البحث:** إدخال خطوة موافقة البائع بين «إغلاق المزاد» و«فوز المشتري».

---

## 🔴 أولاً: شيء يجب فعله بغضّ النظر عن النص

`RULES_VERSION = 1` في `src/content/auctionRules.ts:8`. والتعليق فوقه مكتوب فيه حرفياً:

> `// legal backstop. Bump RULES_VERSION on any material change to re-prompt acceptance.`

الموافقة تُحفظ في `acceptedAuctionRulesVersion` عند `src/context/AppContext.tsx:3334`.

**إذا عدّلت القواعد ولم ترفع الرقم، لن يُطلب من أي عضو حالي الموافقة مجدداً** — سيبقون مرتبطين قانونياً بنصّ لم يعودوا يرونه. الرفع إلى `2` جزء من التغيير، لا خطوة لاحقة.

## 🔴 ثانياً: تعارض الساعتين

المرحلة ١ تضيف مهلة **٢٤ ساعة للبائع**. والنص المنشور يقول إن على المشتري الدفع خلال **٢٤ ساعة من إغلاق المزاد**.

ساعتان مختلفتان مربوطتان بنفس اللحظة «إغلاق المزاد». مشترٍ بقيت قطعته عند البائع ٢٣ ساعة سيكون **على بُعد ساعة من التخلّف عن الدفع قبل أن يُبلَّغ أصلاً بأنه فاز**. هذه بالضبط الصياغة التي تُنتج نزاعاً.

## 🔴 ثالثاً: «مُلزِمة» من طرف واحد

`legalTerms.ts:111` يقول «المزايدة الفائزة مُلزِمة». وبعد المرحلة ١، المزايد ملزَم ٢٤ ساعة بينما **البائع حرّ في الانسحاب**. ولا يوجد في `legalTerms.ts` ولا `auctionRules.ts` ولا نصّ واتساب أي جملة تقول إن أعلى مزايدة يمكن أن تُرفض.

بند «مُلزِم» يبدو متبادلاً بينما هو في الواقع خيار أحادي بيد البائع — هذا هو البند المعرّض للطعن أمام حماية المستهلك الأردنية.

---

## البنود المُلزِمة قانونياً (13)

### `src/content/auctionRules.ts:26` · ar

```
يعرض كل مزاد الحد الأدنى للزيادة. صاحب أعلى مزايدة صحيحة عند إغلاق المزاد هو الفائز.
```

**أين يُعرض:** AuctionRulesModal rule #3, rendered from 7 surfaces: SubscriptionView (the required-checkbox acceptance gate), LandingView, DiscoveryFeedView, MobileAuctionView, DesktopLiveAuctionLayout, ProfileView, HowItWorksView. Confirmed shipping in dist/assets/auctionRules-C5IGyxe1.js.

**لماذا يصبح غير صحيح:** After Phase 1 a closed auction with a bid can enter a pending-seller state instead of producing a winner (the notification layer already ships this: n8n/build-messages.js:38 below_reserve_pending, functions/messageCopy.js:60), and below the tolerance floor the lot closes silently with no offer at all, so there is no winner. This is the single most load-bearing sentence in the whole product: AUCTION_RULES is the versioned document the user ticks a required checkbox for at the pay-to-bid gate (SubscriptionView.tsx:600-620, acceptance persisted at src/context/AppContext.tsx:3333-3336 as acceptedAuctionRulesVersion). Also note RULES_VERSION is still 1 (src/content/auctionRules.ts:8) — a material change here must bump it or no existing member is ever re-prompted.

### `src/content/auctionRules.ts:25` · en

```
Each auction shows its minimum bid increment. The highest valid bid when the auction closes wins.
```

**أين يُعرض:** AuctionRulesModal rule #3 with the language toggle set to English; same 7 surfaces.

**لماذا يصبح غير صحيح:** Same defect as line 26. The English half of the same accepted rule object; it must be edited in the same commit or the two languages will make different promises about who wins.

### `src/content/auctionRules.ts:30` · ar

```
يدفع الفائز خلال 24 ساعة من إغلاق المزاد، عبر كليك (CliQ).
```

**أين يُعرض:** AuctionRulesModal rule #4, same 7 surfaces. Confirmed shipping in dist/assets/auctionRules-C5IGyxe1.js.

**لماذا يصبح غير صحيح:** Phase 1 puts a 24-hour SELLER decision window between close and win, so on the pending path the buyer's 24h can no longer start at close — it starts at acceptance. As written, a buyer whose lot sat with the seller for 23 hours would already be an hour from default before being told they had won. It also collides head-on with the second 24 in the same design: two different 24-hour clocks both anchored to "إغلاق المزاد" is the exact wording that produces a dispute.

### `src/content/auctionRules.ts:29` · en

```
Winners pay within 24 hours of the auction closing, via CliQ.
```

**أين يُعرض:** AuctionRulesModal rule #4 in English; same 7 surfaces.

**لماذا يصبح غير صحيح:** Same anchor defect as line 30; the English half of the same accepted rule.

### `src/content/legalTerms.ts:68` · ar

```
يجب دفع قيمة المزايدة الفائزة بالكامل قبل الموعد النهائي الظاهر على طلبك. المهلة الاعتيادية هي 24 ساعة من إغلاق المزاد، وبعض القطع تحدد مهلة مختلفة — والمهلة الظاهرة على طلبك هي المعتمدة.
```

**أين يُعرض:** TermsModal, «الدفع والتسوية» section, first bullet. TermsModal is opened from the footer link in DesktopFrame.tsx:837 and LandingView.tsx:3172.

**لماذا يصبح غير صحيح:** Same anchor problem: on the seller-approval path the order does not exist at close, so "24 ساعة من إغلاق المزاد" cannot describe it. The clause is half-protected — it already defers to «الموعد النهائي الظاهر على طلبك» — so the fix is small (drop the close anchor, keep the order-deadline rule), but leaving the number anchored to close means the formal terms and the order screen will state different deadlines for the same order.

### `src/content/legalTerms.ts:67` · en

```
The winning bid must be paid in full before the deadline shown on your order. The standard window is 24 hours from the close of the auction; some lots state a different window, and the one on your order is the one that applies.
```

**أين يُعرض:** TermsModal payment section in English.

**لماذا يصبح غير صحيح:** Same anchor defect as line 68; the English half of the same legal line.

### `src/content/legalTerms.ts:111` · both

```
المزايدة الفائزة مُلزِمة، وبمجرد موافقتك على تحرير المبلغ تكتمل عملية البيع ولا يوجد استرداد بعد ذلك. أثِر أي ملاحظة قبل الموافقة.
```

**أين يُعرض:** TermsModal, «حماية المشتري والنزاعات» section, last bullet, rendered in danger red. Confirmed shipping in dist/assets/index-Dudnkyxk.js.

**لماذا يصبح غير صحيح:** Not literally false, but after Phase 1 it states the obligation one-sidedly and it is the ONLY place the formal terms address bindingness. The buyer's bid binds him for a 24-hour seller window during which the seller is free to walk away; nowhere in legalTerms.ts, auctionRules.ts or the WhatsApp TERMS block is it ever said that a highest bid can be refused. Under Jordanian consumer-protection review, a bilateral-sounding "binding" clause covering what is actually a unilateral option held by the seller is the clause that gets attacked. English twin on line 110: "Winning bids are binding, and once you approve release the sale is complete — there are no refunds after that point. Raise any concern before approving."

### `src/components/AuctionDetailsModal.tsx:313` · both

```
رائع! أنت الآن في المنافسة. إذا فزت، تدفع سعر الفوز + عمولة المشتري ٥٪ عبر كليك خلال ٢٤ ساعة. إذا خسرت، لا تدفع شيئاً.
```

**أين يُعرض:** AuctionDetailsModal, shown on placing a bid. Found by grep beyond the file list you named.

**لماذا يصبح غير صحيح:** Same missing third state as the onboarding, but worse placed: this is the confirmation shown as the user commits a binding bid, which is the moment the disclosure of the seller's 24-hour option actually has to happen for the bid to be informed. English twin on line 314: "Awesome! You're in the running. If you win, you pay the final price + 5% buyer's premium via CliQ within 24 hours. If you lose, you pay nothing."

### `docs/legal/terms-of-use.md:85` · en

```
The winner is the highest valid bid when the auction closes, as determined by Mazad's servers, which are authoritative.
```

**أين يُعرض:** not rendered — draft Terms of Use, §4 "Bidding rules", awaiting counsel review (banner at lines 3-17).

**لماذا يصبح غير صحيح:** Phase 1 makes the definition of "winner" in the governing document wrong: the server's determination at close is now a candidate offer, not a winner. §4 has no reserve concept and no seller-acceptance concept anywhere in it. This doc is a DRAFT and is not rendered by the app (nothing in src/, public/, index.html, functions/ or n8n/ references it — the only mention anywhere is the pointer comment at src/content/legalTerms.ts:29), but it is the document that carries the banner saying it must go to a Jordanian lawyer before publishing, so it must be fixed BEFORE that review, not after.

### `docs/legal/terms-of-use.md:100` · en

```
- The winning buyer must pay the total due (winning bid + 5% buyer's premium)
  **via CliQ to Mazad within 24 hours** of the auction closing.
```

**أين يُعرض:** not rendered — draft Terms of Use, §6 "Payment".

**لماذا يصبح غير صحيح:** Same anchor defect as auctionRules.ts:30 and legalTerms.ts:68, but in the document that would be relied on in a dispute, and the only one of the three with the deadline in bold. §6 also has no concept of the order being created later than close.

### `src/components/SellerCenterView.tsx:1546` · ar

```
عند القبول، يُرسل العرض للمشتري ليؤكد الشراء قبل أن يصبح طلباً نهائياً. عند الرفض، يمكنك إعادة إدراج القطعة فوراً.
```

**أين يُعرض:** Seller Centre, the amber below-reserve offer card (id `below-reserve-offer-<auctionId>`) — the seller's only in-app surface for the Phase-1 decision. Ships in dist/assets/SellerCenterView-BhoRN6lJ.js.

**لماذا يصبح غير صحيح:** THIS IS THE SHARPEST CONTRADICTION IN THE CORPUS AND NEITHER SWEEP FOUND IT. Sweep 2 cited line 1541 (the headline of this same card) and stopped one line short. The card promises the buyer a second opt-out — a chance to walk away after the seller accepts — which is flatly denied by the two documents the buyer contractually accepted: src/content/auctionRules.ts:22 «كل مزايدة مُلزِمة. لا يمكن التراجع عن المزايدة أو حذفها» and src/content/legalTerms.ts:111 «المزايدة الفائزة مُلزِمة». So today the platform simultaneously tells the seller the buyer may refuse and tells the buyer he may not. Whichever is true, the other is a false statement in a document a user ticked a required checkbox for. The owner cannot rewrite the policy without deciding this: if the buyer really does get a confirm step, the binding-bid rule is wrong; if he does not, this card is lying to the seller about what accepting costs him. English twin on line 1547: "If you accept, the offer goes to the buyer to confirm before it becomes a final order. If you reject, you can relist the item straight away." Note also that this card states NO deadline anywhere — the 24-hour window exists only in a code comment at SellerCenterView.tsx:1417.

### `src/content/auctionRules.ts:22` · ar

```
كل مزايدة مُلزِمة. لا يمكن التراجع عن المزايدة أو حذفها — زايد فقط بالمبلغ الذي تنوي دفعه.
```

**أين يُعرض:** AuctionRulesModal rule #2 — same 7 surfaces as rules #3/#4, including the required-checkbox acceptance gate at SubscriptionView.tsx:598-619.

**لماذا يصبح غير صحيح:** Sweep 1 flagged the bindingness problem only at legalTerms.ts:111 and stated it is «the ONLY place the formal terms address bindingness». That is not true — the stronger and more exposed statement is here, in the document with the required checkbox and a stored per-version consent (src/context/AppContext.tsx:3333-3336). After Phase 1 this rule describes a one-sided option: the bidder is locked for up to 24 hours while the seller is free to walk, and rule #2 never says so. It is also directly contradicted in the other direction by SellerCenterView.tsx:1546, which tells the seller the buyer gets a confirm step. Any rewrite must fix rule #2 in the same commit as rule #3 (line 26) and rule #4 (line 30), and must bump RULES_VERSION (auctionRules.ts:8, still 1). English twin on line 21: "Every bid is binding. You cannot retract or delete a bid — bid only what you intend to pay." Confirmed shipping in dist/assets/auctionRules-C5IGyxe1.js.

### `functions/messageCopy.js:110` · ar

```
قبل البائع مزايدتك على "${t}". أكّد للشراء.
```

**أين يُعرض:** In-app notification, push notification and WhatsApp, on seller acceptance; mirrored in the live n8n Build Messages fallback at n8n/build-messages.js:37.

**لماذا يصبح غير صحيح:** The third leg of the bindingness contradiction, and the one that reaches the buyer's phone. «أكّد للشراء» offers the buyer a decision the accepted rules say he does not have (auctionRules.ts:22, legalTerms.ts:111). Worse, the email layer says the opposite thing for the same event: functions/emailCopy.js:291 says «قبل البائع مزايدتك. أكمل الدفع لإتمام الشراء» — complete PAYMENT, not confirm. So one event produces two different obligations depending on which channel the buyer reads first. Neither sweep compared the two. English twin on line 61: 'The seller accepted your bid on "${t}". Confirm to buy.' vs the email's "The seller accepted your bid. Complete payment to finish the purchase." (emailCopy.js:401). Neither string states when the buyer's 24 hours start, which is the one fact Phase 1 makes load-bearing.

---

## وعود موجَّهة للمستخدم (63)

| الملف | اللغة | النص | لماذا يصبح غير صحيح |
|---|---|---|---|
| `src/content/legalTerms.ts:133` | both | تعتمد مزادو على نخبة من شركات الشحن المتخصصة لضمان إيصال مشترياتكم بكفاءة. يتم شحن وتسليم الطلبات وفق الجدول ا… | «رسا عليكم» means the lot was knocked down to you at the fall of the hammer. After Phase 1 there is no hammer-fall for a pending lot; the order can be created up to 24 hours later, and on a rejected o… |
| `src/utils/dropCaption.ts:22` | ar | ⚠️ عند انتهاء الوقت يتم اعتماد آخر مزايدة مسجلة | This is exactly the word Phase 1 takes away: after the change the last recorded bid is not اعتماد at close, it is at most an offer put to the seller, and below the tolerance floor it is nothing. This … |
| `src/utils/dropCaption.ts:32` | ar | 💰 الدفع: فوري بعد رسو المزاد | Already false today — the platform's window is 24 hours (auctionRules.ts:30, legalTerms.ts:68, functions default DEFAULT_PAYMENT_WINDOW_HOURS = 24), not «فوري». Phase 1 makes it false twice over: on t… |
| `src/utils/dropCaption.ts:33` | ar | 🚚 التسليم: خلال 2 – 4 أيام | Contradicted by the platform's own formal position in two places already — legalTerms.ts:139 «قد تطرأ بعض التأخيرات اللوجستية الخارجة عن إرادتنا» and docs/legal/terms-of-use.md:131 "Delivery timeframe… |
| `src/components/HowItWorksView.tsx:67` | both | سعر الفوز + عمولة مشتري ٥٪ — عبر كليك إلى حساب مزادو (البنك الأهلي) خلال ٢٤ ساعة. | The structural conflict, not just a sentence: the canonical explanation of how Mazzado works has a five-step loop with no seller-approval step in it, and no third outcome between win and lose. Phase 1… |
| `src/components/OnboardingModal.tsx:86` | both | المزايدة مجانية — ما بتدفع إلا إذا فزت. عند الفوز بتدفع سعر الفوز + عمولة المشتري ٥٪ عبر كليك خلال ٢٤ ساعة. إذ… | Phase 1 creates a THIRD outcome the onboarding never mentions — highest bidder, awaiting a seller decision for up to 24 hours, neither won nor lost. This is the first thing a new user reads, so it set… |
| `src/components/feedback/WinCelebration.tsx:138` | ar | 🎉 مبروك! فزت بالمزاد | useWinDetection (same file, lines 51-80) fires this on the pure transition status !== 'completed' → 'completed' while currentBidderId === me. It reads no reserve, no offer status, no seller decision. … |
| `src/components/feedback/WinCelebration.tsx:138` | en | 🎉 Congratulations — you won! | Same trigger — status transition to 'completed' plus being the top bidder. No seller-approval gate. |
| `src/components/feedback/WinCelebration.tsx:160` | both | ادفع الآن  /  Pay now | Sends the bidder to pay for a lot the seller has not accepted. Under Phase 1 there may be no order to pay against, and the lot may be rejected — the bidder would have transferred CliQ money against no… |
| `src/utils/translations.ts:273` | ar | مبروك! 🎉 ربحت المزاد | Key `winEndedHeadline`, rendered by LiveStreamView.tsx:194 inside the ended-auction Winner Card, which is gated only on isViewerWinner(activeAuction, currentUser?.id) — top bidder at close. No seller-… |
| `src/utils/translations.ts:133` | en | Congratulations — you won! 🎉 | Same key/gate as the Arabic; declares a win at close. |
| `src/utils/translations.ts:276` | ar | ادفع خلال ٢٤ ساعة | Key `winPayWithin24h`, rendered LiveStreamView.tsx:217 immediately at close. Post-Phase-1 the 24 hours at that moment belong to the SELLER's decision window, not the bidder's payment window. This tell… |
| `src/utils/translations.ts:137` | en | Pay within 24 hours | Same as the Arabic pair — the 24h window at close is the seller's, not the buyer's. |
| `src/utils/translations.ts:277` | ar | أكمل الدفع | Key `winCompletePaymentCta`, the primary button (id `ended-card-complete-payment`, LiveStreamView.tsx:223-225) shown at close before any seller acceptance. |
| `src/utils/translations.ts:138` | en | Complete payment | Same CTA, same premature gate. |
| `src/utils/translations.ts:274` | both | المجموع المستحق  /  Total due | Key `winTotalDueLabel`, rendered LiveStreamView.tsx:199 at close over totalWithPremium(activePrice). Nothing is due until the seller accepts; below the tolerance floor nothing will ever be due. |
| `src/utils/translations.ts:280` | ar | طلبك الرابح رح يظهر هون خلال دقيقة. | Key `ordersFinalizingHint`, rendered MyOrdersView.tsx:238. Its gate (MyOrdersView.tsx:161-167, `hasUnsettledWin`) is: I am the top bidder + the auction is finished + no order exists yet. That is EXACT… |
| `src/utils/translations.ts:140` | en | Your winning order will appear here within a minute. | Same gate as the Arabic — it now precisely describes the pending-seller state and makes a promise that state cannot keep. |
| `src/utils/translations.ts:279` | both | جاري تجهيز طلبك…  /  Finalizing your order… | Key `ordersFinalizingTitle`, MyOrdersView.tsx:237, same gate. No order is being finalised while the seller has not decided. |
| `src/components/DesktopLiveAuctionLayout.tsx:794` | ar | مبروك 🎉 ربحت المزاد | Branch gate is `isUserWinner` = I bid on this lot AND activeAuction.currentBidderId === me, under `isEnded` (line 226: status==='completed' OR endTime <= now). Purely top-bidder-at-close; no reserve o… |
| `src/components/DesktopLiveAuctionLayout.tsx:794` | en | Congratulations! You won the auction | Same gate as the Arabic. |
| `src/components/DesktopLiveAuctionLayout.tsx:797` | ar | الطلب صار بانتظار الدفع/التأكيد | Asserts order creation at close. Under Phase 1 the order is created only after the seller accepts; on a pending-seller or below-floor close there is no order. |
| `src/components/DesktopLiveAuctionLayout.tsx:797` | en | The order is pending payment/confirmation | Same premature order assertion. |
| `src/components/DesktopLiveAuctionLayout.tsx:817` | both | عرض الطلب  /  View Order | Button handler (lines 808-814) looks up a matching order and falls through to the orders view whether or not one exists. At a pending-seller close it lands the bidder on an empty orders screen. |
| `src/components/DesktopLiveAuctionLayout.tsx:860` | ar | الفائز: ${activeAuction.currentBidderName} بقيمة ${activePrice} د.أ | Rendered to spectators the moment the timer hits zero, purely from currentBidderName/currentPrice. Post-Phase-1 that person is not yet the winner and that price is not yet a sale price; the seller may… |
| `src/components/DesktopLiveAuctionLayout.tsx:860` | en | Winner: ${activeAuction.currentBidderName} at ${activePrice} JOD | Same — a winner is declared before the seller decision exists. |
| `src/components/LiveStreamView.tsx:290` | ar | السعر النهائي | Rendered at close over `activePrice`. Nothing is final at close post-Phase-1 — the seller can reject, and below the tolerance floor no sale occurs at all. Note the pair diverges in substance: the Engl… |
| `src/components/LiveStreamView.tsx:290` | en | Winning Bid | Declares a winning bid at close, before the seller decision. Substantively different wording from its Arabic pair ('السعر النهائي' = the final price). |
| `src/components/LiveStreamView.tsx:280` | en | Winner | The Arabic of the very same label (line 280) says 'المزايد الأعلى' — 'the highest bidder' — which stays TRUE after Phase 1. The English says 'Winner', which does not. Same element, two different claim… |
| `src/components/DiscoveryFeedView.tsx:342` | both | 🎉 عرض الطلب  /  🎉 View order | Gated on `isEndedWinner` (lines 169-174): ended + I am currentBidderId + I bid. No order or seller-decision check — the celebratory 🎉 plus 'view order' fires on every pending-seller close. |
| `src/context/AppContext.tsx:3536` | code | 🏆 Winning Bid Placed | Hardcoded English title (not language-switched — Arabic users see this string too) on the in-app notification fired on every successful bid. 'Winning Bid' asserts an outcome that Phase 1 makes conditi… |
| `functions/messageCopy.js:101` | ar | فزت بالمزاد 🎉 | The `auction_won` event copy is unconditional. It carries no notion of a seller decision, so if the emit site still fires it at close (as it does today) it declares a win during the pending-seller win… |
| `functions/messageCopy.js:101` | ar | مبروك! ربحت "${t}". المبلغ المستحق ${d.totalDue || ''} د.أ. | States an amount as owed. During a pending-seller window nothing is owed, and below the tolerance floor nothing ever will be. |
| `functions/messageCopy.js:52` | en | You won the auction 🎉 | English `auction_won` title, same unconditional emit as the Arabic. |
| `functions/messageCopy.js:52` | en | Congratulations — you won "${t}". Amount due ${d.totalDue || ''} JOD. | Declares a debt before the seller has accepted. |
| `functions/messageCopy.js:102` | ar | يرجى دفع "${t}" خلال ${d.paymentHours || 24} ساعة. | `payment_due` defaults paymentHours to 24 with no reference to when the clock starts. Fired at close it collides with the seller's own 24h window. |
| `functions/messageCopy.js:53` | en | Please pay for "${t}" within ${d.paymentHours || 24} hours. | Same ambiguity about which 24h window is running. |
| `functions/emailCopy.js:261` | ar | مبروك! فزت بمزاد ${t} | Unconditional win declaration in the subject — the one string that reaches the bidder's inbox and phone lock screen without them opening anything. No seller-decision branch exists in CONTENT_AR. |
| `functions/emailCopy.js:262` | ar | مبروك، لقد فزت 🎉 | Email heading, unconditional. |
| `functions/emailCopy.js:263` | ar | فزت بالمزاد. أكمل الدفع خلال المهلة المحددة ليُحجز لك المنتج. | Two false claims post-Phase-1: that you won, and that paying reserves the item. During a pending-seller window there is nothing to pay and the item is not yours to reserve. |
| `functions/emailCopy.js:264` | ar | أكمل الدفع | Email CTA button pointing at a payment that may not exist yet. |
| `functions/emailCopy.js:373` | en | Congratulations! You won ${t} | Unconditional; mirrors the Arabic. |
| `functions/emailCopy.js:378` | en | You won the auction. Complete payment within the payment window and the item is reserved for you. | Same two false claims as the Arabic intro — a win and a reservation mechanism that Phase 1 moves behind the seller's decision. |
| `functions/emailCopy.js:384` | en | Your auction is awaiting payment. Send the transfer by CliQ before the payment window closes, then upload a ph… | `payment_due` email. Sent at close it instructs a real bank transfer for a lot the seller has not accepted — the highest-consequence string in this set, because CliQ transfers are not reversible in-ap… |
| `functions/emailCopy.js:273` | ar | مزادك بانتظار الدفع. أكمل التحويل عبر كليك قبل انتهاء المهلة، ثم ارفع صورة الإيصال في التطبيق. | Same as its English pair — instructs an irreversible bank transfer that may precede any seller acceptance. |
| `src/landing/translations.ts:284` | ar | بمجرد انتهاء الوقت لصالح المزايد الأعلى، نضمن لك الدفع الآمن ونرتب عملية نقل الملكية بكل سلاسة. | This is the marketing description of exactly the moment Phase 1 changes. Timer end no longer resolves 'in the highest bidder's favour'; it hands the decision to the seller, or closes the lot with noth… |
| `src/landing/translations.ts:514` | en | Once the timer ends on the highest bid, we secure payment and guide both parties through seamless ownership tr… | Describes the pre-Phase-1 flow. Omits the seller decision entirely and omits the silent-close-below-floor outcome. |
| `src/components/HowItWorksView.tsx:68` | en | Winning price + 5% buyer's premium — via CliQ to Mazzado (Al Ahli Bank) within 24 hours. | Same collapsed win→pay step under the heading 'Win & pay'. |
| `src/components/OnboardingModal.tsx:87` | en | Bidding is free — you only pay if you win: the final price + 5% buyer's premium via CliQ within 24 hours. If y… | Same missing third and fourth outcomes, plus 'the final price' presupposes a price that is settled at close. |
| `src/components/AuctionDetailsModal.tsx:314` | en | Awesome! You're in the running. If you win, you pay the final price + 5% buyer's premium via CliQ within 24 ho… | Same as the Arabic pair, plus 'the final price' asserts finality at close. |
| `functions/emailCopy.js:259` | code | const CONTENT_AR = { | functions/messageCopy.js:60 and :109 already carry a correct Phase-1 'your bid is with the seller' message for in-app/push/WhatsApp. The email layer has no equivalent, so the one bidder-facing channel… |
| `src/landing/translations.ts:276` | ar | ارفع الصور الحقيقية، حدد السعر الأدنى الذي تقبله، وأدرج سلعتك في دقائق معدودة. | BOTH SWEEPS ARE WRONG ON THEIR HEADLINE FINDING. Sweep 1's notes assert «ZERO hits in buyer-facing copy» for the reserve concept and conclude the product has no public notion of a reserve at all. It d… |
| `src/landing/translations.ts:506` | en | Upload real pictures, set your reserve price, and list in minutes. | Same as line 276, and blunter: the English says the word "reserve" in plain text on the public landing page. Sweep 1 searched src/content/, src/utils/dropCaption.ts, docs/legal/ and HowItWorksView.tsx… |
| `src/landing/LandingView.tsx:2243` | en | Seller accepts the winning bid | Two defects in one string. (a) Phase 1: this is EXACTLY the moment that becomes a real 24-hour decision, and the diagram presents it as a fait accompli with no window, no possibility of decline, and n… |
| `src/landing/LandingView.tsx:2244` | ar | يتم تحديد العرض الأعلى الفائز بالمزاد رسمياً. | After Phase 1 nothing is officially determined at that point — the top bid becomes a candidate offer put to the seller, or (below the tolerance floor) nothing at all. «رسمياً» is the strongest finalit… |
| `functions/messageCopy.js:103` | ar | ما زال "${t}" بانتظار الدفع. بادر قبل انتهاء المهلة. | Both sweeps flagged `auction_won` and `payment_due` and missed `payment_reminder` entirely, in both files and both languages. It has the same defect and a worse tone: it asserts an outstanding debt an… |
| `functions/emailCopy.js:279` | ar | ما زال طلبك بانتظار الدفع. إذا انتهت المهلة دون دفع يُلغى الطلب وقد يُقيَّد حسابك عن المزايدة. | The highest-consequence string that BOTH sweeps missed. Sweep 2 correctly named emailCopy.js:273/:384 (payment_due) as the worst item because it instructs an irreversible CliQ transfer — but payment_r… |
| `src/hooks/useSocialProof.ts:119` | code | where('status', 'in', ['completed', 'ended', 'closed']), | 'ended' means UNSOLD. functions/settlement.js:89-90 defines exactly two closing shapes: 'completed' = sold with the reserve met, and 'reserve_not_met' = real bids and a winner but under the bar; src/h… |
| `src/landing/LandingView.tsx:2136` | ar | مهلة الدفع بعد الفوز | Part of the 24-collision, on the public page, and missed by both sweeps. The anchor here is «بعد الفوز» — the correct one, matching HowItWorksView.tsx:121 and opposing auctionRules.ts:30 / legalTerms.… |
| `src/components/MyOrdersView.tsx:271` | ar | عند فوزك بمزاد سيظهر طلبك هنا مع تفاصيل الدفع عبر كليك. | This is the screen a pending-seller bidder is DUMPED ON. DesktopLiveAuctionLayout.tsx:817 «عرض الطلب» / 'View Order' and DiscoveryFeedView.tsx:342 «🎉 عرض الطلب» both route to the orders view whether … |
| `src/components/HowItWorksView.tsx:81` | ar | ابعت تفاصيل المنتج (أو خلينا ندرجه لك) ← فريقنا بيراجع ويوافق ← ينزل للمزاد ← عمولة بائع ٥٪ عند البيع. | The SELLER-side structural gap, which neither sweep looked for — both audited the buyer's journey only. Phase 1 gives the seller a brand-new obligation with a hard 24-hour deadline and a consequence f… |
| `index.html:112` | en | "paymentAccepted": "Bank Transfer, CliQ, Credit Card", | Not a Phase-1 conflict — a pre-existing false promise the metadata sweep was supposed to catch and neither sweep checked. The platform accepts CliQ only, with an uploaded receipt an admin verifies. Th… |
| `functions/index.js:3483` | ar | انتهت مهلة قبول هذا العرض. | Two defects. (a) It is never shown: src/components/SellerCenterView.tsx:785-793 (`handleAcceptBelowReserve`) awaits `acceptBelowReserve(auctionId)` in a try/finally with NO catch and no toast, so the … |

## صياغة ثانوية (12)

| الملف | اللغة | النص | لماذا يصبح غير صحيح |
|---|---|---|---|
| `src/utils/dropCaption.ts:17` | ar | والرابح الحقيقي هو الأسرع والأذكى بالمزايدة | Hype rather than a term, but it reinforces exactly the mental model Phase 1 breaks: after the change the fastest, smartest, highest bidder can still end up with nothing because a seller declined or th… |
| `src/components/HowItWorksView.tsx:121` | both | كليك (CliQ) إلى حساب مزادو في البنك الأهلي — للعضوية وللدفع بعد الفوز (خلال ٢٤ ساعة من الفوز). | Pre-existing inconsistency that Phase 1 turns load-bearing: this FAQ anchors the 24h to «الفوز» while auctionRules.ts:30 and legalTerms.ts:68 anchor the same 24h to «إغلاق المزاد». Today those two mom… |
| `src/components/DiscoveryFeedView.tsx:278` | en | Winning | The Arabic of the same badge says 'أنت الأعلى' — 'you are the highest' — which remains accurate post-Phase-1. The English asserts winning, which no longer follows from being highest. |
| `src/components/feedback/BidConfirm.tsx:185` | en | 🔥 You're winning! | Arabic pair on the same line is '🔥 أنت الأعلى الآن!' — 'you're the highest now' — which stays true. The English overstates it into a win claim that Phase 1 breaks. |
| `src/components/DesktopLiveAuctionLayout.tsx:835` | both | تم تجاوز مزايدتك — زايد الآن لاستعادة الصدارة  /  You've been outbid — bid again to take the lead | Rendered inside the `isEnded` branch — the auction is already over and no bid can be placed. Already wrong today; Phase 1 makes the post-close moment even more sensitive because a runner-up may in fac… |
| `src/components/feedback/BidConfirm.tsx:140` | both | هذه المزايدة مُلزِمة.  /  This bid is binding. | Still literally true, but after Phase 1 the binding becomes materially one-sided and open-ended: the bidder is committed while the seller holds a 24h option to accept or walk. The bidder is not told t… |
| `src/components/DesktopLiveAuctionLayout.tsx:1045` | ar | لم يصل السعر الاحتياطي بعد | Not false, and it leaks no amount — but it does not match the Arabic used for the same state on mobile ('لم يُبلغ الاحتياطي', MobileAuctionView.tsx:532). Two different Arabic phrasings for one of only… |
| `src/components/MobileAuctionView.tsx:532` | ar | لم يُبلغ الاحتياطي | Accurate and leak-free, but diverges in wording from the desktop's 'لم يصل السعر الاحتياطي بعد' for the identical state. Worth unifying before the badge carries more weight. |
| `src/components/SoldOrdersList.tsx:90` | both | مبلغ المزايدة الرابحة  /  WINNING BID AMOUNT | Seller-centre label. Fine once a sale exists, but it is the same vocabulary the buyer surfaces use for a not-yet-decided lot; if this list ever renders a pending-seller lot it declares a win on the se… |
| `src/components/SellerCenterView.tsx:112` | both | reserve_not_met: { ar: 'لم يتحقق السعر', en: 'Reserve not met' }, | Sweep 2 reported the reserve badge wording as a two-way inconsistency (desktop «لم يصل السعر الاحتياطي بعد» vs mobile «لم يُبلغ الاحتياطي»). It is at least a FIVE-way inconsistency and the sweep found… |
| `src/components/SoldOrdersList.tsx:153` | ar | عند رسو مزاداتك على فائز حقيقي، ستظهر تفاصيل وحالة الدفع والشحن في هذا التبويب فوراً. | Two problems. (a) Phase 1: «رسو» is the fall of the hammer and «فوراً» is immediate — after the change there is no hammer-fall for a pending lot and the detail cannot be immediate, because it waits on… |
| `src/content/legalTerms.ts:200` | ar | آخر تحديث للشروط: آب ٢٠٢٦ | A tripwire for the rewrite itself, missed by both sweeps. The comment above it (lines 196-198) says the old footnote was a hardcoded date "in a file with no mechanism to keep it true" and claims this … |

## داخلي فقط (1)

| الملف | اللغة | النص | لماذا يصبح غير صحيح |
|---|---|---|---|
| `src/components/admin/OurDropsSection.tsx:315` | both | السعر النهائي المبيع:   /  Winning Bid: | Admin-only surface, and the Arabic and English differ in substance (AR: 'final sold price', EN: 'winning bid'). No customer reads it, so it is not a Phase-1 blocker — listed for completeness. |

---

## الملفات المعنية

| الملف | عدد البنود |
|---|---|
| `src/utils/translations.ts` | 10 |
| `functions/emailCopy.js` | 10 |
| `src/components/DesktopLiveAuctionLayout.tsx` | 9 |
| `functions/messageCopy.js` | 8 |
| `src/content/auctionRules.ts` | 5 |
| `src/content/legalTerms.ts` | 5 |
| `src/utils/dropCaption.ts` | 4 |
| `src/components/HowItWorksView.tsx` | 4 |
| `src/landing/translations.ts` | 4 |
| `src/components/feedback/WinCelebration.tsx` | 3 |
| `src/components/LiveStreamView.tsx` | 3 |
| `src/landing/LandingView.tsx` | 3 |
| `src/components/OnboardingModal.tsx` | 2 |
| `src/components/AuctionDetailsModal.tsx` | 2 |
| `docs/legal/terms-of-use.md` | 2 |
| `src/components/DiscoveryFeedView.tsx` | 2 |
| `src/components/feedback/BidConfirm.tsx` | 2 |
| `src/components/SoldOrdersList.tsx` | 2 |
| `src/components/SellerCenterView.tsx` | 2 |
| `src/context/AppContext.tsx` | 1 |
| `src/components/MobileAuctionView.tsx` | 1 |
| `src/components/admin/OurDropsSection.tsx` | 1 |
| `src/hooks/useSocialProof.ts` | 1 |
| `src/components/MyOrdersView.tsx` | 1 |
| `index.html` | 1 |
| `functions/index.js` | 1 |

