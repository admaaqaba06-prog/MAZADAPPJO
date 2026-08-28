// Assert Sent — per-channel outcome, and a verdict that only fails when EVERY
// attempted channel failed.
//
// WHAT THIS REPLACES. The old node was four lines: collect any item carrying an
// `error` and throw if there were any. Both send nodes run with
// `onError: continueRegularOutput`, so a failure arrives as an item rather than
// halting — which meant ONE broken channel failed the WHOLE execution even when
// the other had delivered.
//
// That is not a cosmetic complaint. It cost weeks of misdiagnosis: Resend
// started rejecting every send with "This API key is not authorized to send
// emails from mazzado.com", every run went red, the n8n dashboard read 68.7%
// failed, and the investigation went hunting for a WhatsApp fault. WhatsApp was
// fine the entire time — `Send: WhatsApp` was returning success on the very runs
// being counted as total failures. A metric that cannot tell "email is down"
// from "nothing was delivered" sends you to the wrong place.
//
// WHY IT STILL THROWS, sometimes. A Code node that never throws makes every
// execution green, and then n8n's own failure count — the thing anyone actually
// watches — goes blind. So the throw is kept for the one case that deserves it:
// nothing at all got through. Partial delivery returns normally and carries the
// detail.
//
// WHY IT READS THE SEND NODES DIRECTLY rather than the merged items. Input here
// comes from `Both Channels Done`, a Merge node, and a merged item does not say
// which branch produced it. Attributing a failure by guessing at response shape
// would be a coin flip between a WaSender body and a Resend body. Referencing
// each send node by name is unambiguous.

/** The error text an n8n item carries, in the shapes n8n actually produces. */
function describeError(err) {
  if (!err) return null;
  if (typeof err === 'string') return err;
  const parts = [err.message, err.description].filter(
    (p) => typeof p === 'string' && p.trim() !== ''
  );
  if (parts.length) {
    // description is usually the useful half (the provider's own words); message
    // is often just "Request failed with status code 401".
    return [...new Set(parts)].join(' — ');
  }
  try {
    return JSON.stringify(err);
  } catch (e) {
    return String(err);
  }
}

/**
 * One channel's outcome.
 *
 * `wanted` is false when Build Messages gated the channel off (no phone, no
 * email, or the server's own channel policy said no). A channel that was never
 * attempted is NOT a failure and must not drag the verdict down — the old node
 * had no concept of this at all.
 */
function readChannel(nodeName, wanted, lookup) {
  if (!wanted) return { channel: nodeName, status: 'skipped', error: null };

  let items;
  try {
    items = lookup(nodeName);
  } catch (e) {
    // The node exists in the graph but produced no run data — it was gated off
    // upstream, or n8n has nothing for it. Reported as its own state rather
    // than guessed either way.
    return { channel: nodeName, status: 'no_output', error: describeError(e) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { channel: nodeName, status: 'no_output', error: null };
  }

  const errs = items
    .map((i) => i && i.json && i.json.error)
    .filter(Boolean)
    .map(describeError);

  if (errs.length) {
    return { channel: nodeName, status: 'failed', error: [...new Set(errs)].join(' | ') };
  }
  return { channel: nodeName, status: 'sent', error: null };
}

const WHATSAPP_NODE = 'Send: WhatsApp';
const EMAIL_NODE = 'Send: Email (Resend)';

// Which channels were asked for. Read from Build Messages, which is the node
// that decided them — not re-derived here, so there is one owner of the policy.
let wantWhatsapp = false;
let wantEmail = false;
let intentError = null;
try {
  const build = $('Build Messages').first().json;
  wantWhatsapp = build.sendWhatsapp === true;
  wantEmail = build.sendEmail === true;
} catch (e) {
  intentError = describeError(e);
}

const lookup = (name) => $(name).all();

const channels = [
  readChannel(WHATSAPP_NODE, wantWhatsapp, lookup),
  readChannel(EMAIL_NODE, wantEmail, lookup),
];

const attempted = channels.filter((c) => c.status !== 'skipped');
const delivered = channels.filter((c) => c.status === 'sent');
const failed = channels.filter((c) => c.status === 'failed');

/**
 * The verdict.
 *
 *   failed          every channel that was attempted failed — nothing got out
 *   partial_success at least one delivered AND at least one failed
 *   success         nothing failed
 *
 * A run with NO channels attempted lands on `success`, and that is deliberate
 * rather than flattering: there was no failure. `attempted: []` and
 * `delivered: []` are on the output, so the distinction is visible to anyone
 * reading it instead of being buried in a word.
 */
let status;
if (attempted.length > 0 && delivered.length === 0 && failed.length > 0) {
  status = 'failed';
} else if (delivered.length > 0 && failed.length > 0) {
  status = 'partial_success';
} else {
  status = 'success';
}

const report = {
  status,
  attempted: attempted.map((c) => c.channel),
  delivered: delivered.map((c) => c.channel),
  failed: failed.map((c) => ({ channel: c.channel, error: c.error })),
  channels,
};
if (intentError) report.intentError = intentError;

// Total failure still raises, so n8n's own failure count stays meaningful — see
// the note at the top. The message names EVERY channel and its reason, because
// the previous message concatenated them without saying which was which.
if (status === 'failed') {
  const detail = failed.map((c) => c.channel + ': ' + (c.error || 'unknown')).join(' | ');
  throw new Error('All notification channels failed — ' + detail);
}

return [{ json: report }];
