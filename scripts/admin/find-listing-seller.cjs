/**
 * Find a listing and its seller's contact details — READ ONLY, ALWAYS.
 *
 * WHY THIS EXISTS. The admin dashboard can find an auction (AuctionLookupSection)
 * but only ever shows `sellerName`, and the Members list shows a name without a
 * phone. So "who listed this, and how do I reach them?" — the most ordinary
 * operational question there is — had no answer in the product. The only
 * existing script, unblock-user.cjs, runs the other way: it takes a phone and
 * finds the user.
 *
 * Note it deliberately does NOT read the winner's phone off an auction the way
 * OurDropsSection does. That surface invents `+962 7 9888 1234` when the user
 * document is missing, which is worse than showing nothing; here an absent
 * contact prints as absent.
 *
 * THERE IS NO WRITE PATH IN THIS FILE. No set, no update, no delete, no batch,
 * no --apply.
 *
 * Setup (see scripts/admin/README.md):
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
 *
 * Usage — the term matches the title or description, case-insensitively, and
 * works in Arabic or English:
 *   node scripts/admin/find-listing-seller.cjs بورش
 *   node scripts/admin/find-listing-seller.cjs porsche
 *   node scripts/admin/find-listing-seller.cjs "porsche" --all     # include ended/rejected
 *   node scripts/admin/find-listing-seller.cjs --seller anonymous  # search by seller name
 *   node scripts/admin/find-listing-seller.cjs --json
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
  console.error('firebase-admin not found. Run `npm ci` in scripts/loadtest.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const INCLUDE_ALL = argv.includes('--all');
const sellerIdx = argv.indexOf('--seller');
const SELLER_MODE = sellerIdx !== -1;
const TERM = (SELLER_MODE ? argv[sellerIdx + 1] : argv.find((a) => !a.startsWith('--'))) || '';

if (!TERM) {
  console.error('Usage: node scripts/admin/find-listing-seller.cjs <search term> [--seller] [--all] [--json]');
  console.error('   e.g. node scripts/admin/find-listing-seller.cjs بورش');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set — see scripts/admin/README.md.');
  process.exit(1);
}

const admin = loadAdmin();
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

/**
 * Arabic text matching is not plain lowercasing.
 *
 * The same word is typed several ways: أ/إ/آ vs ا, ة vs ه, ى vs ي, and with or
 * without the tatweel and the diacritics. A seller typing «بورشه» and a
 * searcher typing «بورش» must meet. Latin text still just lowercases.
 */
function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')   // harakat + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

const ts = (t) => {
  if (!t) return null;
  const ms = typeof t === 'number' ? t
    : typeof t.toMillis === 'function' ? t.toMillis()
    : t._seconds != null ? t._seconds * 1000
    : Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : null;
};

const LIVEISH = ['live', 'upcoming', 'processing'];

async function main() {
  const needle = normalize(TERM);
  const [auctionSnap, userSnap] = await Promise.all([
    db.collection('auctions').get(),
    db.collection('users').get(),
  ]);

  const users = new Map();
  userSnap.docs.forEach((d) => users.set(d.id, d.data() || {}));

  const hits = [];
  for (const doc of auctionSnap.docs) {
    const a = doc.data() || {};
    const haystack = SELLER_MODE
      ? normalize(a.sellerName)
      : normalize(`${a.title || ''} ${a.description || ''}`);
    if (!haystack.includes(needle)) continue;
    if (!INCLUDE_ALL && !LIVEISH.includes(a.status) && a.status !== 'completed' && a.status !== 'ended' && a.status !== 'reserve_not_met') continue;

    // sellerId is the REAL creating uid even on Mazad's own drops; sellerName is
    // a display identity and can be anything the seller typed.
    const uid = a.sellerId || a.createdById || null;
    const u = uid ? users.get(uid) : null;

    hits.push({
      auctionId: doc.id,
      auctionNumber: a.auctionNumber ?? null,
      title: a.title || '',
      status: a.status || '<none>',
      startingPrice: a.startingPrice ?? null,
      currentPrice: a.currentPrice ?? null,
      totalBids: a.totalBids ?? 0,
      createdAt: ts(a.createdAt),
      sellerNameOnLot: a.sellerName || '<none>',
      sellerUid: uid || '<none>',
      seller: u
        ? {
            name: u.name || '<none>',
            phone: u.phoneNumber || u.phone || '<none>',
            transferPhone: u.transferPhone || '<none>',
            email: u.email || '<none>',
            city: u.city || '<none>',
            role: u.role || 'user',
            isBlocked: u.isBlocked === true,
            joined: ts(u.createdAt),
            lastSeen: ts(u.lastSeen),
          }
        : null,
    });
  }

  hits.sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));

  if (AS_JSON) {
    console.log(JSON.stringify({ term: TERM, mode: SELLER_MODE ? 'seller' : 'listing', count: hits.length, hits }, null, 2));
    return;
  }

  console.log(`\nSearch: "${TERM}"  (${SELLER_MODE ? 'seller name' : 'title/description'})`);
  console.log(`Scanned ${auctionSnap.size} auctions — ${hits.length} match${hits.length === 1 ? '' : 'es'}${INCLUDE_ALL ? '' : ' (add --all to widen)'}\n`);

  if (!hits.length) {
    console.log('Nothing matched. Try a shorter term, the other language, or --seller.\n');
    return;
  }

  for (const h of hits) {
    console.log('─'.repeat(64));
    console.log(`  ${h.title}`);
    console.log(`  auction   ${h.auctionId}${h.auctionNumber ? `  (#${h.auctionNumber})` : ''}`);
    console.log(`  status    ${h.status}   bids: ${h.totalBids}   start: ${h.startingPrice}   now: ${h.currentPrice}`);
    console.log(`  listed    ${h.createdAt || '<unknown>'}`);
    console.log(`  seller on lot: "${h.sellerNameOnLot}"   uid: ${h.sellerUid}`);
    if (h.seller) {
      console.log(`  ── contact ──`);
      console.log(`     name    ${h.seller.name}`);
      console.log(`     PHONE   ${h.seller.phone}`);
      if (h.seller.transferPhone !== '<none>') console.log(`     cliq    ${h.seller.transferPhone}`);
      console.log(`     email   ${h.seller.email}`);
      console.log(`     city    ${h.seller.city}   role: ${h.seller.role}${h.seller.isBlocked ? '   ⚠ BLOCKED' : ''}`);
      console.log(`     joined  ${h.seller.joined || '<unknown>'}   last seen: ${h.seller.lastSeen || '<unknown>'}`);
    } else {
      // Printed, not invented. An absent user document is a real finding.
      console.log(`  ── contact ── NO USER DOCUMENT for this uid. Nothing to contact.`);
    }
  }
  console.log('─'.repeat(64));
  console.log('\nNothing was written. This script has no write path.\n');
}

main().catch((e) => { console.error('lookup failed:', e); process.exit(1); });
