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
import { persistLanguagePreference } from '../utils/languagePersistence';

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

// --- The landing page carries a SECOND language toggle (two buttons, desktop
// and mobile nav) with its own `lang` state. App.tsx renders LandingView for
// signed-in users too — "the logo routes here" — so that toggle is reached by
// customers with a live, writable uid. It wrote localStorage alone, which meant
// switching there changed the UI and left users/{uid}.language untouched: an
// Arabic-reading customer kept getting English WhatsApp and email indefinitely.
// It now delegates to the same `setLanguage` pinned above.
const TOGGLE_ANCHOR = 'const toggleLang = ';

/** The arrow-function body of LandingView's `toggleLang`. Throws if it moved. */
function landingToggleBody(src: string): string {
  const start = src.indexOf(TOGGLE_ANCHOR);
  if (start === -1) throw new Error(`anchor moved — '${TOGGLE_ANCHOR}' is not in LandingView`);
  if (src.indexOf(TOGGLE_ANCHOR, start + 1) !== -1) {
    throw new Error('anchor is ambiguous — toggleLang is declared more than once');
  }
  const open = src.indexOf('{', start);
  if (open === -1) throw new Error('toggleLang has no block body — anchor moved');
  // Guard against slicing a destructured PARAMETER instead of the body: whatever
  // sits between the anchor and that brace must be an empty arrow head. A shape
  // change fails loudly here rather than yielding a plausible wrong slice.
  const head = src.slice(start, open);
  if (!/^const toggleLang = \(\s*\)\s*=>\s*$/.test(head)) {
    throw new Error(`toggleLang is no longer a zero-argument arrow — got '${head.trim()}'`);
  }
  return stripComments(balanced(src, open));
}

const TOGGLE = landingToggleBody(LANDING);

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

  it('throws when the landing toggle anchor is gone', () => {
    expect(() => landingToggleBody('const somethingElse = 1;')).toThrow(/anchor moved/);
  });

  it('throws rather than slicing a destructured parameter as the toggle body', () => {
    expect(() => landingToggleBody('const toggleLang = ({ next }) => setLang(next);'))
      .toThrow(/zero-argument arrow/);
  });

  it('really did slice the live landing toggle, not an empty string', () => {
    expect(TOGGLE.length).toBeGreaterThan(50);
    expect(TOGGLE).toMatch(/^\{/);
    expect(TOGGLE).toMatch(/\}$/);
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
    // Matches the NAME within the import set rather than the exact line: the
    // module legitimately exports more than one thing now (shouldAdoptLocalLanguage
    // joined it), and pinning the literal line made adding a sibling import a
    // false failure. What must hold is that the helper comes from THIS module,
    // not that it arrives alone.
    expect(stripComments(SRC)).toMatch(
      /import\s*\{[^}]*\bpersistLanguagePreference\b[^}]*\}\s*from\s*'\.\.\/utils\/languagePersistence'/
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

describe("the landing page's own toggle persists too", () => {
  it('still flips its local state and the shared localStorage key', () => {
    // LandingView renders from its own `lang` state, so this is what makes the
    // marketing page switch at all. Neither may be dropped in favour of the
    // context call: the context's `language` is not what this page reads.
    expect(TOGGLE).toMatch(/setLang\(next\)/);
    expect(TOGGLE).toMatch(/localStorage\.setItem\('mazad_language',\s*next\)/);
  });

  it('reaches users/{uid}.language through the context setLanguage', () => {
    // The fix for "the second toggle does not persist". Delete this call and a
    // signed-in customer switching language here keeps receiving WhatsApp and
    // email in the language they had before — the exact defect this branch exists
    // to remove.
    expect(TOGGLE).toMatch(/setLanguage\(next\)/);
    expect(stripComments(LANDING)).toMatch(/import \{ useApp \} from "\.\.\/context\/AppContext";/);
    expect(stripComments(LANDING)).toMatch(/const \{ setLanguage \} = useApp\(\);/);
  });

  it('flips locally BEFORE it persists', () => {
    // Same rule as the app toggle: the UI switch must not be behind the network.
    const state = at(TOGGLE, /setLang\(next\)/, 'the local state flip');
    const store = at(TOGGLE, /localStorage\.setItem\('mazad_language'/, 'the localStorage write');
    const persist = at(TOGGLE, /setLanguage\(next\)/, 'the persistence call');
    expect(state).toBeLessThan(store);
    expect(store).toBeLessThan(persist);
  });

  it('never awaits it and never writes Firestore itself', () => {
    // A second, un-guarded implementation is the failure mode this delegation
    // exists to prevent: `updateDoc` here would bypass canPersistLanguage and
    // write users/unauthenticated for every logged-out visitor who taps it.
    expect(TOGGLE).not.toMatch(/\bawait\b/);
    expect(stripComments(LANDING)).not.toMatch(/updateDoc\(/);
    expect(stripComments(LANDING)).not.toMatch(/persistLanguagePreference\(/);
  });
});

describe('the write the landing toggle reaches is guarded, signed out and sentinel alike', () => {
  // Behavioural, not source-text: the landing toggle's write path ends in
  // persistLanguagePreference via setLanguage, and the value of delegating is
  // that THIS guard covers it. Loosening the guard to a truthy id — the naive
  // `if (currentUser?.id)` — fires a doomed write to users/unauthenticated on
  // every visitor tap of the landing toggle, and fails here.
  const attempts = () => {
    const writes: Array<{ uid: string; patch: unknown }> = [];
    return {
      writes,
      writeDoc: (uid: string, patch: unknown) => { writes.push({ uid, patch }); },
    };
  };

  it('writes nothing for a logged-out visitor holding the sentinel id', () => {
    const a = attempts();
    expect(persistLanguagePreference(
      { isAuthenticated: false, userId: 'unauthenticated' }, 'en', a.writeDoc
    )).toBe(false);
    // Even if the flag were wrongly true, the sentinel is never a document.
    expect(persistLanguagePreference(
      { isAuthenticated: true, userId: 'unauthenticated' }, 'en', a.writeDoc
    )).toBe(false);
    // And a real uid with no session is still not a write we may make.
    expect(persistLanguagePreference(
      { isAuthenticated: false, userId: 'realuid123' }, 'en', a.writeDoc
    )).toBe(false);
    expect(a.writes).toEqual([]);
  });

  it('writes the normalised language for a real signed-in session', () => {
    const a = attempts();
    expect(persistLanguagePreference(
      { isAuthenticated: true, userId: 'realuid123' }, 'en', a.writeDoc
    )).toBe(true);
    expect(a.writes).toEqual([{ uid: 'realuid123', patch: { language: 'en' } }]);
  });
});

// ---------------------------------------------------------------------------
// Pre-login adoption, wired into the post-auth user-doc snapshot.
//
// Source-text because vitest here is node-only and AppContext cannot be
// rendered. Every anchor throws — a slice that silently came back empty would
// make each assertion below vacuous, which has shipped on this branch before.
// ---------------------------------------------------------------------------
const SNAP_ANCHOR = 'const unsubUser = onSnapshot(userRef';

function snapshotHandler(src: string): string {
  const i = src.indexOf(SNAP_ANCHOR);
  if (i === -1) throw new Error(`user-doc snapshot anchor moved: ${SNAP_ANCHOR}`);
  const open = src.indexOf('{', src.indexOf('(snap)', i));
  if (open === -1) throw new Error('snapshot handler has no block body — anchor moved');
  return balanced(src, open);
}

const SNAP = snapshotHandler(SRC);

describe('a language chosen before signing in is adopted after signing in', () => {
  it('calls the shared rule inside the user-doc snapshot', () => {
    // Not a second hand-rolled guard: the sentinel-id trap lives in
    // canPersistLanguage, and re-implementing it here would reintroduce it.
    expect(SNAP).toMatch(/shouldAdoptLocalLanguage\(/);
    expect(SRC).toMatch(/import\s*\{[^}]*shouldAdoptLocalLanguage[^}]*\}\s*from\s*'\.\.\/utils\/languagePersistence'/);
  });

  it('passes the doc language and the stored value, not just a session', () => {
    const call = balanced(SNAP, SNAP.indexOf('(', at(SNAP, /shouldAdoptLocalLanguage\(/, 'adoption call')));
    expect(call).toMatch(/docLanguage:\s*fbData\.language/);
    expect(call).toMatch(/storedLanguage:\s*localStorage\.getItem\('mazad_language'\)/);
    expect(call).toMatch(/isAuthenticated/);
  });

  it('writes through the SAME persistence path as the toggle', () => {
    expect(SNAP).toMatch(/persistLanguagePreference\(/);
    // and via updateDoc on the users collection, like setLanguage does
    expect(SNAP).toMatch(/updateDoc\(doc\(db,\s*'users',\s*uid\),\s*patch\)/);
  });

  it('marks the session adopted BEFORE writing, so a second snapshot cannot duplicate it', () => {
    // The snapshot fires on every profile change. If the flag were set after
    // the await-less write, two snapshots in flight would both write.
    const setFlag = at(SNAP, /languageAdoptedRef\.current\s*=\s*true/, 'adopted flag set');
    const write = at(SNAP, /persistLanguagePreference\(/, 'persist call');
    expect(setFlag).toBeLessThan(write);
  });

  it('uses a ref, not state — flipping it must not re-render', () => {
    expect(SRC).toMatch(/const languageAdoptedRef\s*=\s*useRef<boolean>\(false\)/);
  });

  it('resets on sign-out so the next account gets its own adoption', () => {
    // In the auth-state listener's signed-out branch, which also covers an
    // expired or revoked session — not only an explicit logout().
    const i = at(SRC, /setCurrentUser\(DEFAULT_UNAUTHENTICATED_USER\);\s*\n\s*setIsAuthenticated\(false\);/, 'signed-out branch');
    const after = SRC.slice(i, i + 600);
    expect(after).toMatch(/languageAdoptedRef\.current\s*=\s*false/);
  });
});
