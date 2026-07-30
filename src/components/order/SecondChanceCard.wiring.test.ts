/**
 * SecondChanceCard — the WIRING, which no behavioural test here can reach.
 *
 * The card's copy and money helpers are pure and exhaustively covered in
 * `src/utils/secondChanceOffer.test.ts`. What that coverage cannot see is the
 * two lines that CALL them. A review demonstrated the gap by changing
 * `secondChanceAcceptLabel(state.acceptAction, offer.amount, isAr)` to pass
 * `totalDue` instead: the seller's button then reads «اقبل — تستلم 99.75 د.أ»
 * directly above «صافي ما تستلمه: 95 د.أ» — the precise contradiction the
 * seller-net work exists to kill — and the entire suite stayed green.
 *
 * Vitest here is `environment: 'node'` with no jsdom and no @testing-library, so
 * the component cannot be rendered. The repo's answer to exactly this shape is a
 * source-text assertion: see `functions/secondChanceCallable.test.js`, which
 * pins `secondChanceOrderMoney(` and the status literals by reading index.js as
 * a string. Same technique, same reason.
 *
 * THE HAZARD BEING PINNED, precisely: three helpers on this card take a money
 * argument, and two of them take the RAW HAMMER amount while the third takes the
 * buyer's TOTAL. All three are `number`, so every substitution among them
 * typechecks, renders, and is wrong.
 *
 *   secondChanceAcceptLabel(action, offer.amount, isAr)   ← hammer; derives both
 *   secondChanceSellerNetNote(offer.amount, isAr)         ← hammer
 *   secondChanceAcceptNote(action, totalDue, isAr)        ← already the total
 *
 * Argument positions are compared after parsing the call, not by regex over the
 * whole line, so reformatting (line breaks, spacing, trailing commas) does not
 * break these tests — only an actual change of argument does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'SecondChanceCard.tsx'), 'utf8');

/**
 * The top-level arguments of the first CALL to `fnName`, whitespace-collapsed.
 * Brace/bracket/paren depth is tracked so nested calls and object literals stay
 * inside their own argument. The import list is never matched — it has no `(`.
 */
function callArgs(fnName: string): string[] {
  const start = SRC.indexOf(`${fnName}(`);
  expect(start, `${fnName} is never called in SecondChanceCard.tsx`).toBeGreaterThan(-1);

  let i = start + fnName.length + 1; // just past the opening paren
  let depth = 1;
  const args: string[] = [];
  let cur = '';
  while (i < SRC.length) {
    const ch = SRC[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) break;
    }
    if (ch === ',' && depth === 1) {
      args.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  expect(depth, `unbalanced parens while parsing ${fnName}(...)`).toBe(0);
  args.push(cur);
  return args.map((a) => a.replace(/\s+/g, ' ').trim()).filter((a) => a !== '');
}

describe('SecondChanceCard wiring — the money argument each helper receives', () => {
  it("the Accept LABEL is built from the raw bid, so it can derive the seller's net", () => {
    const args = callArgs('secondChanceAcceptLabel');
    expect(args[1]).toBe('offer.amount');
  });

  it('the Accept LABEL is never handed a pre-computed total', () => {
    const args = callArgs('secondChanceAcceptLabel');
    // The exact substitution the review made. `totalDue` is the BUYER's number;
    // handing it over makes the seller's button contradict the line above it.
    expect(args[1]).not.toBe('totalDue');
    expect(args[1]).not.toBe('totalMoney');
    expect(args[1]).not.toMatch(/total/i);
  });

  it("the seller's NET NOTE is built from the same raw bid as the label", () => {
    const netArgs = callArgs('secondChanceSellerNetNote');
    const labelArgs = callArgs('secondChanceAcceptLabel');
    expect(netArgs[0]).toBe('offer.amount');
    // Same input or the two lines can disagree — the whole point of both
    // helpers taking the hammer rather than a derived figure.
    expect(netArgs[0]).toBe(labelArgs[1]);
  });

  it("the seller's NET NOTE is never handed a total either", () => {
    const args = callArgs('secondChanceSellerNetNote');
    expect(args[0]).not.toMatch(/total/i);
  });

  it('the mandated Accept NOTE still receives the buyer total, not the raw bid', () => {
    // The inverse hazard: this one is SUPPOSED to be the total. Passing
    // `offer.amount` would understate the mandated «سيتم إنشاء طلب بقيمة …» by
    // the 5% premium — a customer being shown a price lower than they will owe.
    const args = callArgs('secondChanceAcceptNote');
    expect(args[1]).toBe('totalDue');
    expect(args[1]).not.toBe('offer.amount');
  });

  it('all three helpers are actually called by the card', () => {
    for (const fn of ['secondChanceAcceptLabel', 'secondChanceSellerNetNote', 'secondChanceAcceptNote']) {
      expect(SRC).toContain(`${fn}(`);
    }
  });

  it('money is never formatted with a bare toLocaleString on this card', () => {
    // Round-1 finding I1: toLocaleString follows the DEVICE locale, so an
    // Arabic-set phone renders ١٠٥. Comments are stripped before the check so
    // the ones explaining this rule do not trip it.
    const code = SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('toLocaleString');
  });
});
