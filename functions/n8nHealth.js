'use strict';

/**
 * What "healthy" means for an n8n workflow, as a pure function.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * The judgement used to be six lines inside pollN8nHealth, tangled with the
 * fetch and the Firestore write, so none of it could be executed by a test —
 * and it was wrong in three ways at once, all of which read as green:
 *
 *   1. It watched a RETIRED workflow id. The instance's own name for
 *      F8kFAQkiwlmxSYMI is "Webhook Receiver (v1 — RETIRED 2026-07-27)" and its
 *      `active` is false. An inactive workflow creates no executions.
 *   2. Zero executions gave `failureRate: 0` — indistinguishable from perfect.
 *      So (1) presented as five weeks of flawless health.
 *   3. The rate covered "the last 100 runs ever", with no date filter, so it
 *      answered a question nobody asked.
 *
 * Pure: no Firestore, no network, and the clock is an ARGUMENT. Same contract
 * as whatsappOtp.js and settlement.js, so root Vitest can execute every branch.
 */

/** How far back the failure rate looks. */
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Above this, an incident is raised. */
const FAILURE_THRESHOLD = 0.2;

/**
 * The workflows the poller watches.
 *
 * Every id was read back from the live instance on 2026-09-04 rather than
 * copied from a doc. If you add one, read its id off /rest/workflows and check
 * `active` first — that is the single check that would have prevented this.
 */
const N8N_HEALTH_WORKFLOWS = Object.freeze([
  // WhatsApp AI Reply Agent — active.
  Object.freeze({ key: 'bot', id: 'WB0gnN7vZUmi4tS7', label: 'bot' }),
  // Webhook Receiver v2 (WhatsApp + Email) — active. Replaced the retired v1.
  Object.freeze({ key: 'notifications', id: 'VF3Xi0DYFDi5cliB', label: 'notifications' }),
  // OTP Relay (WhatsApp via WaSender) — active, and on the sign-in path, so it
  // is the one whose silence costs the most.
  Object.freeze({ key: 'otp', id: 'hTVBPL7BqJVIV37e', label: 'OTP relay' }),
]);

/** The retired id this poller used to watch. Kept so a test can forbid it. */
const RETIRED_WORKFLOW_IDS = Object.freeze(['F8kFAQkiwlmxSYMI']);

/**
 * Reduce a list of n8n executions to the health block written to Firestore.
 *
 * @param {Array<object>} executions raw rows from /api/v1/executions
 * @param {number} nowMs
 * @param {number} [windowMs=HEALTH_WINDOW_MS]
 * @returns {{total:number, errors:number, failureRate:number, windowHours:number, neverRan:boolean, quiet:boolean}}
 */
function summarizeExecutions(executions, nowMs, windowMs = HEALTH_WINDOW_MS) {
  const rows = Array.isArray(executions) ? executions : [];
  const since = nowMs - windowMs;

  const recent = rows.filter((ex) => {
    const t = Date.parse((ex && (ex.startedAt || ex.createdAt)) || '');
    // An undated row counts. Dropping it would let a malformed payload look
    // like silence, which is the failure mode this module exists to catch.
    return Number.isFinite(t) ? t >= since : true;
  });

  const total = recent.length;
  const errors = recent.filter((ex) =>
    ex && (ex.status === 'error' || (ex.finished === false && !!ex.stoppedAt))
  ).length;

  return {
    total,
    errors,
    failureRate: total > 0 ? errors / total : 0,
    windowHours: Math.round(windowMs / 3600000),
    // SILENCE IS NOT HEALTH, and the two silences mean different things.
    // neverRan: the API returned nothing at all — a retired id, a renamed
    //           workflow, or a dead trigger. None of these raise a failure
    //           rate; they suppress it.
    // quiet:    has history, nothing in the window. Surfaced so the tab can
    //           show amber, but never paged — a quiet day on the reply bot is
    //           normal, and a monitor that cries wolf gets muted.
    neverRan: rows.length === 0,
    quiet: rows.length > 0 && total === 0,
  };
}

/**
 * Should this block raise an incident, and what should it say?
 *
 * @returns {{ raise: boolean, title: string|null, details: string|null }}
 */
function incidentFor(stats, label) {
  if (!stats) return { raise: false, title: null, details: null };

  if (stats.neverRan) {
    return {
      raise: true,
      title: `n8n ${label} has no executions`,
      details: 'the n8n API returned no executions at all — check the workflow id is right and that the workflow is active',
    };
  }
  if (stats.failureRate > FAILURE_THRESHOLD) {
    return {
      raise: true,
      title: `n8n ${label} failure rate high`,
      details: `${Math.round(stats.failureRate * 100)}% over ${stats.total} runs in the last ${stats.windowHours}h`,
    };
  }
  return { raise: false, title: null, details: null };
}

module.exports = {
  HEALTH_WINDOW_MS,
  FAILURE_THRESHOLD,
  N8N_HEALTH_WORKFLOWS,
  RETIRED_WORKFLOW_IDS,
  summarizeExecutions,
  incidentFor,
};
