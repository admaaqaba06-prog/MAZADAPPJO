// The health board and the alarm it explains must agree.
//
// They did not. The server raised a system_health incident above 20%
// (functions/n8nHealth.js) while the admin card only turned red above 25%
// (AdminDashboardView.tsx). So a 21-25% failure rate wrote an incident row and
// left the board amber — the two halves of one monitor telling different
// stories, in a product where the monitor already failed to notice a five-day
// outage on the sign-in path.
//
// src/ cannot import from functions/ (TypeScript ESM one side, CommonJS the
// other, no build step across the boundary), so this reads both files as text —
// the pattern supportPhone.parity.test.ts already uses for this boundary.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './sourceFiles';

const HEALTH = readFileSync(join(ROOT, 'functions', 'n8nHealth.js'), 'utf8');
const ADMIN = readFileSync(join(ROOT, 'src', 'components', 'AdminDashboardView.tsx'), 'utf8');
const SECTION = readFileSync(join(ROOT, 'src', 'components', 'admin', 'SystemSection.tsx'), 'utf8');

/** The number the server actually alarms on. */
function serverThreshold(): number {
  const m = HEALTH.match(/const FAILURE_THRESHOLD = ([\d.]+);/);
  if (!m) throw new Error('FAILURE_THRESHOLD not found in functions/n8nHealth.js — was it renamed?');
  return Number(m[1]);
}

/** The number the card turns red on. */
function uiRedThreshold(): number {
  const m = ADMIN.match(/stats\.failureRate > ([\d.]+)\) return 'bad'/);
  if (!m) throw new Error("the 'bad' threshold not found in AdminDashboardView — was rateSeverity rewritten?");
  return Number(m[1]);
}

describe('the health board agrees with the incident it explains', () => {
  it('turns red at exactly the rate the server alarms on', () => {
    expect(uiRedThreshold()).toBe(serverThreshold());
  });

  it('still warns before it alarms', () => {
    // Amber has to sit below red or it can never show.
    const m = ADMIN.match(/stats\.failureRate >= ([\d.]+)\) return 'warn'/);
    expect(m, "the 'warn' threshold disappeared from rateSeverity").not.toBeNull();
    expect(Number(m![1])).toBeLessThan(uiRedThreshold());
  });
});

// The server now distinguishes "no executions at all" from "0% failures".
// If the UI does not, the fix is undone at the last step: neverRan reports
// failureRate 0, which is a number, so the old mapping rendered a green 0%
// for a workflow that had not run in five weeks.
describe('the board does not render silence as health', () => {
  it('maps neverRan to red before it looks at the rate', () => {
    const sev = ADMIN.slice(ADMIN.indexOf('const rateSeverity'), ADMIN.indexOf('const rateValue'));
    expect(sev).toMatch(/stats\.neverRan\) return 'bad'/);
    // Order matters: the rate checks below would otherwise pass it as ok.
    expect(sev.indexOf('neverRan')).toBeLessThan(sev.indexOf("> 0.20"));
  });

  it('does not print "0%" for a workflow that never ran', () => {
    const val = ADMIN.slice(ADMIN.indexOf('const rateValue'), ADMIN.indexOf('const rateSubtext'));
    expect(val).toMatch(/stats\.neverRan/);
  });

  it('maps a quiet workflow to amber, not red', () => {
    const sev = ADMIN.slice(ADMIN.indexOf('const rateSeverity'), ADMIN.indexOf('const rateValue'));
    expect(sev).toMatch(/stats\.quiet\) return 'warn'/);
  });

  it('names the window in the subtext instead of "last N runs"', () => {
    // The rate used to cover the last 100 runs of all time.
    const sub = ADMIN.slice(ADMIN.indexOf('const rateSubtext'));
    expect(sub).toMatch(/windowHours/);
  });
});

// A block written to Firestore that no card renders is not monitoring. The n8n
// map is read by hardcoded key, not iterated, so every watched workflow needs
// its own card or it is invisible on the board.
describe('every watched workflow reaches the board', () => {
  it('reads the OTP block off the status doc', () => {
    expect(ADMIN).toMatch(/const n8nOtp = systemStatus\?\.n8n\?\.otp;/);
    expect(ADMIN).toMatch(/n8nOtp=\{n8nOtp\}/);
  });

  it('renders an OTP card', () => {
    expect(SECTION).toMatch(/n8nOtp: any;/);
    expect(SECTION).toMatch(/rateValue\(n8nOtp\)/);
    expect(SECTION).toMatch(/rateSeverity\(n8nOtp\)/);
  });

  it('has room for it — the grid was pinned at exactly five', () => {
    const m = SECTION.match(/xl:grid-cols-(\d+) gap-3/);
    expect(m, 'the status board grid changed shape').not.toBeNull();
    const cards = (SECTION.match(/<HealthStatusCard/g) ?? []).length;
    expect(Number(m![1])).toBeGreaterThanOrEqual(cards);
  });
});
