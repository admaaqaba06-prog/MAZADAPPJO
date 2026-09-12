// CR-03 wiring — the cross-file guarantees.
//
// The run logic is covered in featuredAlertRun.test.js. What is pinned here is
// the ORDER of the callable (count before you write, write before you send),
// the rule that makes the cap unbypassable, and the independence of the two
// opt-outs — which lives in a React component and a Cloud Function that have to
// agree about two separate fields.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');
const readRoot = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const code = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const callable = () => {
  const src = code(read('index.js'));
  return src.slice(src.indexOf('exports.broadcastFeaturedAuction'), src.indexOf('const FEATURED_REFUSALS'));
};

describe('the broadcast callable', () => {
  it('is admin-only', () => {
    expect(callable()).toMatch(/await assertAdmin\(context\)/);
  });

  it('counts the cap BEFORE it writes the flag or sends anything', () => {
    // Order is the whole guarantee. Checking after the write would leave a lot
    // flagged for a broadcast that never happened; checking after the send is
    // not a cap at all.
    const b = callable();
    const capCheck = b.indexOf('isFeaturedCapped(recent, nowMs)');
    const flagWrite = b.indexOf("collection('auctions')");
    const send = b.indexOf('runFeaturedAlert(');
    expect(capCheck).toBeGreaterThan(-1);
    expect(capCheck).toBeLessThan(flagWrite);
    expect(capCheck).toBeLessThan(send);
  });

  it('refuses with a message that names the next allowed date', () => {
    // A refusal with no next-allowed time reads as a bug, and invites someone
    // to go looking for a way around it.
    const b = callable();
    expect(b).toMatch(/failed-precondition/);
    expect(b).toMatch(/capMessage\(next, 'ar'\)/);
    expect(b).toMatch(/nextAllowedAt: next/);
  });

  it('requires a reason before anything else happens', () => {
    expect(callable()).toMatch(/validateReason\(data && data\.featuredReason\)/);
  });

  it('sets the flag and the reason on the lot', () => {
    const b = callable();
    expect(b).toMatch(/isFeatured: true/);
    expect(b).toMatch(/featuredReason: check\.reason/);
  });

  it('spends a slot only when something actually went out', () => {
    // A broadcast that matched nobody spent no attention, so it should not
    // spend one of only two weekly slots either.
    expect(callable()).toMatch(/if \(!dryRun && summary\.sent > 0\)/);
  });

  it('surfaces a late refusal as an error, not as a quiet sent=0', () => {
    // Quiet hours, the kill switch, or a lot that went off-live between the
    // cap check and the run. Reporting success with sent=0 reads as "nobody
    // matched", which is a different and much less alarming thing.
    expect(callable()).toMatch(/if \(summary\.refused\)/);
  });

  it('reuses the digest relay rather than growing a second sender', () => {
    expect(callable()).toMatch(/send: postDigestToN8n/);
  });
});

describe('the quota callable', () => {
  it('exists so the UI can refuse before the admin invests any effort', () => {
    const src = code(read('index.js'));
    const q = src.slice(src.indexOf('exports.featuredAlertQuota'));
    expect(q).toMatch(/await assertAdmin\(context\)/);
    expect(q).toMatch(/used: recent\.length/);
    expect(q).toMatch(/message: capped \? capMessage\(next, 'ar'\) : null/);
  });
});

describe('the cap cannot be bypassed', () => {
  it('lets no client write the ledger the cap counts', () => {
    // "Do not make it bypassable from the UI." A client that could add rows
    // here could mint slots; one that could delete them could clear the cap.
    const src = readRoot('firestore.rules');
    const block = src.slice(src.indexOf('match /featuredBroadcasts/'), src.indexOf('match /notificationRuns/'));
    expect(block).toMatch(/allow read: if isAdmin\(\);/);
    expect(block).toMatch(/allow write: if false;/);
  });

  it('re-checks the cap inside the run, not only in the callable', () => {
    // Defence in depth: this is the layer that survives someone wiring a
    // script or a trigger straight into the run.
    expect(code(read('featuredAlertRun.js'))).toMatch(/isFeaturedCapped\(recent, nowMs\)/);
  });
});

describe('the two alerts stay independent', () => {
  it('the broadcast reads notifyFeatured, never notifyDaily', () => {
    // Reading the wrong field here collapses two switches into one, and the
    // user who muted the digest silently loses featured alerts too.
    const run = code(read('featuredAlertRun.js'));
    expect(run).toMatch(/where\('notifyFeatured', '==', true\)/);
    expect(run).not.toMatch(/notifyDaily/);
  });

  it('settings offers a switch for each', () => {
    const picker = code(readRoot('src/components/InterestsPicker.tsx'));
    expect(picker).toMatch(/id: 'interests-consent-toggle'/);
    expect(picker).toMatch(/id: 'interests-featured-toggle'/);
    expect(picker).toMatch(/setConsentFeatured/);
  });

  it('muting one does not silently mute the channel for the other', () => {
    // notifyChannel is a third switch the user never sees. Setting it to
    // 'none' because the digest was muted would turn off featured alerts
    // through a field nobody touched.
    expect(code(readRoot('src/components/InterestsPicker.tsx')))
      .toMatch(/consent \|\| consentFeatured\) \? 'whatsapp' : 'none'/);
  });

  it('the inbound stop handler still turns BOTH off', () => {
    // A person replying "إيقاف" is not making a fine-grained choice.
    const src = code(read('index.js'));
    const inbound = src.slice(src.indexOf('exports.notificationsInbound'));
    expect(inbound).toMatch(/notifyDaily: on/);
    expect(inbound).toMatch(/notifyFeatured: on/);
  });
});

describe('the admin surface', () => {
  it('is a separate card from the merchandising pin control', () => {
    // FeaturedSection reorders the feed and an admin uses it casually. This
    // one messages people. Sharing a control would turn a reordering habit
    // into a broadcast habit.
    const admin = readRoot('src/components/AdminDashboardView.tsx');
    expect(admin).toMatch(/FeaturedAlertSection/);
    expect(admin).toMatch(/<FeaturedSection isAr=\{isAr\} \/>/);
    const alertSrc = readRoot('src/components/admin/FeaturedAlertSection.tsx');
    expect(alertSrc).not.toMatch(/commitFeaturedOrder|featuredRank/);
  });

  it('offers a dry run alongside the send, not hidden behind it', () => {
    const src = readRoot('src/components/admin/FeaturedAlertSection.tsx');
    expect(src).toMatch(/submit\(true\)/);
    expect(src).toMatch(/submit\(false\)/);
  });

  it('only offers live lots, which are the only ones the callable accepts', () => {
    expect(readRoot('src/components/admin/FeaturedAlertSection.tsx'))
      .toMatch(/useAdminAuctionSearch\(term, \['live'\]\)/);
  });

  it('disables the form when the cap is spent', () => {
    const src = readRoot('src/components/admin/FeaturedAlertSection.tsx');
    expect(src).toMatch(/const capped = quota\?\.capped === true/);
    expect(src).toMatch(/!capped/);
  });
});
