// Transaction purity guard.
//
// Firestore RETRIES a runTransaction callback on contention — and contention is
// not an edge case in this app: a last-second bid on a settling auction is
// exactly the collision that triggers a retry. Anything inside the callback
// therefore runs an unbounded number of times, so it must be idempotent.
//
// A push notification is NOT idempotent. When `admin.messaging().send()` sat
// inside the settlement transaction, a contended settlement sent the winner
// "تهانينا! لقد فزت بالمزاد 🎉" once per retry. The n8n webhooks were already
// moved post-commit for this exact reason; the FCM send was left behind.
//
// This test scans index.js and fails if any non-idempotent side effect is
// reintroduced inside ANY transaction callback. It reads source rather than
// behaviour because the defect is one of PLACEMENT — a unit test on the payload
// builder would happily pass while the call sat in the wrong block.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'index.js'), 'utf8');

/**
 * Blank out comments and string/template literals (preserving length, so
 * character offsets still line up with the original) so brace counting only
 * ever sees real code structure.
 */
function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  const blankTo = (start, end) => {
    for (let k = start; k < end; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blankTo(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blankTo(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      // Blank the contents (quotes themselves are harmless). Template `${}`
      // braces are blanked too — they are balanced, so structure is preserved.
      blankTo(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Extract the body of every `runTransaction(...)` callback in the source. */
function transactionBodies(src) {
  const code = blankNonCode(src);
  const bodies = [];
  const marker = /runTransaction\(/g;
  let m;
  while ((m = marker.exec(code)) !== null) {
    // Walk forward to the first `{` — the start of the callback body.
    let i = code.indexOf('{', m.index);
    if (i === -1) continue;
    let depth = 0;
    let end = -1;
    for (let k = i; k < code.length; k++) {
      if (code[k] === '{') depth++;
      else if (code[k] === '}') {
        depth--;
        if (depth === 0) { end = k; break; }
      }
    }
    if (end === -1) continue;
    // Return the ORIGINAL source slice so failure messages are readable.
    bodies.push({ start: i, body: src.slice(i, end + 1) });
  }
  return bodies;
}

/** 1-indexed line number of a character offset, for a useful failure message. */
function lineAt(offset) {
  return SOURCE.slice(0, offset).split('\n').length;
}

// Non-idempotent side effects: firing one twice is user-visible (a duplicate
// push / duplicate WhatsApp message), not merely wasteful.
const FORBIDDEN = [
  { name: 'admin.messaging() (FCM push)', pattern: /admin\.messaging\(\)/ },
  { name: 'postToN8n() (WhatsApp webhook)', pattern: /\bpostToN8n\(/ },
];

describe('transaction purity (index.js)', () => {
  it('finds the transaction callbacks it is meant to be guarding', () => {
    // Guards the scanner itself: if a refactor renames runTransaction or the
    // parser breaks, this catches it instead of the suite silently passing.
    expect(transactionBodies(SOURCE).length).toBeGreaterThanOrEqual(10);
  });

  for (const { name, pattern } of FORBIDDEN) {
    it(`never calls ${name} inside a transaction callback`, () => {
      const offenders = transactionBodies(SOURCE)
        .filter(({ body }) => pattern.test(body))
        .map(({ start }) => `index.js:${lineAt(start)}`);

      expect(
        offenders,
        `${name} must fire AFTER the transaction commits — Firestore retries the ` +
          `callback on contention, so this sends duplicates. Capture what you need ` +
          `inside the txn and fire it post-commit (see the notifyData pattern).`
      ).toEqual([]);
    });
  }
});
