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
 *
 * WHAT THIS NET DOES NOT CATCH — read this before trusting it.
 *
 * The call-site sweep finds `secondChanceViewState(` as a literal substring and
 * then checks the viewer against an allowlist of identifier NAMES. A review
 * defeated it six ways, each of which reintroduces the exact regression this
 * file was written for and still goes green:
 *
 *   - an aliased import — `import { secondChanceViewState as viewStateOf }`
 *   - a re-export under a different name, then calling the alias
 *   - `secondChanceViewState?.(…)` and `secondChanceViewState (…)` — anything
 *     between the name and the paren
 *   - a local wrapper whose own parameter happens to be named `viewer`
 *   - an id assigned to a variable named `user` — allowlisted by name, so
 *     `const user = currentUser?.id` passes while being the original bug
 *
 * It also FALSE-FAILS on a comment in a non-test `src/` file that quotes the
 * bad form, because nothing strips comments first.
 *
 * So: this kills the regression that shipped and every naive recurrence of it,
 * and it is strictly better than the hand-listed file set it replaced — a list
 * carried the same blind spot that caused the bug. It is not a guarantee, and it
 * should not be trusted the way `tsc` was trusted here. (`@types/react` is not
 * installed and tsconfig sets no `strict`/`noImplicitAny`, so `useApp()` is
 * `any` and the type system never checked these call sites at all.) Closing it
 * properly wants an ESLint `no-restricted-syntax` rule keyed on the imported
 * BINDING rather than on the spelling of the call.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..');
const SRC = readFileSync(join(HERE, 'SecondChanceCard.tsx'), 'utf8');

/**
 * The top-level arguments of the call to `fnName` starting at `from`,
 * whitespace-collapsed. Brace/bracket/paren depth is tracked so nested calls and
 * object literals stay inside their own argument. An import list is never
 * matched — it has no `(`.
 */
function argsAt(src: string, fnName: string, from: number): string[] {
  let i = from + fnName.length + 1; // just past the opening paren
  let depth = 1;
  const args: string[] = [];
  let cur = '';
  while (i < src.length) {
    const ch = src[i];
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

/** The first call to `fnName` in the card. */
function callArgs(fnName: string): string[] {
  const start = SRC.indexOf(`${fnName}(`);
  expect(start, `${fnName} is never called in SecondChanceCard.tsx`).toBeGreaterThan(-1);
  return argsAt(SRC, fnName, start);
}

/** Every .ts/.tsx file under src/, tests excluded. */
function sourceFiles(dir = SRC_DIR, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * EVERY call to `fnName` anywhere under src/, as `{ file, args }`.
 *
 * A sweep rather than a fixed list of files, deliberately: the C1 regression was
 * a call site that no test looked at. A future third surface is covered the day
 * it is written, not the day someone remembers to add it here.
 *
 * The declaration itself (`function fnName(`) is skipped — it is a signature,
 * not a call.
 */
function allCallSites(fnName: string): { file: string; args: string[] }[] {
  const found: { file: string; args: string[] }[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, 'utf8');
    let at = src.indexOf(`${fnName}(`);
    while (at > -1) {
      const preceding = src.slice(Math.max(0, at - 20), at);
      if (!/\bfunction\s+$/.test(preceding)) {
        found.push({ file: relative(SRC_DIR, file), args: argsAt(src, fnName, at) });
      }
      at = src.indexOf(`${fnName}(`, at + 1);
    }
  }
  return found;
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

/**
 * REVIEW F1 (client half) — the BAN must actually reach the pure decision.
 *
 * `secondChanceViewState` can only hide the Accept button from a blocked
 * runner-up if it is handed the runner-up's ban state. Passing an id — or a
 * freshly-built `{ id: currentUser?.id }` — typechecks, renders, and silently
 * reports "not blocked" for everybody, which is the exact defect. No render test
 * can see this, so it is pinned here.
 *
 * TYPESCRIPT IS NOT THE SAFETY NET HERE, and believing it was is what let the C1
 * regression ship green. `@types/react` is not installed and tsconfig.json sets
 * neither `strict` nor `noImplicitAny`, so `useApp()` is implicitly `any` — and
 * every viewer in this app comes from it. `any` is assignable to anything, so an
 * id passed where a user is required raises NOTHING from `tsc --noEmit`. These
 * assertions are the only thing standing between a call site and the bug.
 */
describe('SecondChanceCard wiring — the viewer the ban check receives', () => {
  it('hands secondChanceViewState the whole user, not an id', () => {
    const args = callArgs('secondChanceViewState');
    expect(args[0]).toBe('auction');
    expect(args[1]).toBe('currentUser');
  });

  it('never narrows the viewer down to an id on the way in', () => {
    const args = callArgs('secondChanceViewState');
    // Both shapes compile. Both drop isBlocked/blockedUntil. Both reinstate the bug.
    expect(args[1]).not.toBe('currentUserId');
    expect(args[1]).not.toMatch(/\.id\b/);
    expect(args[1]).not.toMatch(/^\{/);
  });

  it('renders the blocked explanation from the pure copy helper', () => {
    // Without it the Accept button simply vanishes and the card reads as broken.
    expect(SRC).toContain('state.acceptBlockedByBan');
    expect(SRC).toContain('secondChanceBlockedNote(');
  });

  it('keys the headline on awaitingOther, never on canAccept', () => {
    // They agreed exactly until the ban column landed. A blocked runner-up has
    // canAccept:false while nobody else is deciding, so keying on canAccept
    // tells them their offer is sitting with the seller — a lie.
    const code = SRC
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/\?\s*\(\s*!state\.awaitingOther\b/);
    expect(code).not.toMatch(/\?\s*\(\s*state\.canAccept\b/);
  });
});

/**
 * REVIEW C1 — EVERY call site, not just the card's.
 *
 * The card's own call was correct and this file still shipped the regression,
 * because this file read `SecondChanceCard.tsx` and nothing else. The broken call
 * was `SellerCenterView.tsx`'s `showSecondChance` gate, 105 lines above the JSX
 * that passes the prop:
 *
 *     const showSecondChance = secondChanceViewState(auction, currentUser?.id, …)
 *
 * Under the viewer-is-a-user signature `viewer?.id` on a bare string is
 * `undefined`, so neither party matches, the gate is `false` FOREVER, and the
 * card never mounts. Seller Center is the seller's ONLY in-app surface for a
 * `pending_seller` offer — `useMySecondChanceOffers` filters on
 * `secondChanceOffer.bidderId`, so MyOrders shows the card to the runner-up
 * alone. The seller would get the WhatsApp and the email, open the app, find
 * nothing to tap, and the offer would lapse in 24h: the below-reserve
 * seller-consent half of the feature, silently deleted.
 *
 * So this sweeps every .ts/.tsx under src/ rather than naming files. A future
 * third surface is covered the day it is written.
 */
describe('secondChanceViewState — every call site in the app', () => {
  const sites = allCallSites('secondChanceViewState');

  it('finds the call sites at all (a sweep that matches nothing proves nothing)', () => {
    // The card + the two host views' gates. Fewer means the sweep is broken or a
    // surface was deleted; either way, look before editing this number.
    expect(sites.length).toBeGreaterThanOrEqual(3);
    const files = sites.map((s) => s.file);
    expect(files).toContain('components/order/SecondChanceCard.tsx');
    expect(files).toContain('components/SellerCenterView.tsx');
    expect(files).toContain('components/MyOrdersView.tsx');
  });

  it('every one of them passes a USER, never an id', () => {
    for (const { file, args } of sites) {
      // `.id` / `.uid` — the C1 mistake, and the one that cannot be typechecked
      // because useApp() is implicitly `any`.
      expect(args[1], `${file} narrows the viewer to an id`).not.toMatch(/\.(id|uid)\b/);
      // An inline `{ id: … }` object: compiles, drops the ban fields, same bug.
      expect(args[1], `${file} rebuilds the viewer without its ban fields`).not.toMatch(/^\{/);
      // A bare `currentUserId`-style identifier.
      expect(args[1], `${file} passes an id-named variable`).not.toMatch(/(^|\b)\w*[uU]serId$/);
    }
  });

  it('every one of them passes something that could carry a ban', () => {
    for (const { file, args } of sites) {
      // Positive form of the rule above, so an unforeseen id shape still fails.
      expect(args[1], `${file} does not pass a recognised viewer`).toMatch(/^(currentUser|viewer|user)\b/);
    }
  });

  it('the SellerCenter gate and the card it guards agree on the viewer', () => {
    // They are 105 lines apart and were changed independently — that distance is
    // the whole reason C1 happened. Whatever one passes, the other must.
    const seller = sites.filter((s) => s.file === 'components/SellerCenterView.tsx');
    const card = sites.filter((s) => s.file === 'components/order/SecondChanceCard.tsx');
    expect(seller).toHaveLength(1);
    expect(card).toHaveLength(1);
    expect(seller[0].args[1]).toBe(card[0].args[1]);
  });
});
