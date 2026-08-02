// The language toggle used to write only to localStorage, which the server
// cannot read — so every WhatsApp message, email and in-app notification went
// out in the Arabic default regardless of what the customer had chosen.
//
// These are the real behavioural tests. The wiring — that AppContext's
// setLanguage actually calls this — is pinned by source text in
// src/context/languagePersistence.wiring.test.ts, because vitest here is
// environment: 'node' and the provider cannot be rendered.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  normalizeLanguage,
  canPersistLanguage,
  persistLanguagePreference,
  UNAUTHENTICATED_ID,
  type LanguagePatch,
} from './languagePersistence';

// functions/messageCopy.js is CommonJS (Cloud Functions runtime) — loaded the
// way index.js loads it rather than converting it to ESM. Same idiom as
// moneyParity.test.ts.
const require = createRequire(import.meta.url);
const { resolveLang } = require('../../functions/messageCopy.js');

/** Lets a `.catch` handler attached inside the call under test actually run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const SIGNED_IN = { isAuthenticated: true, userId: 'uid-123' };

describe('normalizeLanguage', () => {
  it('keeps the two supported values', () => {
    expect(normalizeLanguage('en')).toBe('en');
    expect(normalizeLanguage('ar')).toBe('ar');
  });

  it('falls back to Arabic for anything else', () => {
    // Arabic is the product default AND the server fallback; nothing else may
    // ever reach the user document.
    for (const junk of [undefined, null, '', 'EN', 'En', ' en', 'en ', 'fr', 'arabic', 0, 1, true, {}, [], NaN]) {
      expect(normalizeLanguage(junk)).toBe('ar');
    }
  });

  it('round-trips through the server reader for every input', () => {
    // The whole point of the field: whatever we persist must come back out of
    // functions/messageCopy.js resolveLang() unchanged. If either side changes
    // its rule, this fails before it can ship a silently-Arabic customer.
    const inputs = ['en', 'ar', 'EN', '', ' en', 'fr', null, undefined, 42, {}];
    for (const input of inputs) {
      const persisted = normalizeLanguage(input);
      expect(resolveLang({ language: persisted })).toBe(persisted);
    }
  });
});

describe('canPersistLanguage', () => {
  it('accepts a signed-in session with a real uid', () => {
    expect(canPersistLanguage(SIGNED_IN)).toBe(true);
  });

  it('rejects every signed-out shape', () => {
    // `id` is the sentinel string 'unauthenticated' when logged out — truthy,
    // so a plain `if (currentUser?.id)` would fire a doomed write on every
    // visitor toggle.
    expect(canPersistLanguage({ isAuthenticated: false, userId: UNAUTHENTICATED_ID })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true, userId: UNAUTHENTICATED_ID })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true, userId: '  unauthenticated  ' })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: false, userId: 'uid-123' })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true, userId: '' })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true, userId: '   ' })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true, userId: null })).toBe(false);
    expect(canPersistLanguage({ isAuthenticated: true })).toBe(false);
    expect(canPersistLanguage({ userId: 'uid-123' })).toBe(false);
    expect(canPersistLanguage({})).toBe(false);
    expect(canPersistLanguage(null)).toBe(false);
    expect(canPersistLanguage(undefined)).toBe(false);
  });

  it('demands a literal true, not merely a truthy flag', () => {
    expect(canPersistLanguage({ isAuthenticated: 1 as unknown as boolean, userId: 'uid-123' })).toBe(false);
  });
});

describe('persistLanguagePreference — what gets written', () => {
  it('writes the chosen language onto the signed-in user document', () => {
    const writeDoc = vi.fn();
    expect(persistLanguagePreference(SIGNED_IN, 'en', writeDoc)).toBe(true);
    expect(writeDoc).toHaveBeenCalledTimes(1);
    expect(writeDoc).toHaveBeenCalledWith('uid-123', { language: 'en' });
  });

  it('writes Arabic when Arabic is chosen', () => {
    const writeDoc = vi.fn();
    persistLanguagePreference(SIGNED_IN, 'ar', writeDoc);
    expect(writeDoc).toHaveBeenCalledWith('uid-123', { language: 'ar' });
  });

  it('writes exactly one field, named language', () => {
    // A second key here would widen a self-write that firestore.rules gates by
    // DENYLIST — anything not explicitly excluded goes through.
    const writeDoc = vi.fn();
    persistLanguagePreference(SIGNED_IN, 'en', writeDoc);
    const patch = writeDoc.mock.calls[0][1] as LanguagePatch;
    expect(Object.keys(patch)).toEqual(['language']);
  });

  it('never persists a value the server cannot read', () => {
    for (const junk of ['EN', 'english', '', null, undefined, 7, {}]) {
      const writeDoc = vi.fn();
      persistLanguagePreference(SIGNED_IN, junk, writeDoc);
      const patch = writeDoc.mock.calls[0][1] as LanguagePatch;
      expect(['ar', 'en']).toContain(patch.language);
      expect(resolveLang(patch)).toBe(patch.language);
    }
  });
});

describe('persistLanguagePreference — signed out', () => {
  it('attempts no write at all', () => {
    const writeDoc = vi.fn();
    expect(persistLanguagePreference({ isAuthenticated: false, userId: UNAUTHENTICATED_ID }, 'en', writeDoc)).toBe(false);
    expect(persistLanguagePreference({ isAuthenticated: true, userId: UNAUTHENTICATED_ID }, 'en', writeDoc)).toBe(false);
    expect(persistLanguagePreference(null, 'en', writeDoc)).toBe(false);
    expect(persistLanguagePreference(undefined, 'en', writeDoc)).toBe(false);
    expect(writeDoc).not.toHaveBeenCalled();
  });

  it('does not throw, so the visitor toggle still works', () => {
    expect(() => persistLanguagePreference(null, 'en', () => {
      throw new Error('must never be reached');
    })).not.toThrow();
  });
});

describe('persistLanguagePreference — a failed write is non-fatal', () => {
  it('swallows a rejected promise and reports it', async () => {
    const boom = new Error('permission-denied');
    const onError = vi.fn();
    expect(() =>
      persistLanguagePreference(SIGNED_IN, 'en', () => Promise.reject(boom), onError)
    ).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('leaves no unhandled rejection behind', async () => {
    // An unhandled rejection here would surface as a console error in the app
    // and, under some hosts, tear the handler down mid-toggle.
    const seen: unknown[] = [];
    const capture = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', capture);
    try {
      persistLanguagePreference(SIGNED_IN, 'en', () => Promise.reject(new Error('offline')));
      await flush();
      await flush();
    } finally {
      process.off('unhandledRejection', capture);
    }
    expect(seen).toEqual([]);
  });

  it('swallows a synchronous throw and reports it', () => {
    const boom = new Error('db handle missing');
    const onError = vi.fn();
    expect(() =>
      persistLanguagePreference(SIGNED_IN, 'en', () => { throw boom; }, onError)
    ).not.toThrow();
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('survives a failure with no error reporter supplied', async () => {
    expect(() => persistLanguagePreference(SIGNED_IN, 'en', () => { throw new Error('x'); })).not.toThrow();
    expect(() => persistLanguagePreference(SIGNED_IN, 'en', () => Promise.reject(new Error('y')))).not.toThrow();
    await flush();
  });

  it('survives a reporter that itself throws', () => {
    expect(() =>
      persistLanguagePreference(SIGNED_IN, 'en', () => { throw new Error('x'); }, () => { throw new Error('reporter'); })
    ).not.toThrow();
  });

  it('returns synchronously rather than handing the caller a promise to await', () => {
    // The toggle must be instant: nothing here may make the UI wait on the
    // network before the language flips.
    const returned = persistLanguagePreference(SIGNED_IN, 'en', () => new Promise(() => {}));
    expect(returned).toBe(true);
    expect(typeof (returned as unknown as { then?: unknown }).then).toBe('undefined');
  });

  it('tolerates a writer that returns no promise', () => {
    expect(() => persistLanguagePreference(SIGNED_IN, 'en', () => undefined)).not.toThrow();
    expect(() => persistLanguagePreference(SIGNED_IN, 'en', () => 42)).not.toThrow();
  });
});
