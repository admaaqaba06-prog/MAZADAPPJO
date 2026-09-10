# PHASE 1 — آلة الحالات الكاملة

> **تدقيق قراءة فقط. لم يُعدَّل أي سطر.** ٦ مدقّقين متوازيين + ناقد، ٣٢٤ نتيجة موثّقة بـ`file:line`.
> **١٤٧** بند يجب تغييره · **١٠٥** بند **صحيح كما هو ويجب عدم لمسه** · ٤٠ إداري · ١٠ وثائق قانونية.
>
> الرقم الثاني هو الأهم: بعد المرحلة ١ لا يزال هناك **فائز** ولا يزال هناك **دفع** — لكن لاحقاً.
> استبدال كل كلمة «فائز» أعمى سيكسر ١٠٥ نصوص صحيحة.

---

## ١. حالات المزاد الحالية

`src/types.ts:123`

```
'upcoming' | 'live' | 'processing' | 'rejected' | 'completed' | 'ended' | 'reserve_not_met'
```

منها **ثلاث فقط** تخرج من التسوية (`functions/settlement.js`):

| الحالة | المعنى اليوم | تُكتب في |
|---|---|---|
| `completed` | بيع تام + طلب موجود | `settlement.js:144` ← `index.js:550` |
| `reserve_not_met` | مزايدة موجودة لم تبلغ الحد | `settlement.js:137,153` ← `index.js:627` |
| `ended` | بلا مزايدات | `settlement.js:158` ← `index.js:680` |

**ونفس السلاسل الثلاث مكرّرة يدوياً في ٥ مواضع أخرى يجب أن تتحرك معاً.**

## ٢. حالات الطلب الحالية

`src/utils/orderStatusGlossary.ts` — مصدر واحد، ١٢ قيمة، بنصوص عربية/إنجليزية جاهزة:

```
pending_buyer_confirmation · waiting_payment · paid · preparing_shipment
out_for_delivery · shipped · delivered · completed · disputed · cancelled
refunded · defaulted
```

آلة الانتقالات في `src/utils/orderWorkflow.ts:23`. **لا توجد حالة «بانتظار البائع»** — وهذا صحيح: تلك الحالة تخصّ **المزاد** لا الطلب، لأن الطلب يجب ألّا يوجد أصلاً قبل موافقة البائع.

⚠️ **تضارب قائم موثّق في الكود نفسه:** `types.ts` فيه ١١ قيمة و`orderWorkflow.ts` فيه ٩ — ناقصه `pending_buyer_confirmation` و`defaulted`. الـglossary هو الاتحاد الصحيح.

## ٣. عرض البائع — الشكل موجود بالكامل مسبقاً

`src/types.ts:181-202` — `belowReserveOffer`:

```ts
{ topBid, topBidderId, topBidderName, expiresAt,
  status: 'pending_seller' | 'pending_buyer' | 'confirmed' | 'declined' | 'expired',
  sellerAcceptedAt?, sellerRejectedAt?, buyerConfirmedAt?, buyerDeclinedAt? }
```

**هذا بالضبط ما تحتاجه المرحلة ١، بحذافيره.** كل الطوابع الزمنية المطلوبة موجودة — بما فيها `sellerAcceptedAt` الذي يحتاجه البند ٨ من بريفك. الناقص الوحيد: أنه يُختم **فقط** للقطع تحت الحد الأدنى داخل نطاق التسامح.

---

## ٤. أين يُنشأ الطلب اليوم — أربعة مواضع

| # | الموضع | معاملة؟ | حالة الطلب | مهلة الدفع |
|---|---|---|---|---|
| ١ | `settleAuctionTxn` `index.js:562` | ✅ | `waiting_payment` | **عند الإغلاق** |
| ٢ | `repairEndedAuctionOrder` `index.js:3383` | ❌ **غير معاملاتي** | `waiting_payment` | لحظة الإصلاح |
| ٣ | `acceptBelowReserve` `index.js:3506` | ✅ | `pending_buyer_confirmation` | **بلا مهلة إطلاقاً** |
| ٤ | `respondToSecondChance` `secondChanceRespond.js:222` | ✅ | `waiting_payment` | معرّف `{id}__sc` منفصل |

`confirmBelowReserve` **لا يُنشئ شيئاً** — يحوّل الطلب المعلّق إلى `waiting_payment` (`index.js:3759`).

## ٥. مهلة الدفع — الآلية صحيحة أصلاً 🎯

`paymentDeadlineFromNow` (`index.js:74`) = **`Date.now()` + النافذة**، مرساتها **لحظة إنشاء الطلب** — وليست `auction.endTime` أبداً.

**نتيجتان مهمّتان:**

1. **البند ٨ في بريفك يتحقق تلقائياً.** بنقل إنشاء الطلب من الإغلاق إلى القبول، ترتبط المهلة بـ`sellerAcceptedAt` **بلا أي تعديل حسابي**. صفر حسابات جديدة على مسار المال — وهذا أأمن ما يمكن.

2. **سؤالك عن المسار تحت الحد الأدنى، مُجاباً من الكود لا بالتخمين:** `acceptBelowReserve` يكتب الطلب **بلا `paymentDeadlineAt`** عمداً (تعليق صريح في `index.js:3505`)، و`confirmBelowReserve:3762` يستدعي نفس الدالة عند التأكيد. ⟹ **المسار ب مرساته `buyerConfirmedAt` بالفعل. لا تغيير مطلوب.**

---

## ٦. آلة الحالات المقترحة

```
                          LIVE
                            │
                    ┌───────┴───────┐
                    │ إغلاق المزاد  │
                    └───────┬───────┘
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   بلا مزايدات        تحت أرضية التسامح      مزايدة صالحة
        │                   │                   │
     'ended'        'reserve_not_met'    'pending_seller'  ◄── جديدة
    (لا تغيير)      بلا عرض، بلا إشعار           │
                                                 │
                                    ┌────────────┴────────────┐
                                    │  عرض بانتظار البائع ٢٤س  │
                                    └────────────┬────────────┘
                    ┌──────────────┬─────────────┴──────┬──────────────┐
                    │              │                    │              │
              يقبل (فوق الحد)  يقبل (تحت الحد)         يرفض        تنتهي المهلة
                    │              │                    │              │
            offer='confirmed'  offer='pending_buyer' offer='declined' offer='expired'
            status='completed' status يبقى معلقاً    status='ended'  status='ended'
                    │              │                    │              │
              طلب waiting_payment  طلب pending_buyer_   لا بيع        لا بيع
              مهلة = القبول        confirmation         لا طلب        لا طلب
                    │              │  (بلا مهلة)        لا دفع        لا دفع
                    │       ┌──────┴──────┐
                    │   المشتري يؤكد   المشتري يرفض
                    │       │              │
                    │  offer='confirmed'  offer='declined'
                    │  status='completed'  لا بيع
                    │  waiting_payment
                    │  مهلة = التأكيد
                    └──────┬──────┘
                          مدفوع → تجهيز → توصيل → مكتمل
```

**قرار التصميم الأساسي: `completed` تعني «بيع رسمي» فقط، وتُكتب فقط عند اللحظة التي يصبح فيها الطلب واجب الدفع.**

### لماذا هذا يصلح نصف المشكلة مجاناً

`useWinDetection` (`WinCelebration.tsx:52-61`) يُطلق الاحتفال على **الانتقال** إلى `completed` مع `currentBidderId === me`. إذا صارت `completed` تُكتب فقط عند قبول البائع، **يصبح هذا الخطّاف صحيحاً بصفر تعديلات** — تنتقل الكونفيتي إلى اللحظة الصحيحة تلقائياً.

وكذلك لافتة «CONGRATULATIONS! YOU WON» في `DiscoveryFeedView.tsx:1109` مشروطة بـ`o.status === 'waiting_payment'` — وبما أن الطلب لن يوجد قبل القبول، **تصحّ تلقائياً**.

### ⚠️ لكن انتبه — تناقض قائم اكتشفته

**لا `acceptBelowReserve` ولا `confirmBelowReserve` يغيّر `auction.status` إطلاقاً.** المزاد يبقى `reserve_not_met` **حتى بعد بيع تحت الحد الأدنى مكتمل ومدفوع**. النتيجة اليوم:

- مشتري «تحت الحد» **لا يرى احتفال فوز أبداً**
- `useSocialProof` لا يحتسبه بيعة

فإن جعلنا `completed` علامةَ الفوز الرسمي، **يجب أن يكتبها المسار ب أيضاً عند تأكيد المشتري** — وإلا بقي المساران متباعدين.

---

## ٧. الانتقالات — الأسئلة العشرة

| الانتقال | منشور؟ | ١ يغيّره؟ | يراه المشتري؟ | يُنشئ طلباً؟ | يوجب دفعاً؟ | يُشعِر؟ | يمكن أن يتسابق؟ |
|---|---|---|---|---|---|---|---|
| إغلاق → `completed` | ✅ | 🔴 **يُلغى** | نعم | ✅ | ✅ | `auction_won`+`payment_due` | معاملاتي |
| إغلاق → `pending_seller` | ❌ جديد | 🔴 **جديد** | نعم | ❌ | ❌ | جديد | — |
| إغلاق → `reserve_not_met` | ✅ | يبقى | لا | ❌ | ❌ | `below_reserve_offer` | معاملاتي |
| إغلاق → `ended` | ✅ | يبقى | لا | ❌ | ❌ | لا شيء | معاملاتي |
| `acceptBelowReserve` | ✅ | يبقى كما هو | نعم | ✅ معلّق | ❌ | `below_reserve_seller_accepted` | ✅ آمن |
| `confirmBelowReserve` | ✅ | + يكتب `completed` | نعم | يحوّله | ✅ | `auction_won`+`payment_due` | ✅ آمن |
| `declineBelowReserve` | ✅ | يبقى | نعم | يلغيه | ❌ | `below_reserve_declined` | ✅ آمن |
| `rejectBelowReserve` | ✅ | يُعمَّم | نعم | ❌ | ❌ | ينقص نص | ✅ آمن |
| انتهاء المهلة | ✅ | يُعمَّم | نعم | ❌ | ❌ | **ينقص نص** | sweep |
| `repairEndedAuctionOrder` | ✅ | 🔴 **غير معاملاتي** | لا | ✅ | ✅ | `auction_won` | ❌ **لا** |

**السباقات — مُتحقَّق منها:** `acceptBelowReserve` و`rejectBelowReserve` **لا يمكن أن يُثبَّتا معاً**: كلاهما يقرأ ويكتب نفس مستند المزاد داخل معاملة، فيُسلسلهما Firestore ويسقط الخاسر على حارس حالته. والقبول المكرّر لا يُنشئ طلبين: المعرّف حتمي (`orders/{auctionId}`) و`orderSnap.exists` يقصره (`index.js:3475`).

**الاستثناء الوحيد:** `repairEndedAuctionOrder` **ليس معاملاتياً** — قراءات عادية ثم `await orderRef.set()`. أداة أدمن نادرة، لكنها الثغرة الوحيدة الباقية.

---

## ٨. التناقضات

### 🔴 ١ — لا يوجد أي مُحدِّد فوز موحّد

المشترك الوحيد `isViewerWinner` (`bidMath.ts:38`) يجيب سؤالاً مختلفاً: «هل أنا أعلى مزايد؟» — بلا أي إشارة إلى الحالة أو التسوية أو قرار البائع أو وجود طلب. وكل ما عداه يعيد الاشتقاق محلياً، **وكل تلك الاشتقاقات تصير صحيحة لحظة الإغلاق**.

ومحفّزان مختلفان مستعملان عبر الكود: `status === 'completed'` و`endTime <= now` — **والثاني يُطلق قبل أن يسوّي الخادم أي شيء**، فبعض الشاشات تعلن فائزاً **قبل الخادم اليوم**.

### 🔴 ٢ — الدليل الاجتماعي ينشر بيوعاً لم تحدث

`useSocialProof.ts:117-139` يعتبر أي قطعة في `['completed','ended','closed']` لها `currentBidderId` بيعةً — **وهي تشمل `'ended'` أصلاً، وهي حالة يوثّقها الكود نفسه بأنها ليست بيعاً.** بعد المرحلة ١ ستحمل القطعة المرفوضة أو المنتهية مهلتها `currentBidderId`، فيعلن الشريط العام بيوعاً لم تقع.

### 🔴 ٣ — مصنّف الإشعارات يطابق نصوصاً

`AppContext.tsx:2947-2952` و`3018-3021` يصنّف الإشعارات بمطابقة عناوينها بـ`'won'`/`'فوز'`/`'ربحت'`/`'مبروك'`. **الصياغة العربية التي تختارها للإشعارات الجديدة ستغيّر سلوك الكود** — نصّ فيه «مبروك» سيُصنَّف فوزاً.

### 🔴 ٤ — النسختان المنشورتان لنفس الحدث تتناقضان

`below_reserve_seller_accepted`:
- الإيميل (`emailCopy.js:288`): «أكمل الدفع لإتمام الشراء»
- التطبيق والواتساب (`messageCopy.js:110`): «أكّد للشراء»

**نفس الحدث، رسالتان مختلفتان، منشورتان الآن.** يجب حسم أيهما المرجع **قبل** المرحلة ١.

### 🔴 ٥ — لا نصّ لـ«الطرف الآخر لم يجب»

`offerExpiry.js:169` و`index.js:1315` يسجّلان تحذيراً ويرسلان **لا شيء** عمداً، لأن الصياغة الموجودة تخص الطرف الآخر. بريفك يطلب إشعار الطرفين ⟹ **نصّ جديد مطلوب**.

### 🔴 ٦ — رسالة «عرضك عند البائع» داخل التطبيق فقط

`below_reserve_pending` مصنّف `INAPP_ONLY` (`notify.js:21`) بوصفه «مجاملة لا تستحق واتساب». بعد المرحلة ١ **يصبح هو الشيء الوحيد الذي يسمعه أعلى مزايد في كل مزاد**. إبقاؤه داخل التطبيق يعني أن أعلى مزايد لا يعلم شيئاً خارج التطبيق.

### 🔴 ٧ — لوحة الأدمن تشحن بلا موافقة

`admin/OurDropsSection.tsx:301-346` يبني بطاقة إرسال المندوب من `item.currentBidderId` **بلا أي فحص طلب أو قبول**. بعد المرحلة ١ يستطيع الأدمن شحن قطعة لم يقبلها البائع.

---

## ٩. الملفات التي ستتغيّر

**خلفية (٦):** `functions/index.js` (٣٢ موضعاً) · `settlement.js` · `messageCopy.js` (١١) · `emailCopy.js` (٧) · `notify.js` · `offerExpiry.js`

**منطق مشترك (٦):** `src/utils/bidMath.ts` · `orderStatusGlossary.ts` · `orderWorkflow.ts` · `reserveStatus.ts` · `approvalGuard.ts` · `src/types.ts`

**خطّافات (٣):** `useMyAuctionLots.ts` · `useSocialProof.ts` · `useWinDetection` داخل `WinCelebration.tsx`

**واجهة (١٠):** `LiveStreamView` (٩) · `DesktopLiveAuctionLayout` (٦) · `DiscoveryFeedView` (٦) · `WinCelebration` (٥) · `MyOrdersView` (٤) · `SellerCenterView` · `DesktopFrame` · `MobileAuctionView` · `AuctionDetailsModal` · `admin/OurDropsSection`

**نصوص (٦):** `translations.ts` (٨) · `auctionRules.ts` (٣ + رفع النسخة) · `legalTerms.ts` (٣) · `HowItWorksView` (٣) · `landing/LandingView` · `dropCaption.ts`

**خارج المستودع (١):** `n8n/build-messages.js` + `webhook-receiver-v2.json` — **لصق يدوي في n8n Cloud، خارج نشر Firebase.**

## ١٠. الاختبارات المطلوبة

سيناريوهات بريفك A–H، زائد ما كشفه التدقيق:

- قبول متزامن + رفض ⟵ واحد فقط يُثبَّت
- قبول مكرّر ⟵ طلب واحد
- قبول بعد انتهاء المهلة ⟵ يفشل بأمان
- مهلة الدفع = `sellerAcceptedAt` (أ) و`buyerConfirmedAt` (ب)
- ١٠٥ نصوص «صحيحة كما هي» ⟵ اختبار يمنع لمسها
- تعادل عربي/إنجليزي على كل حالة جديدة
- `RULES_VERSION = 2` ⟵ يُعاد طلب الموافقة من عضو على النسخة ١
- لا مسار يُنشئ طلباً قبل القبول (اختبار ربط كالموجود)

---

## ١١. ما زال ناقصاً قبل التنفيذ

تحليل الترحيل (ماذا يحدث للسجلات الجارية لحظة النشر) يعمل الآن. **لن أبدأ التنفيذ قبل أن يكتمل ويُعرض عليك** — لأن قاعدتك صريحة: لا ترحيل قبل رسم استخدام البيانات الحالي.
