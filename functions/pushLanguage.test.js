// functions/pushLanguage.test.js
//
// The two FCM pushes are the ONLY customer surfaces in index.js that do not go
// through notify(). They build their own `notification: { title, body }` payload
// and hand it straight to admin.messaging(), so notify()'s language resolution
// never touches them. Both shipped hardcoded Arabic: an English-preference
// winner got «تهانينا! لقد فزت بالمزاد» as a push seconds before the English
// WhatsApp for the same win, from the same function.
//
// index.js cannot be imported (it calls admin.initializeApp() at module load),
// so this file uses the two idioms the suite already uses — see the header of
// functions/notifyLanguage.test.js:
//
//   1. Source-text assertions, anchored on real syntax and never on a character
//      window. Every anchor lookup THROWS when the anchor moves. A bare indexOf
//      returns -1, and -1 satisfies every `toBeLessThan`/`toBeGreaterThan`
//      comparison, so an assertion anchored that way passes vacuously the moment
//      the code it watches is deleted — that has shipped on this branch twice.
//
//   2. Behavioural assertions: the REAL production source of each push block is
//      sliced out and compiled with `new Function` against injected deps. This
//      is what proves the language actually resolved from the user document is
//      the one the push renders in. vi.mock cannot intercept a CommonJS
//      require() from an ESM test, so injection is the only way in.
//
// The copy renderer injected below is the REAL copyFor, not a stub, so the
// asserted strings are the strings a customer receives.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const requireCjs = createRequire(import.meta.url);
const { copyFor, resolveLang } = requireCjs('./messageCopy.js');
const { CHANNEL_POLICY } = requireCjs('./notify.js');
const { totalDueJod } = requireCjs('./settlement.js');

const ARABIC = /[؀-ۿ]/;

// ---------------------------------------------------------------------------
// Slicing. A single scanner that understands strings, template literals and
// comments, so a `{` inside a comment or a `${...}` inside a template cannot
// throw the brace count off. Everything throws rather than returning a
// sentinel: a slice that silently comes back empty makes every assertion
// downstream of it vacuous.
// ---------------------------------------------------------------------------

function matchBrace(src, openIdx) {
  if (src[openIdx] !== '{') throw new Error(`slice anchor does not end at a '{' (got ${JSON.stringify(src[openIdx])})`);
  let depth = 0;
  let mode = null; // null | "'" | '"' | '`' | 'line' | 'block'
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'line') { if (ch === '\n') mode = null; continue; }
    if (mode === 'block') { if (ch === '*' && next === '/') { mode = null; i++; } continue; }
    if (mode !== null) { // inside a string / template literal
      if (ch === '\\') { i++; continue; }
      if (ch === mode) mode = null;
      continue;
    }
    if (ch === '/' && next === '/') { mode = 'line'; i++; continue; }
    if (ch === '/' && next === '*') { mode = 'block'; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { mode = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced braces from anchor — anchor moved');
}

// The source of one brace-delimited block, found by an anchor that must END in
// '{'. The anchor must be UNIQUE in index.js: a second occurrence means the
// slice may be reading a different block than the test names, which is exactly
// how a green test ends up watching nothing.
function sliceBlock(anchor) {
  const start = SRC.indexOf(anchor);
  if (start === -1) throw new Error(`anchor not found in index.js: ${anchor}`);
  if (SRC.indexOf(anchor, start + 1) !== -1) throw new Error(`anchor is not unique in index.js: ${anchor}`);
  const open = start + anchor.length - 1;
  return SRC.slice(start, matchBrace(SRC, open) + 1);
}

// Comments are stripped before any text assertion. They are prose, not wiring:
// the comments added alongside this fix say the words "Arabic" and name the old
// hardcoded strings, and a naive scan for a leftover Arabic literal would find
// the explanation instead of the code. Verified — the un-stripped version of
// the "no Arabic literal survives" test below passes on the reverted source.
function stripComments(src) {
  let out = '';
  let mode = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'line') { if (ch === '\n') { mode = null; out += ch; } continue; }
    if (mode === 'block') { if (ch === '*' && next === '/') { mode = null; i++; } continue; }
    if (mode === null) {
      if (ch === '/' && next === '/') { mode = 'line'; i++; continue; }
      if (ch === '/' && next === '*') { mode = 'block'; i++; continue; }
      if (ch === "'" || ch === '"' || ch === '`') mode = ch;
      out += ch;
      continue;
    }
    if (ch === '\\') { out += ch + (next === undefined ? '' : next); i++; continue; }
    if (ch === mode) mode = null;
    out += ch;
  }
  return out;
}

const WINNER_PUSH = sliceBlock('if (notifyData.fcmToken) {');
const OUTBID_PUSH = sliceBlock('if (fcmToken) {');
const SAFE_LANG = sliceBlock('function safeResolveLang(user, where) {');
// The object literal the settlement transaction hands out to the post-commit
// push. This is where the winner's language is captured, off the user doc the
// transaction has ALREADY read — no read is added inside the transaction.
const NOTIFY_DATA = sliceBlock('notifyData = {');

// ---------------------------------------------------------------------------
// Behavioural harnesses: compile the real slices against injected deps.
// ---------------------------------------------------------------------------

function makeMessaging(seen, { sendThrows = false } = {}) {
  return {
    messaging: () => ({
      send: async (msg) => {
        seen.sent.push(msg);
        if (sendThrows) throw new Error('registration token not registered');
      },
    }),
  };
}

function makeCopyFor(seen, { copyThrows = false } = {}) {
  return (event, data, lang) => {
    seen.copyFor.push({ event, data, lang });
    if (copyThrows) throw new Error('copy renderer exploded');
    return copyFor(event, data, lang);
  };
}

// safeResolveLang compiled from its own source, so the guard under test is the
// production guard and not a re-implementation of it.
function makeSafeResolveLang(seen, { resolveThrows = false } = {}) {
  const factory = new Function('deps', `
    const { resolveLang, console } = deps;
    ${SAFE_LANG}
    return safeResolveLang;
  `);
  return factory({
    resolveLang: (u) => {
      seen.resolveLang.push(u);
      if (resolveThrows) throw new Error('language read exploded');
      return resolveLang(u);
    },
    console: { warn: (...a) => seen.warned.push(a.join(' ')) },
  });
}

function freshSeen() {
  return { sent: [], copyFor: [], resolveLang: [], warned: [], logged: [] };
}

// Runs the winner-push block for a given notifyData.
function runWinnerPush(notifyData, opts = {}) {
  const seen = freshSeen();
  const factory = new Function('deps', `
    const { admin, copyFor, totalDueJod, console, notifyData } = deps;
    return (async () => { ${WINNER_PUSH} })();
  `);
  const done = factory({
    admin: makeMessaging(seen, opts),
    copyFor: makeCopyFor(seen, opts),
    totalDueJod,
    console: { warn: (...a) => seen.warned.push(a.join(' ')), log: (...a) => seen.logged.push(a.join(' ')) },
    notifyData,
  });
  return { seen, done };
}

// Runs the settlement transaction's notifyData capture for a given winner doc,
// and returns the object the post-commit push is handed.
function runNotifyDataCapture(winnerData, opts = {}) {
  const seen = freshSeen();
  const factory = new Function('deps', `
    const { safeResolveLang, winnerData, winnerId, realWinnerName, finalPrice, auctionData, auctionId } = deps;
    let notifyData;
    ${NOTIFY_DATA}
    return notifyData;
  `);
  const notifyData = factory({
    safeResolveLang: makeSafeResolveLang(seen, opts),
    winnerData,
    winnerId: 'u-winner',
    realWinnerName: 'Sara',
    finalPrice: 100,
    auctionData: { title: 'Rolex Datejust' },
    auctionId: 'A1',
  });
  return { seen, notifyData };
}

// Runs the outbid-push block for a given previous-bidder doc.
function runOutbidPush(prevUserData, opts = {}) {
  const seen = freshSeen();
  const factory = new Function('deps', `
    const { admin, copyFor, safeResolveLang, console,
            fcmToken, previousBidderId, prevUserData, auctionData, auctionId, amount } = deps;
    return (async () => { ${OUTBID_PUSH} })();
  `);
  const done = factory({
    admin: makeMessaging(seen, opts),
    copyFor: makeCopyFor(seen, opts),
    safeResolveLang: makeSafeResolveLang(seen, opts),
    console: { warn: (...a) => seen.warned.push(a.join(' ')), log: (...a) => seen.logged.push(a.join(' ')) },
    fcmToken: 'tok-1',
    previousBidderId: 'u-prev',
    prevUserData,
    auctionData: { title: 'Rolex Datejust' },
    auctionId: 'A1',
    amount: 250,
  });
  return { seen, done };
}

// ---------------------------------------------------------------------------

describe('safeResolveLang — the non-notify() language guard', () => {
  it('returns the recipient language for a doc that asks for English', () => {
    const seen = freshSeen();
    expect(makeSafeResolveLang(seen)({ language: 'en' }, 'test')).toBe('en');
  });

  it('defaults to Arabic for a missing doc, a missing field and junk', () => {
    const seen = freshSeen();
    const f = makeSafeResolveLang(seen);
    for (const doc of [null, undefined, {}, { language: 'fr' }, { language: 7 }, 'nonsense']) {
      expect(f(doc, 'test')).toBe('ar');
    }
  });

  it('degrades to Arabic instead of throwing when the language read fails', async () => {
    // Same contract as notify(): these call sites sit inside a settlement
    // transaction's capture and a bid trigger. A propagating throw here fails
    // the money path over a display preference.
    const seen = freshSeen();
    const f = makeSafeResolveLang(seen, { resolveThrows: true });
    expect(f({ language: 'en' }, 'the-call-site')).toBe('ar');
    expect(seen.warned.join(' ')).toContain('the-call-site');
  });
});

describe('winner FCM push speaks the winner language', () => {
  it('captures the language from the user doc the transaction already read', () => {
    // Zero extra Firestore reads, and — critically — NO read added inside the
    // settlement transaction: winnerData is the doc already fetched for the
    // phone number and the FCM token.
    const { seen, notifyData } = runNotifyDataCapture({ language: 'en', fcmToken: 't', phoneNumber: '+962' });
    expect(notifyData.lang).toBe('en');
    expect(seen.resolveLang).toEqual([{ language: 'en', fcmToken: 't', phoneNumber: '+962' }]);
  });

  it('captures Arabic for a winner with no language preference', () => {
    const { notifyData } = runNotifyDataCapture({ fcmToken: 't' });
    expect(notifyData.lang).toBe('ar');
  });

  it('still captures a language — and the rest of notifyData — when the read fails', () => {
    const { notifyData } = runNotifyDataCapture({ language: 'en' }, { resolveThrows: true });
    expect(notifyData.lang).toBe('ar');
    expect(notifyData.winnerId).toBe('u-winner');
    expect(notifyData.auctionTitle).toBe('Rolex Datejust');
  });

  it('pushes the English winner copy — the same copy the WhatsApp carries', async () => {
    const { seen, done } = runWinnerPush({
      fcmToken: 'tok-1', winnerId: 'u1', auctionTitle: 'Rolex Datejust', finalPrice: 100, lang: 'en',
    });
    await done;
    const expected = copyFor('auction_won', { auctionTitle: 'Rolex Datejust', totalDue: totalDueJod(100) }, 'en');
    expect(seen.sent.length).toBe(1);
    expect(seen.sent[0].token).toBe('tok-1');
    expect(seen.sent[0].notification.title).toBe(expected.title);
    expect(seen.sent[0].notification.body).toBe(expected.description);
    // Not merely "not the old Arabic" — actually English, naming the lot.
    expect(seen.sent[0].notification.title).toBe('You won the auction 🎉');
    expect(seen.sent[0].notification.body).toContain('Rolex Datejust');
    expect(ARABIC.test(seen.sent[0].notification.title)).toBe(false);
    expect(ARABIC.test(seen.sent[0].notification.body)).toBe(false);
  });

  it('pushes the Arabic winner copy to an Arabic-preference winner', async () => {
    const { seen, done } = runWinnerPush({
      fcmToken: 'tok-1', winnerId: 'u1', auctionTitle: 'ساعة رولكس', finalPrice: 100, lang: 'ar',
    });
    await done;
    const expected = copyFor('auction_won', { auctionTitle: 'ساعة رولكس', totalDue: totalDueJod(100) }, 'ar');
    expect(seen.sent[0].notification.title).toBe(expected.title);
    expect(seen.sent[0].notification.body).toBe(expected.description);
    expect(ARABIC.test(seen.sent[0].notification.title)).toBe(true);
  });

  it('renders with the captured language, not a literal', async () => {
    // Kills `copyFor('auction_won', {...}, 'ar')` — which looks right in review
    // and ships every winner Arabic — and kills passing 'en' to an Arabic reader.
    for (const lang of ['ar', 'en']) {
      const { seen, done } = runWinnerPush({ fcmToken: 't', winnerId: 'u1', auctionTitle: 'X', finalPrice: 100, lang });
      await done;
      expect(seen.copyFor.length).toBe(1);
      expect(seen.copyFor[0].event).toBe('auction_won');
      expect(seen.copyFor[0].lang).toBe(lang);
    }
  });

  it('carries the amount the winner actually owes, not the hammer price', async () => {
    // totalDue = hammer + buyer's premium. The old hardcoded push quoted the
    // hammer price while the WhatsApp for the same win quoted the total due.
    const { seen, done } = runWinnerPush({ fcmToken: 't', winnerId: 'u1', auctionTitle: 'X', finalPrice: 100, lang: 'en' });
    await done;
    expect(seen.copyFor[0].data.totalDue).toBe(totalDueJod(100));
    expect(seen.sent[0].notification.body).toContain(String(totalDueJod(100)));
  });

  it('sends nothing when the winner has no FCM token', async () => {
    const { seen, done } = runWinnerPush({ fcmToken: '', winnerId: 'u1', auctionTitle: 'X', finalPrice: 100, lang: 'en' });
    await done;
    expect(seen.sent).toEqual([]);
  });

  it('swallows a dead token instead of failing a settlement that already committed', async () => {
    const { seen, done } = runWinnerPush(
      { fcmToken: 't', winnerId: 'u1', auctionTitle: 'X', finalPrice: 100, lang: 'en' },
      { sendThrows: true },
    );
    await expect(done).resolves.toBeUndefined();
    expect(seen.warned.join(' ')).toContain('u1');
  });

  it('swallows a throw from the RENDERER too — it is evaluated by the caller', async () => {
    // The old `.catch()` hung off the send() promise and could never have caught
    // this: copyFor is evaluated before send() is ever called, so a throw there
    // escaped the settlement cron for an auction whose money had already moved.
    const { done } = runWinnerPush(
      { fcmToken: 't', winnerId: 'u1', auctionTitle: 'X', finalPrice: 100, lang: 'en' },
      { copyThrows: true },
    );
    await expect(done).resolves.toBeUndefined();
  });
});

describe('outbid FCM push speaks the outbid bidder language', () => {
  it('resolves the language off the doc already fetched for the token', async () => {
    const { seen, done } = runOutbidPush({ language: 'en', fcmToken: 'tok-1' });
    await done;
    expect(seen.resolveLang).toEqual([{ language: 'en', fcmToken: 'tok-1' }]); // the LOADED doc, not {}
  });

  it('pushes the English outbid copy — the same copy the WhatsApp carries', async () => {
    const { seen, done } = runOutbidPush({ language: 'en' });
    await done;
    const expected = copyFor('outbid', { auctionTitle: 'Rolex Datejust' }, 'en');
    expect(seen.sent.length).toBe(1);
    expect(seen.sent[0].notification.title).toBe(expected.title);
    expect(seen.sent[0].notification.body).toBe(expected.description);
    expect(seen.sent[0].notification.title).toBe('You have been outbid');
    expect(ARABIC.test(seen.sent[0].notification.body)).toBe(false);
  });

  it('pushes the Arabic outbid copy to an Arabic-preference bidder', async () => {
    const { seen, done } = runOutbidPush({});
    await done;
    const expected = copyFor('outbid', { auctionTitle: 'Rolex Datejust' }, 'ar');
    expect(seen.sent[0].notification.title).toBe(expected.title);
    expect(seen.sent[0].notification.body).toBe(expected.description);
    expect(ARABIC.test(seen.sent[0].notification.title)).toBe(true);
  });

  it('renders with the resolved language, not a literal', async () => {
    for (const [doc, lang] of [[{ language: 'en' }, 'en'], [{ language: 'ar' }, 'ar'], [{}, 'ar']]) {
      const { seen, done } = runOutbidPush(doc);
      await done;
      expect(seen.copyFor.length).toBe(1);
      expect(seen.copyFor[0].event).toBe('outbid');
      expect(seen.copyFor[0].lang).toBe(lang);
    }
  });

  it('keeps the deep-link data payload the app routes on', async () => {
    // Non-regression: the copy changed, the routing envelope must not have.
    const { seen, done } = runOutbidPush({ language: 'en' });
    await done;
    expect(seen.sent[0].token).toBe('tok-1');
    expect(seen.sent[0].data).toEqual({
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      auctionId: 'A1',
      bidAmount: '250',
    });
  });

  it('names the lot the bidder lost', async () => {
    const { seen, done } = runOutbidPush({ language: 'en' });
    await done;
    expect(seen.copyFor[0].data.auctionTitle).toBe('Rolex Datejust');
    expect(seen.sent[0].notification.body).toContain('Rolex Datejust');
  });
});

describe('no hardcoded Arabic survives in either push', () => {
  // The blunt guard. Every behavioural assertion above can in principle be
  // satisfied by a block that ALSO carries a stray Arabic literal; this one
  // cannot. Comments are stripped first — the explanatory comments next to both
  // fixes quote the old Arabic, and an un-stripped scan finds those.
  for (const [name, block] of [['winner push', WINNER_PUSH], ['outbid push', OUTBID_PUSH]]) {
    it(`${name} contains no Arabic literal`, () => {
      const code = stripComments(block);
      expect(code.length).toBeGreaterThan(80); // the slice is real, not an empty string
      expect(code).not.toMatch(ARABIC);
    });
  }

  it('both pushes render through copyFor rather than an inline string', () => {
    for (const block of [WINNER_PUSH, OUTBID_PUSH]) {
      const code = stripComments(block);
      expect(code).toMatch(/copyFor\(/);
      // title/body come from the rendered copy object, not from a literal.
      expect(code).toMatch(/title:\s*c\.title/);
      expect(code).toMatch(/body:\s*c\.description/);
    }
  });

  it('maps both pushes onto events the n8n contract already routes', () => {
    // Reusing an existing event is what makes the push and the WhatsApp agree.
    // A new event key here would be copy the live workflow silently drops.
    expect(Object.keys(CHANNEL_POLICY)).toContain('auction_won');
    expect(Object.keys(CHANNEL_POLICY)).toContain('outbid');
    expect(stripComments(WINNER_PUSH)).toMatch(/copyFor\(\s*'auction_won'/);
    expect(stripComments(OUTBID_PUSH)).toMatch(/copyFor\(\s*'outbid'/);
  });
});

// ---------------------------------------------------------------------------
// The in-transaction notification writes.
//
// The five money-path callables (release / refund escrow, escrow repair,
// approve / reject withdrawal) write their bell docs inside the transaction and
// do NOT go through notify(). They are already bilingual at the source: every
// one carries titleAr/titleEn/descriptionAr/descriptionEn, and the client
// resolves them per recipient in src/utils/notificationContent.ts (preferring
// the recipient-language field, falling back to the other language, and only
// then to the legacy flat `title`/`description`).
//
// So the flat Arabic field in those docs is the third fallback and is never
// what a customer reads. What WOULD break an English recipient is a new
// in-transaction notification written with only the flat Arabic fields — it
// would land in the bell in Arabic and nothing would notice. This guard makes
// that a red build, without adding a Firestore read to a settlement path to fix
// something no customer can see.
// ---------------------------------------------------------------------------

// Every `transaction.set(<ref>, { ... })` whose ref was minted from the
// notifications collection. Duplicate variable names across callables (two
// separate `notifRef`s) are handled by matching every call site, not the first.
function inTransactionNotificationWrites() {
  const refNames = new Set();
  const declRe = /const\s+(\w+)\s*=\s*db\.collection\('notifications'\)\.doc\(\)/g;
  let m;
  while ((m = declRe.exec(SRC)) !== null) refNames.add(m[1]);
  if (refNames.size === 0) throw new Error('no notifications doc ref found in index.js — anchor moved');

  const writes = [];
  const setRe = /transaction\.set\((\w+),\s*\{/g;
  while ((m = setRe.exec(SRC)) !== null) {
    if (!refNames.has(m[1])) continue;
    const open = m.index + m[0].length - 1;
    writes.push({ ref: m[1], body: SRC.slice(open, matchBrace(SRC, open) + 1) });
  }
  if (writes.length === 0) throw new Error('no transaction.set() onto a notifications ref found — anchor moved');
  return writes;
}

describe('in-transaction bell notifications are bilingual at the source', () => {
  const writes = inTransactionNotificationWrites();

  it('finds every one of them', () => {
    // 7 docs across 5 callables: release escrow (buyer + seller), refund escrow
    // (buyer + seller), escrow repair, approve withdrawal, reject withdrawal.
    // A floor rather than an equality so adding a callable is not a false red —
    // but never zero, which would make the per-write loop below vacuous.
    expect(writes.length).toBeGreaterThanOrEqual(7);
  });

  for (const { ref, body } of writes) {
    it(`transaction.set(${ref}, ...) carries both languages`, () => {
      const code = stripComments(body);
      for (const field of ['titleAr', 'titleEn', 'descriptionAr', 'descriptionEn']) {
        expect(code, `${ref} is missing ${field}`).toMatch(new RegExp(`\\b${field}\\s*:`));
      }
    });
  }

  // The VALUE of one `<field>: ...` entry, read up to the next field key at the
  // same nesting. Not a fixed window and not `[^,]*` — half these values are
  // multi-line ternaries over template literals, and both of those shapes cut
  // the value in half and assert against the fragment.
  function fieldValues(code, names) {
    const re = new RegExp(`\\b(${names.join('|')})\\s*:\\s*([\\s\\S]*?)(?=\\n\\s{6,}[a-zA-Z]+\\s*:)`, 'g');
    const out = [];
    let m;
    while ((m = re.exec(code)) !== null) out.push({ field: m[1], value: m[2] });
    return out;
  }

  it('every English field holds real English, and every Arabic field real Arabic', () => {
    // Presence is not enough. src/utils/notificationContent.ts falls back to the
    // OTHER language when the recipient's own field is empty, so `titleEn: ''`
    // ships Arabic to an English reader while every presence check stays green —
    // and `titleAr` filled from the English string does the mirror-image damage.
    // Both are checked by content, in both directions.
    let checked = 0;
    for (const { ref, body } of writes) {
      const code = stripComments(body);
      for (const { field, value } of fieldValues(code, ['titleEn', 'descriptionEn'])) {
        checked++;
        expect(value, `${ref}.${field} has no English text`).toMatch(/[A-Za-z]{3}/);
        expect(value, `${ref}.${field} contains Arabic`).not.toMatch(ARABIC);
      }
      for (const { field, value } of fieldValues(code, ['titleAr', 'descriptionAr'])) {
        checked++;
        expect(value, `${ref}.${field} has no Arabic text`).toMatch(ARABIC);
      }
    }
    // Four language fields per write; never zero, which would make the loops
    // above pass by finding nothing.
    expect(checked).toBe(writes.length * 4);
  });
});

describe('the imports these guards depend on actually resolve', () => {
  // Repointing a require at a module that does not export the name binds
  // undefined; `node --check` still passes and every push then throws
  // "copyFor is not a function" at runtime, where the outer catch swallows it.
  for (const [name, fn] of [['copyFor', copyFor], ['resolveLang', resolveLang], ['totalDueJod', totalDueJod]]) {
    it(`${name} is a function`, () => expect(typeof fn).toBe('function'));
  }

  it('index.js destructures safeResolveLang callers from the real copy module', () => {
    const code = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const re = /const\s*\{([^}]*)\}\s*=\s*require\('(\.\/[^']+)'\)/g;
    let source = null;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (m[1].split(',').map((s) => s.trim()).includes('resolveLang')) source = m[2];
    }
    if (!source) throw new Error('no require() in index.js destructures resolveLang — anchor moved');
    expect(typeof requireCjs(source).resolveLang).toBe('function');
  });
});
