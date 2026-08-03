#!/usr/bin/env node
/**
 * backfill-stock-covers.cjs — replace fabricated cover photos with the lot's
 * own real image.
 *
 * WHY THIS EXISTS: until the fallback was removed, `createListing` assigned a
 * stock Unsplash photograph whenever no thumbnail was uploaded, choosing it by
 * a keyword guess at the category. Because the drop builder filed every
 * non-phone, non-car lot under the 'Fashion' catch-all, most lots matched no
 * keyword and received the else-branch — a photo of red Nike sneakers.
 *
 * Deleting the fallback stops NEW lots getting one. It does not clean the lots
 * already carrying one, which is what a buyer sees today.
 *
 * Most of these lots DO have real photographs — the uploader put them in the
 * gallery (`mediaUrls`) while the cover stayed fabricated. For those, the fix
 * is to promote the first real gallery image to the cover. No new photography
 * needed and nothing invented: the image already belongs to the lot.
 *
 * A lot with a stock cover and NO real media anywhere cannot be fixed by a
 * script. Those are listed separately as human work — source a photo or pull
 * the lot.
 *
 * AUTH:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *
 * USAGE — report first, always:
 *   node scripts/admin/backfill-stock-covers.cjs            # report only
 *   node scripts/admin/backfill-stock-covers.cjs --apply    # writes
 *
 * Idempotent: a lot whose cover is no longer a stock url is not selected.
 */
'use strict';

function loadAdmin() {
  const candidates = ['../loadtest/node_modules/firebase-admin', 'firebase-admin'];
  for (const c of candidates) {
    try {
      return require(c.startsWith('.') ? require('path').join(__dirname, c) : c);
    } catch (e) {
      if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]);
    }
  }
  console.error('firebase-admin not found. Run `npm i` in scripts/loadtest, or `npm i firebase-admin` at repo root.');
  process.exit(1);
}

const admin = loadAdmin();
const APPLY = process.argv.includes('--apply');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

/** Every image the fallback could ever have assigned came from this host. */
const STOCK_HOST = 'images.unsplash.com';

const isStock = (url) => String(url || '').includes(STOCK_HOST);

/** The first gallery entry that is a real uploaded image, not another stock url. */
function firstRealGalleryImage(data) {
  const gallery = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];
  return gallery.map((u) => String(u || '').trim()).find((u) => u && !isStock(u)) || null;
}

(async () => {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  const snap = await db.collection('auctions').get();

  const fixable = [];
  const stranded = [];

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    if (!isStock(d.thumbnailUrl)) continue;

    const replacement = firstRealGalleryImage(d);
    const row = {
      id: doc.id,
      title: String(d.title || '').slice(0, 40),
      status: d.status,
      bids: d.totalBids || 0,
    };
    if (replacement) fixable.push({ ...row, replacement });
    else stranded.push({ ...row, video: d.videoUrl ? 'has video' : 'no media at all' });
  }

  console.log(`\nScanned ${snap.size} lots.`);
  console.log(`${fixable.length + stranded.length} carry a fabricated cover photo.\n`);

  if (fixable.length) {
    console.log(`${fixable.length} can be fixed from the lot's OWN gallery:\n`);
    console.table(fixable.map(({ replacement, ...r }) => r));
  }

  if (stranded.length) {
    console.log(`\n${stranded.length} have a stock cover and NO real image to promote.`);
    console.log('A script cannot fix these — source a photo or pull the lot:\n');
    console.table(stranded);
  }

  const visible = [...fixable, ...stranded].filter(
    (r) => r.status === 'live' || r.status === 'upcoming',
  );
  if (visible.length) {
    console.log(`\n⚠  ${visible.length} of these are buyer-visible RIGHT NOW (live/upcoming).\n`);
  }

  if (!APPLY) {
    console.log('Report only — nothing was written. Re-run with --apply to write.\n');
    process.exit(0);
  }

  let batch = db.batch();
  let pending = 0;
  for (const f of fixable) {
    batch.update(db.collection('auctions').doc(f.id), { thumbnailUrl: f.replacement });
    pending++;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();

  console.log(`\n✅ Promoted a real gallery image to the cover on ${fixable.length} lot(s).`);
  if (stranded.length) console.log(`   ${stranded.length} still need a human.\n`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
