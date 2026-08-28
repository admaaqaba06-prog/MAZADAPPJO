import { describe, it, expect } from 'vitest';
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/**
 * Assert Sent — the node that decides whether a notification run counts as
 * failed.
 *
 * THE BUG IT FIXES. The old node threw if ANY merged item carried an error.
 * Both send nodes run with onError: continueRegularOutput, so a failure arrives
 * as an item rather than halting — which meant one broken channel failed the
 * whole execution even when the other had delivered. Resend began rejecting
 * every send, every run went red, the dashboard read 68.7% failed, and the
 * investigation spent weeks on WhatsApp. WhatsApp was returning success on the
 * very runs being counted as total failures.
 *
 * Run for real via `new Function`, the same harness notifyCopyParity uses for
 * Build Messages: a test that asserts on the source text of a Code node cannot
 * tell whether the node works.
 */

const SRC = readFileSync(join(__dirname, '..', 'n8n', 'assert-sent.js'), 'utf8');
const WF = JSON.parse(
  readFileSync(join(__dirname, '..', 'n8n', 'webhook-receiver-v2.json'), 'utf8')
);

const ok = (json = { id: 'x' }) => ({ json });
const err = (message, description) => ({ json: { error: { message, description } } });

/**
 * Execute the node.
 *
 * @param intent  what Build Messages decided: { whatsapp, email }
 * @param outputs per-node run data, or a thrown Error to simulate "no run data"
 */
function run(intent, outputs) {
  const $ = (name) => {
    if (name === 'Build Messages') {
      if (intent instanceof Error) throw intent;
      return { first: () => ({ json: { sendWhatsapp: !!intent.whatsapp, sendEmail: !!intent.email } }) };
    }
    return {
      all: () => {
        const v = outputs[name];
        if (v instanceof Error) throw v;
        return v === undefined ? [] : v;
      },
    };
  };
  // eslint-disable-next-line no-new-func
  const out = new Function('$', '$input', SRC)($, { all: () => [] });
  return out[0].json;
}

const WA = 'Send: WhatsApp';
const EM = 'Send: Email (Resend)';

describe('the embedded copy matches the source file', () => {
  it('is byte-identical to n8n/assert-sent.js', () => {
    // Same rule as build-messages.js: they are ONE artefact, committed together.
    const node = WF.nodes.find((n) => n.name === 'Assert Sent');
    expect(node).toBeTruthy();
    expect(node.type).toBe('n8n-nodes-base.code');
    expect(node.parameters.jsCode.trimEnd()).toBe(SRC.trimEnd());
  });

  it('still relies on the send nodes continuing past their own errors', () => {
    // If either send node loses continueRegularOutput, a failure halts the run
    // before this node ever sees it and the whole report goes dark.
    for (const name of [WA, EM]) {
      const node = WF.nodes.find((n) => n.name === name);
      expect(node, name).toBeTruthy();
      expect(node.onError, name).toBe('continueRegularOutput');
    }
  });
});

describe('success — nothing failed', () => {
  it('both channels delivered', () => {
    const r = run({ whatsapp: true, email: true }, { [WA]: [ok()], [EM]: [ok()] });
    expect(r.status).toBe('success');
    expect(r.delivered).toEqual([WA, EM]);
    expect(r.failed).toEqual([]);
  });

  it('one channel requested and delivered, the other never attempted', () => {
    // A recipient with a phone and no email. Not a partial failure — there was
    // no second channel to fail.
    const r = run({ whatsapp: true, email: false }, { [WA]: [ok()] });
    expect(r.status).toBe('success');
    expect(r.attempted).toEqual([WA]);
    expect(r.channels.find((c) => c.channel === EM).status).toBe('skipped');
  });

  it('no channels attempted at all', () => {
    // Deliberately `success` — nothing failed. The empty arrays are on the
    // output so a reader sees that nothing was sent either.
    const r = run({ whatsapp: false, email: false }, {});
    expect(r.status).toBe('success');
    expect(r.attempted).toEqual([]);
    expect(r.delivered).toEqual([]);
  });
});

describe('partial_success — THE CASE THAT USED TO GO RED', () => {
  it('WhatsApp delivered, email rejected', () => {
    // The exact production shape: Resend 401 while WaSender succeeded.
    const r = run(
      { whatsapp: true, email: true },
      {
        [WA]: [ok()],
        [EM]: [err('Request failed with status code 401',
          'This API key is not authorized to send emails from mazzado.com')],
      }
    );
    expect(r.status).toBe('partial_success');
    expect(r.delivered).toEqual([WA]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].channel).toBe(EM);
    // The provider's own words survive — that sentence is what identified the
    // root cause, and the old node buried it in a concatenated throw.
    expect(r.failed[0].error).toContain('not authorized to send emails from mazzado.com');
  });

  it('does NOT throw, so the execution is not marked failed', () => {
    expect(() =>
      run({ whatsapp: true, email: true }, { [WA]: [ok()], [EM]: [err('boom')] })
    ).not.toThrow();
  });

  it('email delivered, WhatsApp rejected — symmetric', () => {
    const r = run(
      { whatsapp: true, email: true },
      { [WA]: [err('WaSender session closed')], [EM]: [ok()] }
    );
    expect(r.status).toBe('partial_success');
    expect(r.delivered).toEqual([EM]);
    expect(r.failed[0].channel).toBe(WA);
    expect(r.failed[0].error).toContain('session closed');
  });
});

describe('failed — nothing got out', () => {
  it('every attempted channel failed', () => {
    expect(() =>
      run({ whatsapp: true, email: true }, { [WA]: [err('no session')], [EM]: [err('401')] })
    ).toThrow(/All notification channels failed/);
  });

  it('names each channel and its own reason', () => {
    // The old message joined reasons with ' | ' and never said which channel
    // produced which — unreadable with two channels down for different causes.
    let msg = '';
    try {
      run({ whatsapp: true, email: true },
        { [WA]: [err('no session')], [EM]: [err('bad key')] });
    } catch (e) { msg = e.message; }
    expect(msg).toContain(WA + ': ');
    expect(msg).toContain(EM + ': ');
    expect(msg).toContain('no session');
    expect(msg).toContain('bad key');
  });

  it('the ONLY attempted channel failed', () => {
    expect(() => run({ whatsapp: false, email: true }, { [EM]: [err('401')] }))
      .toThrow(/All notification channels failed/);
  });

  it('a skipped channel cannot rescue a failed one', () => {
    // 'skipped' must not be counted as delivered — that would turn a total
    // outage into a partial success and hide it.
    let threw = false;
    try { run({ whatsapp: false, email: true }, { [EM]: [err('401')] }); }
    catch (e) { threw = true; }
    expect(threw).toBe(true);
  });
});

describe('missing run data is its own state, not a guess', () => {
  it('a requested channel with no output is neither sent nor failed', () => {
    const r = run({ whatsapp: true, email: false }, { [WA]: [] });
    expect(r.channels.find((c) => c.channel === WA).status).toBe('no_output');
    // Nothing failed, so the verdict is not `failed` — inventing a failure from
    // absent data is how a working channel gets blamed.
    expect(r.status).toBe('success');
    expect(r.failed).toEqual([]);
  });

  it('survives a node reference that throws', () => {
    const r = run({ whatsapp: true, email: false }, { [WA]: new Error('no run data') });
    expect(r.channels.find((c) => c.channel === WA).status).toBe('no_output');
    expect(r.status).toBe('success');
  });

  it('survives Build Messages being unreadable', () => {
    // Without intent we cannot know what was requested; the run must still
    // produce a report rather than crash on the way to one.
    const r = run(new Error('no Build Messages'), {});
    expect(r.status).toBe('success');
    expect(r.intentError).toContain('no Build Messages');
  });
});

describe('the error text keeps the useful half', () => {
  it('prefers description and message together, deduplicated', () => {
    // Email is the only attempted channel and it fails, so this is a TOTAL
    // failure and the node throws — read the text off the thrown error. Calling
    // run() outside the try to grab a return value cannot work here.
    let msg = '';
    try {
      run({ whatsapp: false, email: true },
        { [EM]: [err('Request failed with status code 401', 'API key not authorized')] });
    } catch (e) { msg = e.message; }
    expect(msg).toContain('API key not authorized');
    expect(msg).toContain('status code 401');
  });

  it('keeps both halves on a PARTIAL failure too, where nothing throws', () => {
    const r = run(
      { whatsapp: true, email: true },
      {
        [WA]: [ok()],
        [EM]: [err('Request failed with status code 401', 'API key not authorized')],
      }
    );
    expect(r.status).toBe('partial_success');
    expect(r.failed[0].error).toContain('API key not authorized');
    expect(r.failed[0].error).toContain('status code 401');
  });

  it('does not repeat a reason when message and description are identical', () => {
    let msg = '';
    try {
      run({ whatsapp: false, email: true }, { [EM]: [err('same text', 'same text')] });
    } catch (e) { msg = e.message; }
    expect(msg.match(/same text/g)).toHaveLength(1);
  });

  it('does not print [object Object] for an unshaped error', () => {
    let msg = '';
    try {
      run({ whatsapp: false, email: true }, { [EM]: [{ json: { error: { code: 7 } } }] });
    } catch (e) { msg = e.message; }
    expect(msg).not.toContain('[object Object]');
    expect(msg).toContain('7');
  });
});
