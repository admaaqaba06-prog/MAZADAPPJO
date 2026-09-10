# PHASE 1 — خطة الترحيل وقرارات P0

> **لم يُعدَّل أي منطق إنتاجي. لا يزال هذا تدقيق قراءة فقط.**
> كل ما دون مُتحقَّق منه بفتح الملف، لا من ملخّص وكيل.

---

## ⚠️ أولاً: لا أستطيع تنفيذ إحصاء الإنتاج بنفسي

طلبت أرقاماً من قاعدة البيانات الحيّة. قراءة Firestore الإنتاجي تحتاج **مفتاح حساب خدمة** (`GOOGLE_APPLICATION_CREDENTIALS`) — وهو غير مُهيّأ، **وتوليده أو التعامل معه ليس من صلاحياتي**.

كتبتُ لك السكربت بدلاً من ذلك: [`scripts/admin/phase1-census.cjs`](MAZADAPPJO-main/scripts/admin/phase1-census.cjs).

**لا يوجد فيه أي مسار كتابة إطلاقاً** — تحققت: مطابقات `.set(` الوحيدة فيه هي `Map.set()` في الذاكرة، ولا يوجد `--apply` ولا batch ولا delete. ويرفض العمل بلا مفتاح.

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
node scripts/admin/phase1-census.cjs
```

يجيب أسئلتك الأربعة حرفياً، ويضيف سؤالاً خامساً: **هل توجد سجلات أصلاً في الحالات التي ستنشئها المرحلة ١؟** لأن الجواب يغيّر الخطة كلياً.

**السطر الأهم في مخرجاته** هو Q4: يقيس مهلة كل طلب `waiting_payment` مقابل **كلا** المرساتين ويقول أيهما تطابق. هذا يجيب سؤالك «هل تعتمد الطلبات التاريخية على `endTime + 24h`؟» **بالقياس لا بالافتراض**.

---

## ١. جدول الحالات الكامل

### حالات المزاد

| الحالة | المالك | المعنى | تُنشئ طلباً؟ | دفع مستحق؟ | يراها المشتري؟ | يراها البائع؟ | بيع؟ |
|---|---|---|---|---|---|---|---|
| `upcoming` | نظام | مجدول لم يبدأ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `live` | نظام | مفتوح للمزايدة | ❌ | ❌ | ✅ | ✅ | ❌ |
| `processing` | أدمن | قيد المراجعة | ❌ | ❌ | ❌ | ✅ | ❌ |
| `rejected` | أدمن | مرفوض إدراجه | ❌ | ❌ | ❌ | ✅ | ❌ |
| **`pending_seller`** 🆕 | **بائع** | **أغلق بمزايدة صالحة، بانتظار قراره ٢٤س** | ❌ | ❌ | ✅ | ✅ | ❌ |
| `completed` | نظام | **بيع رسمي** (المعنى يضيق) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ended` | نظام | أغلق بلا بيع | ❌ | ❌ | ✅ | ✅ | ❌ |
| `reserve_not_met` | نظام | دون الحد، عرض مفتوح أو لا | ❌ | ❌ | ✅ | ✅ | ❌ |

### حالات العرض (`belowReserveOffer` — الشكل موجود بالكامل)

| الحالة | المالك | المعنى | تُنشئ طلباً؟ | دفع؟ | بيع؟ |
|---|---|---|---|---|---|
| `pending_seller` | بائع | بانتظار قراره | ❌ | ❌ | ❌ |
| `pending_buyer` | مشترٍ | **قَبِل تحت الحد** — مسار ب فقط | ✅ معلّق | ❌ | ليس بعد |
| `confirmed` | نظام | البيع تام | ✅ | ✅ | ✅ |
| `declined` | أيّهما | رُفض (الطابع الزمني يميّز مَن) | ❌ | ❌ | ❌ |
| `expired` | نظام | انقضت المهلة | ❌ | ❌ | ❌ |

### حالات الطلب — ١٢، من `orderStatusGlossary.ts`

| الحالة | المالك | دفع مستحق؟ | يجوز الشحن؟ | بيع؟ |
|---|---|---|---|---|
| `pending_buyer_confirmation` | مشترٍ | ❌ **بلا مهلة عمداً** | ❌ | ليس بعد |
| `waiting_payment` | مشترٍ | ✅ | ❌ | ✅ |
| `paid` | نظام | مدفوع | ✅ **من هنا يبدأ الشحن** | ✅ |
| `preparing_shipment` | بائع/أدمن | ✅ | ✅ | ✅ |
| `out_for_delivery` · `shipped` | مندوب | ✅ | ✅ | ✅ |
| `delivered` | مشترٍ | ✅ | — | ✅ |
| `completed` | نظام | اكتمل وحُرِّر المال | — | ✅ |
| `disputed` · `cancelled` · `refunded` · `defaulted` | — | ❌ | ❌ | ❌ |

---

## أ. آلة الحالات الإنتاجية الحالية

```
live ──(cron كل دقيقة)──► settleAuctionTxn
                              │
        ┌─────────────────────┼─────────────────────┐
   لا مزايدات            دون الحد               فوق الحد
        │                     │                     │
     'ended'         'reserve_not_met'         'completed'
                              │                     │
                     ┌────────┴────────┐    طلب waiting_payment
                داخل النطاق        خارجه       + مهلة من الآن
                     │                │        + auction_won
              belowReserveOffer   لا شيء       + payment_due
                'pending_seller'                     │
                     │                          مدفوع → شحن
        ┌────────────┼────────────┐
   acceptBelowReserve  reject   expire
        │                │         │
   'pending_buyer'   'declined' 'expired'
   طلب pending_buyer_
   confirmation
   ⚠️ بلا مهلة
        │
   ┌────┴────┐
 confirm   decline
   │          │
'confirmed' 'declined'
waiting_payment
+ مهلة من التأكيد
```

**⚠️ عيبان قائمان في المخطط أعلاه، لم تسبّبهما المرحلة ١:**

1. **المزاد يبقى `reserve_not_met` إلى الأبد** — لا `acceptBelowReserve` ولا `confirmBelowReserve` يلمس `auction.status`. فبيعة تحت الحد مكتملة ومدفوعة يبقى مزادها مكتوباً عليه «لم يبلغ الحد». نتيجته: **مشتريها لا يرى احتفال فوز أبداً**، ولا تُحتسب في الدليل الاجتماعي.
2. **`repairEndedAuctionOrder` غير معاملاتي** — قراءات عادية ثم `await orderRef.set()`.

## ب. آلة المرحلة ١

الفارق الوحيد عن (أ): **`completed` لا تُكتب عند الإغلاق.**

```
live ──► settleAuctionTxn
            │
   ┌────────┼────────┬──────────────┐
لا مزايدات  دون النطاق   مزايدة صالحة
   │          │              │
'ended'  'reserve_not_met'  'pending_seller' 🆕
                             belowReserveOffer.status='pending_seller'
                                    │
        ┌───────────────┬───────────┴────┬──────────────┐
   يقبل فوق الحد    يقبل دون الحد      يرفض        تنقضي المهلة
        │               │                │              │
  offer='confirmed'  offer='pending_    offer=       offer='expired'
  auction='completed'  buyer'          'declined'   auction='ended'
  طلب waiting_payment  طلب pending_    auction=
  مهلة = القبول ✅     buyer_confirm.   'ended'
        │               │  (بلا مهلة)
        │          ┌────┴────┐
        │       confirm    decline
        │          │          │
        │   offer='confirmed'  لا بيع
        │   auction='completed' ◄── يصلح العيب ١
        │   waiting_payment
        │   مهلة = التأكيد ✅
        └──────────┴──► مدفوع → تجهيز → شحن → تسليم → مكتمل
```

### ما يصلح مجاناً

| السطح | لماذا يصحّ تلقائياً |
|---|---|
| `useWinDetection` (`WinCelebration.tsx:52`) | يُطلق على **الانتقال** إلى `completed`. وهذه لن تُكتب إلا عند القبول ⟹ **صفر تعديل** |
| لافتة الفوز في Discover (`DiscoveryFeedView.tsx:1109`) | مشروطة بـ`o.status === 'waiting_payment'` والطلب لن يوجد قبل القبول |
| مهلة الدفع | `paymentDeadlineFromNow` مرساتها **إنشاء الطلب**. ينتقل الإنشاء ⟹ تنتقل المهلة. **بلا أي حساب جديد** |
| `SoldOrdersList` · `ProfileView:152` | مبنية على الطلبات أصلاً |

---

## ج. أثر الترحيل

**الفرضية المركزية — وهي قابلة للاختبار:** الحالة `pending_seller` **لا تُكتب إلا بتسويات تجري بعد النشر**. السجلات القائمة لا تمرّ بـ`settleAuctionTxn` مرة أخرى (يمنعها حارس `settledAt` الذي أضفناه في #292).

⟹ **إن صحّت، لا حاجة إلى backfill إطلاقاً.**

| السجل القائم | ماذا يحدث لحظة النشر |
|---|---|
| مزاد `live` يُغلق بعد النشر | **يسلك المسار الجديد** — هذا هو المقصود |
| `completed` + طلب `waiting_payment` | **لا شيء.** الطلب يكمل بمهلته الأصلية |
| `completed` + طلب `paid`/`shipped` | **لا شيء** |
| `reserve_not_met` + عرض `pending_seller` | **يستمر** — نفس العرض، نفس النداءات |
| طلب `pending_buyer_confirmation` | **يستمر بلا مساس.** لم نحذف شيئاً |
| عرض `declined`/`expired` | نهائي، لا يُلمس |
| `secondChanceOffer` حيّ | آلة منفصلة، لا تتأثر |
| `ended` بلا مزايدات | لا شيء |
| `defaulted` بانتظار إعادة إدراج | لا شيء |
| `autoRelist` مستحق | لا شيء |

**الاستثناء الوحيد المحتمل:** إن أظهر الإحصاء (Q5) مزادات تحمل `status='pending_seller'` **الآن** — فالفرضية باطلة وتلزم خطة أخرى. **لهذا كُتب Q5.**

**الحالة الوحيدة التي تصير غير متسقة:** المزادات `reserve_not_met` التي اكتمل بيعها (`offer='confirmed'`) ستبقى على `reserve_not_met` بينما المزادات الجديدة تصير `completed`. هذا **عيب قائم**، لا يُحدثه التغيير — لكنه سيصير مرئياً. **أوصي بتركه** وعدم ترحيل التاريخ.

---

## د. مخاطر P0 / P1 / P2 — والأجوبة التي طلبتها

### 🔴 P0-1 — شحن الأدمن. **الشرط المرجعي المطلوب**

المصدر ليس `currentBidderId` — بل [`OurDropsSection.tsx:281`](MAZADAPPJO-main/src/components/admin/OurDropsSection.tsx:281):

```js
auctions.filter(a => a.status === 'completed' ||
  (a.status === 'live' && a.endTime < Date.now()))
```

**الشقّ الثاني خطأ اليوم قبل المرحلة ١:** يُدرج مزاداً ما زال `live` وانقضى وقته فقط — أي **قبل أن يسوّيه الخادم أصلاً**. والـcron كل دقيقة، فهناك نافذة تظهر فيها قطعة في طابور الشحن بـ«فائز» قد لا ينجو من التسوية.

**وأسوأ:** الأسطر ٣٠١–٣٠٦ تُلفّق بيانات المندوب عند غياب سجل المستخدم:

```js
'+962 7 9888 1234'   'winner@example.com'   'Amman'
```

**رقم هاتف مختلق يُعرض للمندوب كعنوان تسليم.** هذا P0 مستقل عن المرحلة ١ كلياً.

> **الشرط المرجعي الذي أوصي به:** الأهلية تُشتقّ من **الطلب لا من المزاد** — يوجد `orders/{auctionId}` وحالته ضمن
> `['paid','preparing_shipment','out_for_delivery','shipped','delivered']`.
>
> `paid` هي البداية لأن آلة `orderWorkflow.ts:32` تعرّف `paid → preparing_shipment → shipped`، و`:70` تفرض أن `shipped` لا تأتي إلا من `preparing_shipment`. **لا شحن على `waiting_payment`** — ذاك شحن قبل الدفع.
>
> وعند غياب سجل المستخدم: **«غير معروف — لا تُرسل»**، لا رقم مختلق.

### 🔴 P0-2 — تحديد الفائز. **الواجهة المقترحة**

`isViewerWinner` (`bidMath.ts:38`) يجيب «هل أنا أعلى مزايد؟». **لا تُعِد تسميته** — بل أضف فوقه. أصغر واجهة آمنة:

```ts
isHighestBidder(auction, uid)        // = isViewerWinner الحالي. يبقى، بلا تغيير سلوك
isPendingSellerDecision(auction)     // status==='pending_seller' || offer.status==='pending_seller'
isOfficialWinner(auction, order, uid)// الطلب موجود && order.buyerId===uid && status ليست ملغاة
isPayableOrder(order)                // status==='waiting_payment' && paymentStatus==='unpaid'
```

**`isOfficialWinner` تشترط الطلب، لا حالة المزاد.** هذا يحقّق قاعدتك «لا تعتمد على `status==='completed'` وحده»، ويجعلها صحيحة للمسارين معاً — بما فيه المسار ب الذي لا يكتب `completed` اليوم.

### 🔴 P0-3 — الدليل الاجتماعي

[`useSocialProof.ts:117`](MAZADAPPJO-main/src/hooks/useSocialProof.ts:117):

```js
where('status', 'in', ['completed', 'ended', 'closed'])
```

ثم الفلتر الحقيقي الوحيد هو وجود `currentBidderId`.

**ثلاث ملاحظات مُتحقَّق منها:**
- `'closed'` **ليست حالة موجودة** — صفر تطابق في `types.ts`. قيمة ميتة.
- `'ended'` غير ضارّ **اليوم** فقط لأن `ended` تعني بلا مزايدات ⟹ بلا `currentBidderId`.
- **لكن بعد المرحلة ١** المزاد المرفوض/المنقضي سيصير `ended` **وهو يحمل `currentBidderId`** ⟹ **سيُعلَن بيعاً لم يقع.** هذا العطب سيُحدثه تصميمي، ولهذا أطرحه قبل التنفيذ.

> **الشرط المرجعي:** الاستعلام من **`orders`** لا من `auctions` — طلب في حالة مدفوعة فأعلى. البيع الحقيقي هو الطلب.

### 🔴 P0-4 — دلالات الأحداث

| الحدث المفهومي | موجود؟ | القناة اليوم | المشكلة |
|---|---|---|---|
| `auction_closed_top_bid` | ≈ `below_reserve_pending` | **داخل التطبيق فقط** | يصير الشيء الوحيد الذي يسمعه كل أعلى مزايد. **قرار منتج** |
| `seller_accepted_normal` | ❌ **غير موجود** | — | جديد كلياً |
| `seller_accepted_below_reserve` | ✅ `below_reserve_seller_accepted` | الكل | **الإيميل والتطبيق يتناقضان** |
| `buyer_confirmed` | ✅ `auction_won`+`payment_due` | الكل | صحيح |
| `buyer_declined` | ✅ `below_reserve_declined` | داخل التطبيق | صحيح |
| `seller_rejected` | ✅ نفس المفتاح | داخل التطبيق | صحيح |
| `seller_decision_expired` | ❌ **لا نصّ لأي طرف** | — | فجوة |
| `payment_due` · `payment_reminder` | ✅ | الكل | صحيح، لكن التوقيت ينزاح |

**التناقض المنشور الآن:** `below_reserve_seller_accepted` — الإيميل (`emailCopy.js:288`) «أكمل الدفع»، التطبيق والواتساب (`messageCopy.js:110`) «أكّد للشراء». **الصحيح هو التطبيق**: على المسار ب يوجد فعلاً تأكيد قبل الدفع. **الإيميل هو الخطأ.** لم أغيّر شيئاً — القرار لك.

**تحذير يمسّ اختيارك للكلمات:** `AppContext.tsx:2947` يصنّف الإشعارات بمطابقة العنوان لـ«مبروك»/«ربحت»/`won`. أي نصّ جديد يحوي «مبروك» سيُصنَّف فوزاً برمجياً.

### 🔴 P0-5 — انقضاء مهلة البائع. **مُتحقَّق: سليم بالفعل**

القبول بعد الانقضاء **يفشل ذرّياً**: الفحص داخل المعاملة (`index.js:3482`)، بعد حارس الحالة، وبعد قصر التكرار على `orderSnap.exists` (`:3475`). والقبول والرفض المتزامنان **لا يمكن أن يُثبَّتا معاً** — كلاهما يقرأ ويكتب نفس المستند فيُسلسلهما Firestore.

الناقص شيء واحد: `expireLapsedOffers` (نشرتُها اليوم) **تُنهي العرض لكن لا تلمس `auction.status`**. المرحلة ١ تحتاجها أن تكتب `ended` أيضاً.

### 🟠 P1
- `repairEndedAuctionOrder` غير معاملاتي
- `useMyAuctionLots.ts:59` يرشّح `['live','completed']` ⟹ **`pending_seller` تختفي عن المشتري**
- الحالات الثلاث مكرّرة يدوياً في ٥ مواضع
- `types.ts` (١١) ≠ `orderWorkflow.ts` (٩)

### 🟡 P2
- `'closed'` الميتة
- `RULES_VERSION` ⟵ **معلّقة بأمرك**

---

## هـ. الملفات

**خلفية:** `functions/index.js` (٣٢) · `settlement.js` (٤) · `messageCopy.js` (١١) · `emailCopy.js` (٧) · `notify.js` (٣) · `offerExpiry.js`
**منطق مشترك:** `bidMath.ts` · `orderStatusGlossary.ts` · `orderWorkflow.ts` · `reserveStatus.ts` · `approvalGuard.ts` · `types.ts`
**خطّافات:** `useMyAuctionLots.ts` · `useSocialProof.ts`
**واجهة:** `LiveStreamView` (٩) · `DesktopLiveAuctionLayout` (٦) · `DiscoveryFeedView` (٦) · `WinCelebration` (٥) · `MyOrdersView` (٤) · `SellerCenterView` · `MobileAuctionView` · `AuctionDetailsModal` · `admin/OurDropsSection` · `DesktopFrame`
**نصوص:** `translations.ts` (٨) · `auctionRules.ts` · `legalTerms.ts` · `HowItWorksView` · `landing/LandingView` · `dropCaption.ts`
**خارج المستودع:** `n8n/build-messages.js` + `webhook-receiver-v2.json` — **لصق يدوي في n8n Cloud**

## و. الاختبارات

سيناريوهاتك A–H، زائد: قبول+رفض متزامنان ⟵ واحد · قبول مكرر ⟵ طلب واحد · قبول بعد الانقضاء ⟵ فشل ذرّي · مهلة = `sellerAcceptedAt` (أ) و`buyerConfirmedAt` (ب) · **اختبار يمنع لمس الـ١٠٥ نصاً الصحيحة** · لا مسار يُنشئ طلباً قبل القبول · تعادل عربي/إنجليزي.

## ز. التراجع

**التغيير قابل للتراجع بالكامل ما دام لا backfill.**

الكود القديم يفهم كل الحالات القائمة. الخطر الوحيد: مزادات أُغلقت إلى `pending_seller` **بين النشر والتراجع** — الكود القديم لا يعرف هذه الحالة، فستعلق: لا تظهر للمشتري (`useMyAuctionLots`)، ولن يُعيد الـcron تسويتها (حارس `settledAt`).

> **التخفيف:** سكربت إصلاح صغير يحوّل أي `pending_seller` عالقة إلى `completed` + إنشاء طلبها (سلوك ما قبل المرحلة ١). **أكتبه مع التنفيذ لا بعده** — يُكتب أولاً ويُختبر قبل النشر.

---

## ما أحتاجه منك

1. **شغّل الإحصاء** وأرسل المخرجات. لن أنفّذ قبل رؤية Q5 خاصة.
2. **أقرّ الشروط المرجعية الثلاثة:** الشحن من الطلب · `isOfficialWinner` من الطلب · الدليل الاجتماعي من الطلبات.
3. **أيّهما المرجع** في تناقض «أكمل الدفع» / «أكّد للشراء»؟ (رأيي: التطبيق صحيح، الإيميل خطأ.)
4. **`below_reserve_pending`** — يبقى داخل التطبيق أم يُرقّى لواتساب؟

**واقف. لا تنفيذ قبل موافقتك.**
