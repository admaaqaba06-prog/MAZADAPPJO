// CR-01 — the wiring the interests step depends on, asserted at the source.
//
// The unit behaviour lives in utils/interests.test.ts. What this file guards is
// everything that is only true because two files agree with each other, and
// which therefore breaks silently:
//   - the step is FORCED, and forced in the right order relative to the other
//     full-screen gate;
//   - the save is ONE write, not one per card tap;
//   - the settings screen reuses the component instead of growing a second
//     save path that forgets to write the opt-out;
//   - the consent record cannot be edited after the fact.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per signInIntent.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const readRoot = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const code = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('interests step routing', () => {
  it('has a real path, so a refresh mid-onboarding reloads the step', () => {
    const nav = read('utils/navUrl.ts');
    expect(nav).toMatch(/'onboarding-interests': '\/onboarding\/interests'/);
    // Present in the view union AND the legacy `?view=` allowlist, or an old
    // shared link parses to a view the renderer does not know.
    expect(code(nav)).toMatch(/\|\s*'onboarding-interests'/);
    expect(code(nav)).toMatch(/'watchlist',\s*'onboarding-interests',/);
  });

  it('forces the step rather than merely offering it', () => {
    const app = code(read('App.tsx'));
    // A gate that returns EARLY, before the shell — not a modal over it. The
    // shell is what renders the bottom nav, so a modal would leave four
    // escape routes out of a step the spec calls mandatory.
    expect(app).toMatch(/if \(interestsGateOpen\) \{/);
    expect(app).toMatch(/interestsGateOpen[\s\S]{0,200}return \(/);
  });

  it('asks who you are before it asks what you like', () => {
    const app = code(read('App.tsx'));
    const profileGate = app.indexOf('if (!isProfileComplete(currentUser))');
    // The BRACED form is the gate. `if (interestsGateOpen) setActiveView(...)`
    // is the URL-sync effect and appears much earlier in the component, so a
    // bare indexOf finds that instead and this assertion passes or fails for
    // reasons that have nothing to do with gate order.
    const interestsGate = app.indexOf('if (interestsGateOpen) {');
    expect(profileGate).toBeGreaterThan(-1);
    expect(interestsGate).toBeGreaterThan(-1);
    // Two full-screen steps in a row; this is the order they belong in.
    expect(interestsGate).toBeGreaterThan(profileGate);
  });

  it('does not re-ask someone who reaches the route another way', () => {
    // A bookmark, or Back after saving. The gate cannot catch these because by
    // then it has already fallen through.
    const app = code(read('App.tsx'));
    expect(app).toMatch(/case 'onboarding-interests':[\s\S]{0,240}needsInterestsOnboarding\(currentUser\)/);
  });

  it('cannot push a signed-out visitor at the step', () => {
    // The URL-sync effect runs on EVERY render of the shell, including the
    // renders that returned the guest browse shell or the login screen — an
    // early return stops rendering, not effects. So the auth conditions have
    // to live in the flag the effect reads, not only around the JSX.
    const app = code(read('App.tsx'));
    const flag = app.slice(app.indexOf('const interestsGateOpen ='), app.indexOf('React.useEffect(() => {', app.indexOf('const interestsGateOpen =')));
    expect(flag).toMatch(/isAuthenticated/);
    expect(flag).toMatch(/isProfileComplete\(currentUser\)/);
    expect(flag).toMatch(/needsInterestsOnboarding\(currentUser\)/);
  });

  it('latches for the session so a stale snapshot cannot resurrect it', () => {
    const app = code(read('App.tsx'));
    expect(app).toMatch(/mazad_interests_done/);
    expect(app).toMatch(/setInterestsLatched\(true\)/);
  });
});

describe('interests save', () => {
  const ctx = () => code(read('context/AppContext.tsx'));

  it('writes once, atomically', () => {
    // The spec forbids a write per card tap. A batch also keeps the prefs and
    // the consent row from landing apart.
    const src = ctx();
    expect(src).toMatch(/const saveInterests = useCallback\(/);
    expect(src).toMatch(/writeBatch\(db\)/);
    expect(src).toMatch(/batch\.commit\(\)/);
  });

  it('writes every field CR-02 and CR-03 read', () => {
    const src = ctx();
    for (const field of [
      'interests:',
      'interestsSkipped:',
      'interestsUpdatedAt:',
      'notifyDaily:',
      'notifyFeatured:',
      'notifyChannel:',
    ]) {
      expect(src).toContain(field);
    }
    expect(src).toMatch(/interestsUpdatedAt: serverTimestamp\(\)/);
  });

  it('records the consent event in the append-only subcollection', () => {
    expect(ctx()).toMatch(/'consentEvents'/);
  });

  it('does not save on a card tap', () => {
    // The grid's onClick must only touch local state. If `toggle` ever reaches
    // for the save, a user picking four categories fires four document writes
    // and four listener echoes.
    const picker = code(read('components/InterestsPicker.tsx'));
    const toggleFn = picker.slice(picker.indexOf('const toggle ='), picker.indexOf('const persist ='));
    expect(toggleFn).not.toMatch(/saveInterests|persist\(/);
    expect(toggleFn).toMatch(/setSelected/);
  });

  it('turns the channel off when consent is withdrawn', () => {
    // notifyChannel 'none' is the belt to notifyDaily/notifyFeatured's braces:
    // CR-02 should have two independent reasons to skip an opted-out user.
    expect(code(read('components/InterestsPicker.tsx'))).toMatch(/consent \? 'whatsapp' : 'none'/);
  });
});

describe('interests are editable later', () => {
  it('profile reuses the component instead of copying the save path', () => {
    const profile = read('components/ProfileView.tsx');
    expect(profile).toMatch(/import \{ InterestsPicker \}/);
    expect(profile).toMatch(/<InterestsPicker mode="settings"/);
    expect(profile).toMatch(/اهتماماتي/);
    // The settings mount must not hand-roll its own write.
    expect(code(profile)).not.toMatch(/saveInterests\(/);
  });

  it('offers both mounts from one component', () => {
    const picker = code(read('components/InterestsPicker.tsx'));
    expect(picker).toMatch(/mode: 'onboarding' \| 'settings'/);
  });
});

describe('interests firestore rules', () => {
  const rules = () => readRoot('firestore.rules');

  it('lets the grid read categories but only an admin write them', () => {
    const src = rules();
    const block = src.slice(src.indexOf('match /categories/{categoryId}'));
    expect(block.slice(0, 200)).toMatch(/allow read: if true;/);
    expect(block.slice(0, 200)).toMatch(/allow write: if isAdmin\(\);/);
  });

  it('makes the consent trail append-only, for admins too', () => {
    // The whole value of the record is that nobody can rewrite it afterwards.
    // `users/{uid}.notificationConsent` is owner-writable and proves nothing;
    // this is the row that does.
    const src = rules();
    const block = src.slice(src.indexOf('match /users/{userId}/consentEvents/'));
    expect(block.slice(0, 700)).toMatch(/allow update, delete: if false;/);
    expect(block.slice(0, 700)).toMatch(/allow create: if isSignedIn\(\) && isOwner\(userId\)/);
  });
});
