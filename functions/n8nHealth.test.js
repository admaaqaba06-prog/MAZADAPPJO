// The health poller reported perfect health through a total outage, three
// different ways at once. Each way gets a test here.
//
// 1. It watched a RETIRED workflow id. The live instance's own name for
//    F8kFAQkiwlmxSYMI is "Webhook Receiver (v1 — RETIRED 2026-07-27)" and its
//    `active` is false, so it created no executions for five weeks.
// 2. Zero executions produced failureRate 0 — indistinguishable from flawless.
//    So (1) presented as five weeks of green, and the live pipe was unwatched.
// 3. The rate covered "the last 100 runs ever" with no date filter, so it
//    answered a question the health board was not asking.
//
// The OTP relay was watched by none of it, and then failed for five days.
import { describe, it, expect } from 'vitest';
const {
  HEALTH_WINDOW_MS, FAILURE_THRESHOLD, N8N_HEALTH_WORKFLOWS, RETIRED_WORKFLOW_IDS,
  summarizeExecutions, incidentFor,
} = require('./n8nHealth.js');

const NOW = 1_757_000_000_000; // fixed clock; the module takes it as an argument
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

const ok = (t) => ({ status: 'success', startedAt: ago(t) });
const bad = (t) => ({ status: 'error', startedAt: ago(t) });

describe('which workflows are watched', () => {
  it('does not watch the retired workflow', () => {
    // The whole defect. Its id is kept in the module purely so this can fail.
    const ids = N8N_HEALTH_WORKFLOWS.map((w) => w.id);
    for (const dead of RETIRED_WORKFLOW_IDS) expect(ids).not.toContain(dead);
  });

  it('watches the live notification pipe and the OTP relay', () => {
    const ids = N8N_HEALTH_WORKFLOWS.map((w) => w.id);
    expect(ids).toContain('VF3Xi0DYFDi5cliB'); // Webhook Receiver v2, active
    expect(ids).toContain('hTVBPL7BqJVIV37e'); // OTP Relay, active, sign-in path
    expect(ids).toContain('WB0gnN7vZUmi4tS7'); // reply bot, active
  });

  it('keys are unique, so one block cannot overwrite another', () => {
    const keys = N8N_HEALTH_WORKFLOWS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every entry carries a key, an id and a label', () => {
    for (const w of N8N_HEALTH_WORKFLOWS) {
      expect(typeof w.key).toBe('string');
      expect(w.id).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(typeof w.label).toBe('string');
    }
  });
});

describe('summarizeExecutions', () => {
  it('counts errors only inside the window', () => {
    // Was "the last 100 runs ever": a burst of failures kept dragging the
    // number down long after it was fixed.
    const rows = [bad(1 * HOUR), ok(2 * HOUR), bad(48 * HOUR), bad(72 * HOUR)];
    const s = summarizeExecutions(rows, NOW);
    expect(s.total).toBe(2);          // only the two inside 24h
    expect(s.errors).toBe(1);
    expect(s.failureRate).toBe(0.5);  // not 3/4
    expect(s.windowHours).toBe(24);
  });

  it('treats no executions at all as neverRan, NOT as 0% failure', () => {
    // The bug that hid a retired workflow for five weeks.
    const s = summarizeExecutions([], NOW);
    expect(s.neverRan).toBe(true);
    expect(s.quiet).toBe(false);
    expect(s.failureRate).toBe(0); // still 0 — which is why neverRan must exist
  });

  it('distinguishes quiet from neverRan', () => {
    // Ran before, nothing recently. Different meaning, different severity.
    const s = summarizeExecutions([ok(72 * HOUR)], NOW);
    expect(s.neverRan).toBe(false);
    expect(s.quiet).toBe(true);
    expect(s.total).toBe(0);
  });

  it('a healthy recent window is neither quiet nor neverRan', () => {
    const s = summarizeExecutions([ok(1 * HOUR), ok(2 * HOUR)], NOW);
    expect(s).toMatchObject({ total: 2, errors: 0, failureRate: 0, neverRan: false, quiet: false });
  });

  it('counts an unfinished-but-stopped run as an error', () => {
    // Pre-existing rule, kept: a crashed run has no 'error' status.
    const rows = [{ finished: false, stoppedAt: ago(HOUR), startedAt: ago(HOUR) }, ok(HOUR)];
    expect(summarizeExecutions(rows, NOW).errors).toBe(1);
  });

  it('counts an undated row rather than dropping it', () => {
    // Dropping it would let a malformed API payload look like silence, which
    // is the exact failure mode this module exists to catch.
    const s = summarizeExecutions([{ status: 'error' }], NOW);
    expect(s.total).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.neverRan).toBe(false);
  });

  it('survives junk without throwing', () => {
    // It runs inside a scheduled poller that must never throw.
    for (const junk of [null, undefined, 'nope', 42, {}]) {
      expect(() => summarizeExecutions(junk, NOW)).not.toThrow();
      expect(summarizeExecutions(junk, NOW).neverRan).toBe(true);
    }
    expect(() => summarizeExecutions([null, undefined], NOW)).not.toThrow();
  });

  it('honours a custom window', () => {
    const rows = [ok(30 * 60 * 1000), bad(2 * HOUR)];
    expect(summarizeExecutions(rows, NOW, HOUR).total).toBe(1);
    expect(summarizeExecutions(rows, NOW, 24 * HOUR).total).toBe(2);
  });

  it('defaults to the documented 24h window', () => {
    expect(HEALTH_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('incidentFor', () => {
  it('raises on silence, which no failure rate ever would', () => {
    const inc = incidentFor(summarizeExecutions([], NOW), 'OTP relay');
    expect(inc.raise).toBe(true);
    expect(inc.title).toBe('n8n OTP relay has no executions');
    // The message has to point at the two things that actually cause it.
    expect(inc.details).toMatch(/id/);
    expect(inc.details).toMatch(/active/);
  });

  it('raises above the threshold and names the window', () => {
    const rows = [bad(HOUR), bad(HOUR), bad(HOUR), ok(HOUR)];
    const inc = incidentFor(summarizeExecutions(rows, NOW), 'notifications');
    expect(inc.raise).toBe(true);
    expect(inc.title).toBe('n8n notifications failure rate high');
    expect(inc.details).toBe('75% over 4 runs in the last 24h');
  });

  it('does NOT raise for a merely quiet workflow', () => {
    // A quiet day on the reply bot is normal, and a monitor that cries wolf
    // gets muted — which is its own outage.
    const inc = incidentFor(summarizeExecutions([ok(72 * HOUR)], NOW), 'bot');
    expect(inc.raise).toBe(false);
  });

  it('does not raise at or below the threshold', () => {
    const at = { total: 10, errors: 2, failureRate: 0.2, windowHours: 24, neverRan: false, quiet: false };
    expect(incidentFor(at, 'bot').raise).toBe(false);
    expect(incidentFor({ ...at, errors: 3, failureRate: 0.3 }, 'bot').raise).toBe(true);
    expect(FAILURE_THRESHOLD).toBe(0.2);
  });

  it('is silent about a missing block instead of throwing', () => {
    // A per-workflow fetch can fail and leave no block at all.
    expect(incidentFor(undefined, 'bot')).toEqual({ raise: false, title: null, details: null });
    expect(incidentFor(null, 'bot').raise).toBe(false);
  });
});
