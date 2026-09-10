/**
 * The reserve amount must never reach a public client. That is not a property
 * of one function — it is a property of the whole write path, so this sweeps the
 * source rather than testing a unit.
 *
 * Source-text assertions, per the house idiom (vitest here is environment:
 * 'node' with no jsdom, and `useApp()` is implicitly `any` in this repo, so tsc
 * catches none of this).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FUNCTIONS = fileURLToPath(new URL('../../functions', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(entry) && !/\.test\.(ts|tsx|js)$/.test(entry)) out.push(p);
  }
  return out;
}

const srcFiles = walk(SRC);

describe('the reserve amount never reaches a public client', () => {
  it('NO client writes the reserve to Firestore directly — it goes through the callable', () => {
    // Tightened after #290. The old browser write
    // (`setDoc(doc(db,'auctionSecrets',id), { reservePrice })`) was DENIED for
    // every non-admin seller and the failure was swallowed, so lots went live
    // with no stored reserve and settlement awarded them at the top bid. The
    // write now happens in the `setAuctionReserve` callable, from a trusted
    // context. A direct client write reappearing is that bug coming back.
    //
    // Asserted as "no direct write exists" rather than "every direct write
    // targets auctionSecrets": the latter passes VACUOUSLY now that there are
    // none, which is exactly how a regression would slip through.
    for (const f of srcFiles) {
      const s = readFileSync(f, 'utf8');
      const writes = s.match(/(setDoc|updateDoc|addDoc)\([^;]{0,400}?reservePrice/gs) ?? [];
      expect(writes, `${f}: writes reservePrice to Firestore from a client`).toEqual([]);
    }
  });

  it('the reserve reaches the server through setAuctionReserve', () => {
    const ctx = readFileSync(join(SRC, 'context/AppContext.tsx'), 'utf8');
    expect(ctx).toContain("'setAuctionReserve'");
  });

  it('createListing strips the reserve off the auction payload before writing it', () => {
    const ctx = readFileSync(join(SRC, 'context/AppContext.tsx'), 'utf8');
    expect(ctx).toContain('stripReserve(');
    // The stripped payload — not the original — is what reaches the auction doc.
    expect(ctx).toMatch(/const \{ reservePrice, auctionInput \} = stripReserve/);
  });

  it('no component reads a reserve AMOUNT off an auction', () => {
    // `auction.reservePrice` would be undefined at runtime (it is never written
    // to that doc), so a reader is either dead code or, worse, a leak someone is
    // about to "fix" by putting the amount back on the doc.
    const components = srcFiles.filter((f) => f.includes('/components/') || f.includes('/landing/'));
    for (const f of components) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} reads a reserve amount off an auction`).not.toMatch(/auction\??\.\s*reservePrice/);
      expect(s, `${f} reads a reserve amount off activeAuction`).not.toMatch(/activeAuction\??\.\s*reservePrice/);
    }
  });

  it('the tolerance FLOOR is computed only server-side', () => {
    // The floor discloses the reserve directly (floor / 0.9). It must exist in
    // functions/ and nowhere in src/.
    const server = readFileSync(join(FUNCTIONS, 'settlement.js'), 'utf8');
    expect(server).toContain('function toleranceFloorFils');
    for (const f of srcFiles) {
      const s = readFileSync(f, 'utf8');
      // A CALL, not a mention: types.ts names the helper in a doc comment to
      // point the reader at where the floor really lives, which is the opposite
      // of a leak. `toleranceFloorFils(` is the thing that must not appear.
      expect(s, `${f} computes a tolerance floor client-side`).not.toMatch(/toleranceFloorFils\s*\(/);
    }
  });

  it('no client field exposes the gap to the reserve', () => {
    // "You need 50 JOD more" is the reserve minus the current price — the same
    // secret, arithmetic away.
    for (const f of srcFiles) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/amountToReserve|reserveRemaining|remainingToReserve|reserveGap|reserveShortfall/);
    }
  });

  it('the auction doc carries the reserve BOOLEAN and, at most, a percentage', () => {
    // reserveTolerancePct is safe on a world-readable doc precisely because the
    // base it applies to is not there. This pins that reasoning: if the amount
    // ever joined it, the percentage would become a disclosure.
    const types = readFileSync(join(SRC, 'types.ts'), 'utf8');
    const auctionBlock = types.slice(types.indexOf('reserveMet?: boolean'), types.indexOf('channel?:'));
    expect(auctionBlock).toContain('reserveTolerancePct?: number');
    expect(auctionBlock).not.toContain('reservePrice');
  });
});

describe('the public reserve surface is a two-state label', () => {
  it('the live rooms render reserveMet, never an amount', () => {
    for (const view of ['components/MobileAuctionView.tsx', 'components/DesktopLiveAuctionLayout.tsx']) {
      const s = readFileSync(join(SRC, view), 'utf8');
      expect(s).toMatch(/reserveMet\s*===\s*(true|false)/);
      expect(s).not.toMatch(/reservePrice/);
    }
  });
});
