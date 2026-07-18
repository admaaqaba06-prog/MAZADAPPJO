import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { buildAuctionCaption } from '../utils/dropCaption';
import { buildAuctionUrl } from '../utils/deepLink';
import { DROP_CHANNELS, channelLabel, channelToCategory, type DropChannel } from '../utils/dropChannel';
import { parseAmmanLocalToMs, formatAmmanClock } from '../utils/ammanTime';

const DURATION_PRESETS = [
  { seconds: 600, label: '10 دقيقة', en: '10 min' },
  { seconds: 900, label: '15 دقيقة', en: '15 min' },
  { seconds: 1800, label: '30 دقيقة', en: '30 min' },
];

export default function AuctionDropBuilderView() {
  const { language, currentUser, createListing } = useApp();
  const isAr = language === 'ar';

  const [title, setTitle] = useState('');
  const [productName, setProductName] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [channel, setChannel] = useState<DropChannel>('misc');
  const [scheduledLocal, setScheduledLocal] = useState(''); // "YYYY-MM-DDTHH:mm" (Amman)
  const [durationSeconds, setDurationSeconds] = useState(1800);
  const [condition, setCondition] = useState('جديدة كلياً');
  const [specsText, setSpecsText] = useState(''); // one spec per line
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const specs = useMemo(
    () => specsText.split('\n').map((s) => s.trim()).filter(Boolean),
    [specsText],
  );

  const scheduledStartAtMs = useMemo(() => parseAmmanLocalToMs(scheduledLocal), [scheduledLocal]);
  const startTimeDisplay = useMemo(
    () => (scheduledStartAtMs != null ? formatAmmanClock(scheduledStartAtMs) : '—'),
    [scheduledStartAtMs],
  );

  const durationLabel = useMemo(() => {
    const p = DURATION_PRESETS.find((d) => d.seconds === durationSeconds);
    return p ? p.label : `${Math.round(durationSeconds / 60)} دقيقة`;
  }, [durationSeconds]);

  // Before the drop is created we show a placeholder link; after creation the
  // real id flows in and the caption/copy buttons reflect the final link.
  const deepLink = useMemo(
    () => buildAuctionUrl(createdId ?? '{{auction-id}}', window.location.origin),
    [createdId],
  );

  const caption = useMemo(
    () =>
      buildAuctionCaption({
        auctionNumber: title.trim() || '—',
        startTime: startTimeDisplay,
        durationLabel,
        startingPriceJod: Number(startingPrice) || 0,
        productName: productName.trim() || '—',
        specs,
        condition: condition.trim(),
        deepLink,
      }),
    [title, startTimeDisplay, durationLabel, startingPrice, productName, specs, condition, deepLink],
  );

  const onThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setThumbnailFile(f);
    setThumbnailPreview(f ? URL.createObjectURL(f) : '');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!productName.trim() || !Number(startingPrice)) {
      setError(isAr ? 'أدخل اسم المنتج وسعر البداية' : 'Enter a product name and starting price');
      return;
    }
    if (scheduledStartAtMs != null && scheduledStartAtMs <= Date.now()) {
      setError(isAr ? 'وقت البدء يجب أن يكون في المستقبل' : 'Start time must be in the future');
      return;
    }
    setSubmitting(true);
    try {
      const priceNum = Number(startingPrice);
      const newId = await createListing(
        {
          title: title.trim() || productName.trim(),
          description: productName.trim(),
          category: channelToCategory(channel),
          startingPrice: priceNum,
          minIncrement: Math.max(5, Math.round(priceNum * 0.05)),
          currentBidderId: null,
          currentBidderName: null,
          videoUrl: '',
          thumbnailUrl: '',
          endTime: (scheduledStartAtMs ?? Date.now()) + durationSeconds * 1000,
          duration: durationSeconds,
          channel,
          // No schedule = open now: the opener cron only flips auctions that
          // HAVE a scheduledStartAt, so a null here would stay upcoming forever.
          scheduledStartAt: scheduledStartAtMs ?? Date.now(),
          // Conditional spread: Firestore setDoc rejects explicit `undefined` values
          // (ignoreUndefinedProperties is not enabled), so omit the key when blank.
          ...(Number(marketPrice) > 0 ? { marketPrice: Number(marketPrice) } : {}),
        },
        undefined,
        thumbnailFile ?? undefined,
        undefined,
        'upcoming',
      );
      setCreatedId(newId);
    } catch (e: any) {
      setError(e?.message || (isAr ? 'فشل إنشاء المزاد' : 'Failed to create auction'));
    } finally {
      setSubmitting(false);
    }
  };

  const finalLink = createdId ? buildAuctionUrl(createdId, window.location.origin) : '';

  return (
    <div style={{ direction: isAr ? 'rtl' : 'ltr' }} className="max-w-5xl mx-auto p-4 grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-xl font-bold">{isAr ? 'إنشاء مزاد جديد' : 'Create a Drop'}</h1>

        <label className="block text-sm">{isAr ? 'رقم المزاد' : 'Auction number'}
          <input className="mt-1 w-full border rounded p-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1706" />
        </label>

        <label className="block text-sm">{isAr ? 'اسم المنتج' : 'Product name'}
          <input className="mt-1 w-full border rounded p-2" value={productName} onChange={(e) => setProductName(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'سعر البداية (دينار)' : 'Starting price (JOD)'}
          <input type="number" className="mt-1 w-full border rounded p-2" value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'سعر السوق (اختياري)' : 'Market price (optional)'}
          <input type="number" className="mt-1 w-full border rounded p-2" value={marketPrice} onChange={(e) => setMarketPrice(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'القناة' : 'Channel'}
          <select className="mt-1 w-full border rounded p-2" value={channel} onChange={(e) => setChannel(e.target.value as DropChannel)}>
            {DROP_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{channelLabel(c.value, isAr ? 'ar' : 'en')}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">{isAr ? 'وقت البدء (توقيت عمّان)' : 'Start time (Amman)'}
          <input
            type="datetime-local"
            className="mt-1 w-full border rounded p-2"
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
          />
          <span className="mt-1 block text-xs text-neutral-500">
            {isAr ? 'اتركه فارغاً ليفتح المزاد فوراً (خلال دقيقة)' : 'Leave empty to open immediately (within a minute)'}
          </span>
        </label>

        <label className="block text-sm">{isAr ? 'المدة' : 'Duration'}
          <select className="mt-1 w-full border rounded p-2" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))}>
            {DURATION_PRESETS.map((d) => (
              <option key={d.seconds} value={d.seconds}>{isAr ? d.label : d.en}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">{isAr ? 'الحالة' : 'Condition'}
          <input className="mt-1 w-full border rounded p-2" value={condition} onChange={(e) => setCondition(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'المواصفات (سطر لكل مواصفة)' : 'Specs (one per line)'}
          <textarea className="mt-1 w-full border rounded p-2 h-28" value={specsText} onChange={(e) => setSpecsText(e.target.value)} />
        </label>

        <label className="block text-sm">{isAr ? 'صورة المنتج' : 'Product image'}
          <input type="file" accept="image/*" className="mt-1 w-full" onChange={onThumb} />
        </label>
        {thumbnailPreview && <img src={thumbnailPreview} alt="" className="w-32 h-32 object-cover rounded" />}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={submitting} onClick={handleCreate} className="w-full bg-amber-600 text-white rounded p-3 disabled:opacity-50">
          {submitting ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء المزاد' : 'Create drop')}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{isAr ? 'معاينة المنشور' : 'Post preview'}</h2>
        <pre className="whitespace-pre-wrap border rounded p-3 text-sm bg-neutral-50" style={{ direction: 'rtl' }}>{caption}</pre>
        <button onClick={() => copy(caption)} disabled={!createdId} className="w-full border rounded p-2 disabled:opacity-50">{isAr ? 'نسخ النص' : 'Copy caption'}</button>

        {createdId ? (
          <>
            <div className="border rounded p-2 text-sm break-all">{finalLink}</div>
            <button onClick={() => copy(finalLink)} className="w-full border rounded p-2">{isAr ? 'نسخ الرابط' : 'Copy link'}</button>
            <p className="text-green-700 text-sm">{isAr ? '✅ تم الإنشاء — الصقه في القناة' : '✅ Created — paste into the channel'}</p>
          </>
        ) : (
          <p className="text-neutral-500 text-sm">{isAr ? 'أنشئ المزاد للحصول على الرابط النهائي ثم انسخ النص' : 'Create the drop to get the final link, then copy the caption'}</p>
        )}
      </div>
    </div>
  );
}
