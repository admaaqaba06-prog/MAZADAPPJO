// The language toggle wrote only to localStorage, so the server could never
// know what language a recipient reads and every WhatsApp message, email and
// in-app notification fell back to Arabic. `setLanguage` now also persists to
// `users/{uid}.language`, which is what `resolveLang` in
// functions/messageCopy.js reads.
//
// The behaviour lives in src/utils/languagePersistence.ts and is unit-tested
// there. THIS file pins the wiring: that AppContext's setLanguage calls it, in
// the right order, with the right arguments, and without awaiting. Source-text,
// because vitest here is environment: 'node' — there is no jsdom and no
// @testing-library, so the provider cannot be rendered.
//
// House rule this file obeys, learned the expensive way on this branch: every
// anchor THROWS when it is missing. No fixed character windows, no comparing
// `indexOf(...)` against -1 and passing, and comments are stripped before any
// assertion — one earlier test on this branch passed because its anchor text
// also appeared in a comment.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./AppContext.tsx', import.meta.url), 'utf8');
const LANDING = readFileSync(new URL('../landing/LandingView.tsx', import.meta.url), 'utf8');

/**
 * Removes `//` and block comments, leaving string literals intact. Applied to
 * every slice before it is asserted on, so a mutant cannot satisfy a test by
 * mentioning the anchor in a comment.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        const done = src[i] === quote;
        i++;
        if (done) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * The text between `src[open]` (which must be an opening bracket) and its match,
 * skipping comments and string literals. Real bracket matching rather than a
 * character window: a window overruns into the next declaration, and a
 * `\n  }, [` sentinel false-fails the moment a formatter reflows the callback.
 */
function balanced(src: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const close = pairs[src[open]];
  if (!close) throw new Error(`balanced(): index ${open} is not an opening bracket`);
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === src[open]) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
    i++;
  }
  throw new Error(`balanced(): no closing '${close}' for the bracket at ${open} — source is unbalanced`);
}

const CALL_ANCHOR = 'const setLanguage = useCallback(';

/** The whole `useCallback(...)` call — body AND dependency array. Throws if gone. */
function setLanguageCall(src: string): string {
  const start = src.indexOf(CALL_ANCHOR);
  if (start === -1) throw new Error(`anchor moved — '${CALL_ANCHOR}' is not in the source`);
  if (src.indexOf(CALL_ANCHOR, start + 1) !== -1) {
    throw new Error('anchor is ambiguous — setLanguage is declared more than once');
  }
  return stripComments(balanced(src, start + CALL_ANCHOR.length - 1));
}

/** Just the arrow-function body of that callback. Throws if it has none. */
function setLanguageBody(call: string): string {
  const open = call.indexOf('{');
  if (open === -1) throw new Error('setLanguage has no block body — anchor moved');
  return balanced(call, open);
}

/** Index of `re` in `text`, throwing rather than silently yielding -1. */
function at(text: string, re: RegExp, label: string): number {
  const m = text.match(re);
  if (!m || m.index === undefined) throw new Error(`${label} not found — ${re}`);
  return m.index;
}

const CALL = setLanguageCall(SRC);
const BODY = setLanguageBody(CALL);

describe('the test helpers fail loudly rather than vacuously', () => {
  it('throws when the setLanguage anchor is gone', () => {
    expect(() => setLanguageCall('const somethingElse = 1;')).toThrow(/anchor moved/);
  });

  it('throws when the callback body is gone', () => {
    expect(() => setLanguageBody('(lang) => setLanguageState(lang), [])')).toThrow(/no block body/);
  });

  it('throws on an unbalanced source instead of returning a short slice', () => {
    expect(() => balanced('(a, b', 0)).toThrow(/unbalanced/);
  });

  it('throws instead of reporting -1 when an anchor is absent', () => {
    expect(() => at('nothing here', /updateDoc/, 'the write')).toThrow(/not found/);
  });

  it('strips comments, so no assertion can be satisfied by a comment', () => {
    const commented = [
      '// updateDoc(doc(db, "users", uid), patch)',
      '/* persistLanguagePreference(session, lang) */',
      "const key = 'mazad_language'; // language: lang",
    ].join('\n');
    const stripped = stripComments(commented);
    expect(stripped).not.toMatch(/updateDoc/);
    expect(stripped).not.toMatch(/persistLanguagePreference/);
    expect(stripped).not.toMatch(/language: lang/);
    // ...while leaving real code, including string literals, untouched.
    expect(stripped).toMatch(/const key = 'mazad_language';/);
  });

  it('really did slice the live callback, not an empty string', () => {
    expect(BODY.length).toBeGreaterThan(50);
    expect(CALL).toMatch(/^\(/);
    expect(CALL).toMatch(/\)$/);
  });
});

describe('setLanguage still switches the UI locally', () => {
  it('sets the React state', () => {
    expect(BODY).toMatch(/setLanguageState\(lang\)/);
  });

  it('still writes the same localStorage key the landing page reads', () => {
    // LandingView reads this key directly; renaming it silently strands the
    // pre-login language choice.
    expect(BODY).toMatch(/localStorage\.setItem\('mazad_language',\s*lang\)/);
    expect(LANDING).toMatch(/localStorage\.getItem\('mazad_language'\)/);
  });

  it('does both BEFORE touching the network', () => {
    // If the write moved first, a throw from it would leave the UI in the old
    // language — exactly the failure this task must not introduce.
    const state = at(BODY, /setLanguageState\(lang\)/, 'the state update');
    const store = at(BODY, /localStorage\.setItem\('mazad_language'/, 'the localStorage write');
    const persist = at(BODY, /persistLanguagePreference\(/, 'the persistence call');
    expect(state).toBeLessThan(store);
    expect(store).toBeLessThan(persist);
  });
});

describe('setLanguage persists the preference to the user document', () => {
  it('calls the shared, unit-tested helper', () => {
    expect(BODY).toMatch(/persistLanguagePreference\(/);
  });

  it('imports it from the module that owns the rules', () => {
    expect(stripComments(SRC)).toMatch(
      /import \{ persistLanguagePreference \} from '\.\.\/utils\/languagePersistence';/
    );
  });

  it('writes the language field onto users/{uid}, and nothing else', () => {
    // Pins the collection, the document id and the patch together. A wrong
    // collection, a wrong field name, or an inlined literal instead of the
    // normalised patch all fail here.
    expect(BODY).toMatch(/\(uid, patch\) => updateDoc\(doc\(db, 'users', uid\), patch\)/);
    const writes = BODY.match(/updateDoc\(/g) ?? [];
    expect(writes).toHaveLength(1);
  });

  it('passes the chosen language through, unmodified', () => {
    // `lang` as the second argument — the helper normalises it to 'ar'|'en'.
    expect(BODY).toMatch(/persistLanguagePreference\(\s*\{[^}]*\},\s*lang,/);
  });

  it('only writes for a real signed-in session', () => {
    // The session literal is pinned exactly. A signed-out visitor's
    // currentUser.id is the truthy sentinel 'unauthenticated', so hardcoding
    // `isAuthenticated: true` — or dropping the flag — fires a doomed write on
    // every visitor toggle. Both mutations fail here.
    expect(BODY).toMatch(/\{\s*isAuthenticated,\s*userId:\s*currentUser\?\.id\s*\}/);
    expect(BODY).not.toMatch(/isAuthenticated:\s*true/);
  });

  it('re-binds the callback when the session changes', () => {
    // A stale closure would keep writing to the previous account's document.
    const deps = CALL.slice(at(CALL, /\}\s*,\s*\[/, 'the dependency array'));
    expect(deps).toMatch(/isAuthenticated/);
    expect(deps).toMatch(/currentUser\?\.id/);
  });
});

describe('a failed write can never break the toggle', () => {
  it('never awaits the persistence call', () => {
    // Awaiting would make the toggle wait on the network and turn a rejection
    // into an unhandled one inside the event handler.
    expect(BODY).not.toMatch(/\bawait\b/);
    expect(BODY).not.toMatch(/return\s+persistLanguagePreference/);
  });

  it('hands the helper a non-fatal error reporter', () => {
    expect(BODY).toMatch(/\(err\) => console\.warn\(/);
    // A `throw` in the reporter would defeat the whole arrangement.
    expect(BODY).not.toMatch(/\bthrow\b/);
  });

  it('routes the write through the helper rather than firing it directly', () => {
    // A bare `updateDoc(...)` statement outside the helper would be an
    // uncaught, unguarded write.
    const persist = at(BODY, /persistLanguagePreference\(/, 'the persistence call');
    const write = at(BODY, /updateDoc\(/, 'the Firestore write');
    expect(persist).toBeLessThan(write);
  });
});
