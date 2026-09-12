#!/usr/bin/env node
/**
 * seed-categories.cjs — create/refresh the `categories` collection CR-01 reads.
 *
 * THE DOC ID IS THE CATEGORY VALUE, not an auto-id, and that is load-bearing.
 * `users/{uid}.interests` stores these ids, and CR-02 intersects them against
 * `auctions/{id}.category`, which holds the canonical values in
 * src/utils/categories.ts. Auto-ids would produce a set that intersects
 * nothing: the nightly digest would match zero auctions for every user and
 * fail silently, because "no matches" is a legitimate outcome it is told not
 * to fall back from.
 *
 * Idempotent. Re-running updates names/icons/order in place and never orphans
 * an existing user's saved interests. It does NOT delete categories that are
 * no longer in the source list — retiring one is `active: false` (set it in
 * the console), so that lots and interests already carrying it keep resolving.
 *
 * AUTH: needs a mazadjoapp service-account key, same as the other scripts here:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *   node scripts/seed-categories.cjs            # apply
 *   node scripts/seed-categories.cjs --dry-run  # print, write nothing
 */
'use strict';

const admin = require('firebase-admin');

// Kept in sync with src/utils/categories.ts + SEED_ICONS in
// src/utils/interests.ts. A drift check runs in interests.test.ts, which
// asserts the seed ids equal the taxonomy values.
const CATEGORIES = [
  { id: 'Vehicles', nameAr: 'سيارات', nameEn: 'Vehicles', icon: 'Car' },
  { id: 'Phones', nameAr: 'هواتف', nameEn: 'Phones', icon: 'Smartphone' },
  { id: 'Electronics', nameAr: 'إلكترونيات', nameEn: 'Electronics', icon: 'Cpu' },
  { id: 'Watches', nameAr: 'ساعات', nameEn: 'Watches', icon: 'Watch' },
  { id: 'Appliances', nameAr: 'أجهزة كهربائية', nameEn: 'Appliances', icon: 'WashingMachine' },
  { id: 'Home & Furniture', nameAr: 'أثاث ومنزل', nameEn: 'Home & Furniture', icon: 'Sofa' },
  { id: 'Real Estate', nameAr: 'عقارات', nameEn: 'Real Estate', icon: 'Building2' },
  { id: 'Fashion', nameAr: 'أخرى', nameEn: 'Other', icon: 'Package' },
];

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('GOOGLE_APPLICATION_CREDENTIALS is not set — refusing to run.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  const docs = CATEGORIES.map((c, i) => ({ ...c, order: (i + 1) * 10 }));

  // Which already exist decides whether `active` is part of the payload at all.
  // Writing `active: true` unconditionally would un-retire, on every re-run,
  // every category an admin had deliberately switched off — the exact opposite
  // of "retiring one is active:false".
  const existing = new Set();
  const snap = await db.collection('categories').get();
  snap.forEach((d) => existing.add(d.id));

  if (DRY_RUN) {
    console.log('DRY RUN — would write %d categories:', docs.length);
    for (const d of docs) {
      const verb = existing.has(d.id) ? 'update' : 'create (active: true)';
      console.log('  %-16s %s / %s  (icon %s, order %d) — %s', d.id, d.nameAr, d.nameEn, d.icon, d.order, verb);
    }
    const extra = [...existing].filter((id) => !docs.some((d) => d.id === id));
    if (extra.length) console.log('Left untouched (not in the source list): %s', extra.join(', '));
    return;
  }

  const batch = db.batch();
  for (const d of docs) {
    const { id, ...data } = d;
    // merge:true updates the display fields (a renamed label, a reordered
    // grid) without clobbering anything else on the doc.
    const payload = existing.has(id) ? data : { ...data, active: true };
    batch.set(db.collection('categories').doc(id), payload, { merge: true });
  }
  await batch.commit();
  console.log(
    'Seeded %d categories (%d created, %d updated).',
    docs.length,
    docs.filter((d) => !existing.has(d.id)).length,
    docs.filter((d) => existing.has(d.id)).length,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
