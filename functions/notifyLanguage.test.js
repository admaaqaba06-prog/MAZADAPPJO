// notify() cannot be imported (index.js initialises firebase-admin at module
// load), so this file gets at it two ways.
//
// 1. Source-text assertions — the house idiom, see
//    functions/secondChanceCallable.test.js. Anchored on real syntax, never on a
//    character count: five briefs on this project shipped fixed-width windows and
//    every one of them was wrong. Every anchor lookup goes through `at()` /
//    `callsTo()`, which THROW when the anchor is gone. A bare `indexOf` returns
//    -1, and -1 is less than every real position, so a `toBeGreaterThan`
//    comparison against a missing anchor passes vacuously — that exact failure
//    mode has shipped repeatedly on this branch.
//
// 2. Behavioural assertions — `notifyBody()` is compiled with `new Function` and
//    handed injected `db` / `channelsFor` / `resolveLang` / `copyFor` /
//    `emailFor` / `postToN8n`. This runs the REAL production source, so it
//    proves what the source text cannot: that the language actually RESOLVED
//    from the user doc is the value the three renderers receive. vi.mock cannot
//    intercept a CommonJS require() from an ESM test, so injection is the only
//    way to exercise the body at all.
//
// Why both: a previous revision of this file was 9/9 green against a mutant
// reading `const _probe = resolveLang(user); const lang = 'ar';` — every
// customer, forever, in Arabic, with the evidence file saying PASS. The
// source-text tests pin WHERE the wiring lives; the behavioural tests pin WHAT
// flows through it. Neither alone is enough.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const requireCjs = createRequire(import.meta.url);

function notifyBody() {
  const start = SRC.indexOf('async function notify({');
  if (start === -1) throw new Error('notify() not found — anchor moved');
  const end = SRC.indexOf('\n}', start);
  if (end === -1) throw new Error('notify() end not found — anchor moved');
  return SRC.slice(start, end + 2);
}

// Comments are stripped before anything is asserted against the body. They are
// prose, not wiring: notify()'s own comment explains that the language "MUST be
// read after `user = s.data()`", and an anchor search that sees comment text
// finds that sentence and reports the ordering as correct even after the real
// assignment has been refactored away. Verified — it did exactly that.
// A small scanner rather than a regex, so a `//` inside a string or the
// `${c.title}\n${c.description}` template cannot be mistaken for a comment.
// It does NOT understand regex literals — notify() currently has none, and a
// regex containing a quote character would confuse the string tracking. That
// shows up as an anchor miss (a thrown error), not as a silent pass.
function stripComments(src) {
  let out = '';
  let mode = null; // null | "'" | '"' | '`' | 'line' | 'block'
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

const body = stripComments(notifyBody());

// Position of an anchor inside notify(), or a thrown error. NEVER -1: a
// positional assertion against -1 is a test that passes because the thing it
// was watching disappeared.
function at(needle) {
  const i = body.indexOf(needle);
  if (i === -1) throw new Error(`anchor not found in notify(): ${needle}`);
  return i;
}

// Every call to `name(...)` in notify(), extracted with balanced parentheses so
// a nested object/array/call in the arguments cannot truncate the match. A
// `[^)]*` or `\{[^}]*\}` regex breaks the moment an argument nests, which turns
// an unrelated edit into a false red pointing at the language wiring.
function callsTo(name) {
  const out = [];
  const idChar = /[A-Za-z0-9_$.]/;
  let from = 0;
  for (;;) {
    const i = body.indexOf(`${name}(`, from);
    if (i === -1) break;
    from = i + name.length;
    if (i > 0 && idChar.test(body[i - 1])) continue; // part of a longer identifier
    let depth = 0;
    let j = i + name.length;
    for (; j < body.length; j++) {
      if (body[j] === '(') depth++;
      else if (body[j] === ')') {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    if (depth !== 0) throw new Error(`unbalanced parentheses in ${name}() call — anchor moved`);
    out.push(body.slice(i, j));
    from = j;
  }
  if (out.length === 0) throw new Error(`no ${name}() call found in notify() — anchor moved`);
  return out;
}

// Which module index.js destructures a given name out of. Throws if nothing
// does, so this can never silently vacuum up to "no requires, nothing to check".
function requireSourceFor(name) {
  // Comment lines are dropped for the same reason the body strips them: the
  // require block here is documented in prose that names these same modules.
  const code = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const re = /const\s*\{([^}]*)\}\s*=\s*require\('(\.\/[^']+)'\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const bound = m[1].split(',').map((s) => s.split(':')[0].trim());
    if (bound.includes(name)) return m[2];
  }
  throw new Error(`no require() in index.js destructures ${name} — anchor moved`);
}

// ---------------------------------------------------------------------------
// Behavioural harness: compile the real notify() source against injected deps.
// ---------------------------------------------------------------------------

function runNotify({ userDoc = { language: 'en', name: 'Sara', email: 's@x.jo', phoneNumber: '+962700' },
                     channels = { inapp: true, whatsapp: true, email: true },
                     data = { auctionId: 'A1', amount: 25 },
                     event = 'auction_won',
                     throwIn = null } = {}) {
  const seen = { resolveLang: [], copyFor: [], emailFor: [], added: [], posted: [], warned: [] };

  const boom = (which) => { if (throwIn === which) throw new Error(`${which} exploded`); };

  const deps = {
    db: {
      collection: (name) => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => userDoc }) }),
        add: async (doc) => { seen.added.push({ collection: name, doc }); },
      }),
    },
    channelsFor: () => channels,
    resolveLang: (u) => {
      seen.resolveLang.push(u);
      boom('resolveLang');
      return u && u.language === 'en' ? 'en' : 'ar';
    },
    copyFor: (ev, dat, lang) => {
      seen.copyFor.push({ event: ev, data: dat, lang });
      boom('copyFor');
      return {
        type: `type_${ev}`,
        title: `T:${lang}:${dat && dat.auctionId}`,
        description: `D:${lang}:${dat && dat.amount}`,
      };
    },
    emailFor: (ev, dat, lang) => {
      seen.emailFor.push({ event: ev, data: dat, lang });
      boom('emailFor');
      return { subject: `S:${lang}`, body: `B:${lang}` };
    },
    postToN8n: async (ev, payload) => { seen.posted.push({ event: ev, payload }); },
    console: { warn: (...a) => { seen.warned.push(a.join(' ')); } },
  };

  const factory = new Function('deps', `
    const { db, channelsFor, resolveLang, copyFor, emailFor, postToN8n, console } = deps;
    ${body}
    return notify;
  `);

  return { seen, done: factory(deps)({ uid: 'u1', event, data }) };
}

describe('notify() sends in the recipient language', () => {
  it('resolves the language from the user doc it already loaded', () => {
    // The doc is already fetched for phone/email/name, so this costs no extra read.
    expect(body).toMatch(/resolveLang\(user\)/);
  });

  it('resolves it AFTER the user doc is assigned, not merely after the read', () => {
    // The `.get()` is NOT the anchor that matters. Resolving between the read
    // and `user = s.data()` sees `user === {}` and sends every recipient
    // Arabic, while an assertion anchored on collection('users') stays green.
    expect(at('resolveLang(user)')).toBeGreaterThan(at('user = s.data()'));
  });

  it('hands the RESOLVED language — not a literal — to all three renderers', async () => {
    // Kills "probe plus hardcode": `const _probe = resolveLang(user);
    // const lang = 'ar';` satisfies every source-text assertion in this file
    // while sending every customer Arabic. Only executing the body catches it.
    const { seen, done } = runNotify({ userDoc: { language: 'en', name: 'Sara' } });
    await done;
    expect(seen.resolveLang).toEqual([{ language: 'en', name: 'Sara' }]); // the LOADED doc, not {}
    expect(seen.copyFor.length).toBe(2); // in-app + wa_text
    for (const c of seen.copyFor) expect(c.lang).toBe('en');
    expect(seen.emailFor.length).toBe(1);
    expect(seen.emailFor[0].lang).toBe('en');
  });

  it('sends an Arabic-preference recipient Arabic, from the same resolved value', async () => {
    const { seen, done } = runNotify({ userDoc: { language: 'ar', name: 'Omar' } });
    await done;
    for (const c of seen.copyFor) expect(c.lang).toBe('ar');
    expect(seen.emailFor[0].lang).toBe('ar');
  });

  it('passes the language to the in-app copy', () => {
    // Named for the in-app write, so it must fail when only the in-app write
    // loses its language — a source-text /copyFor\(event, d, lang\)/ is
    // satisfied by the wa_text call site and does not test its own name.
    const { seen, done } = runNotify();
    return done.then(() => {
      expect(seen.added.length).toBe(1);
      expect(seen.added[0].collection).toBe('notifications');
      expect(seen.added[0].doc.title).toBe('T:en:A1');
      expect(seen.added[0].doc.description).toBe('D:en:25');
    });
  });

  // notify() calls copyFor TWICE — once for the in-app write, once for wa_text.
  // A single toMatch is satisfied by either one, so dropping `lang` from the
  // in-app write alone survives it: the bell would go out in Arabic to an
  // English reader while WhatsApp got it right. Every call site must carry the
  // full (event, d, lang) shape — a tail-only /,\s*lang\s*\)$/ check leaves
  // `copyFor(event, {}, lang)` green, which ships «مبروك! ربحت "".» with no
  // title and no amount, in the correct language.
  it('gives every copyFor call the event, the data AND the language', () => {
    const calls = callsTo('copyFor');
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call).toMatch(/^copyFor\(\s*event\s*,\s*d\s*,\s*lang\s*\)$/);
  });

  it('actually renders the WhatsApp body from the notification data', async () => {
    // The behavioural half of the above: `copyFor(event, {}, lang)` produces a
    // wa_text with an empty title and empty amount, in the right language.
    const { seen, done } = runNotify({ data: { auctionId: 'A9', amount: 40 } });
    await done;
    for (const c of seen.copyFor) {
      expect(c.data).toMatchObject({ auctionId: 'A9', amount: 40 });
    }
    expect(seen.posted[0].payload.wa_text).toBe('T:en:A9\nD:en:40');
  });

  it('passes the language to the email renderer', () => {
    // Balanced-paren extraction, not /\{[^}]*\}/: that regex cannot cross a
    // `}`, so any nested object in the email data literal becomes a false red
    // pointing at the language wiring instead of at the real change.
    const calls = callsTo('emailFor');
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatch(/^emailFor\(\s*event\s*,\s*\{[\s\S]*\}\s*,\s*lang\s*\)$/);
  });

  it('sends wa_text so the n8n node does not have to render it', () => {
    expect(body).toMatch(/wa_text:/);
  });

  it('still sends email_content — the node prefers it', () => {
    expect(body).toMatch(/email_content:/);
  });

  it('gates wa_text on the whatsapp channel, as email_content is gated on email', () => {
    expect(body).toMatch(/channels\.whatsapp\s*\?\s*\{\s*wa_text/);
  });

  it('omits wa_text and email_content on an in-app-only event', async () => {
    const { seen, done } = runNotify({ channels: { inapp: true, whatsapp: false, email: false } });
    await done;
    expect(seen.posted).toEqual([]); // nothing leaves the building
    expect(seen.emailFor).toEqual([]);
    expect(seen.copyFor.length).toBe(1); // in-app only
  });

  it('sends wa_text but no email_content when only whatsapp is on', async () => {
    const { seen, done } = runNotify({ channels: { inapp: false, whatsapp: true, email: false } });
    await done;
    expect(seen.posted.length).toBe(1);
    expect(seen.posted[0].payload.wa_text).toBe('T:en:A1\nD:en:25');
    expect('email_content' in seen.posted[0].payload).toBe(false);
  });

  // The shape is load-bearing, not cosmetic: Task 4 makes the n8n node PREFER
  // wa_text and fall back to its own rendering, which is
  // `n8n/build-messages.js`'s `c.description ? `${c.title}\n${c.description}` :
  // c.title`. A different separator here would silently reformat every message
  // whenever the fallback ran, and nothing else in the suite would notice.
  it('renders wa_text in the shape the n8n node already produces', () => {
    expect(body).toMatch(/c\.description\s*\?\s*`\$\{c\.title\}\\n\$\{c\.description\}`\s*:\s*c\.title/);
  });
});

describe('notify() never throws — the money-path contract', () => {
  // notify() is awaited inside settlement, escrow and bid post-commit paths that
  // rely on it not throwing (see its header comment). postToN8n is documented as
  // never throwing, but its ARGUMENT EXPRESSION is evaluated by notify(), so any
  // renderer evaluated inline in that literal throws straight out of notify().
  // These tests fail if any renderer is moved back inside the payload literal,
  // or if the resolveLang guard is removed.
  for (const which of ['resolveLang', 'copyFor', 'emailFor']) {
    it(`swallows a throw from ${which} instead of propagating it out of notify()`, async () => {
      const { done } = runNotify({ throwIn: which });
      await expect(done).resolves.toBeUndefined();
    });
  }

  it('still delivers the surfaces that did not fail when one renderer throws', async () => {
    const { seen, done } = runNotify({ throwIn: 'emailFor' });
    await done;
    expect(seen.posted.length).toBe(1);
    // What n8n actually receives is postToN8n's JSON.stringify of this payload,
    // so assert the wire form: an undefined email_content never leaves the box.
    const wire = JSON.parse(JSON.stringify(seen.posted[0].payload));
    expect('email_content' in wire).toBe(false);
    expect(wire.wa_text).toBe('T:en:A1\nD:en:25');
  });

  it('falls back to Arabic — not to a crash — when resolveLang throws', async () => {
    const { seen, done } = runNotify({ throwIn: 'resolveLang' });
    await done;
    for (const c of seen.copyFor) expect(c.lang).toBe('ar');
  });

  // The guards above only help if the imports resolve to real functions.
  // Repointing any of these requires at a module that does not export the name
  // binds `undefined`; `node --check` passes, notify() then throws "x is not a
  // function" on every call, and nothing inside notifyBody() can see it.
  for (const name of ['resolveLang', 'copyFor', 'emailFor']) {
    it(`imports ${name} from a module that actually exports it`, () => {
      const mod = requireCjs(requireSourceFor(name));
      expect(typeof mod[name]).toBe('function');
    });
  }
});
