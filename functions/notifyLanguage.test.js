// notify() cannot be imported (index.js initialises firebase-admin at module
// load), so the wiring is asserted against the source — the house idiom, see
// functions/secondChanceCallable.test.js. Anchored on real syntax, never on a
// character count: five briefs on this project shipped fixed-width windows and
// every one of them was wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

function notifyBody() {
  const start = SRC.indexOf('async function notify({');
  if (start === -1) throw new Error('notify() not found — anchor moved');
  const end = SRC.indexOf('\n}', start);
  if (end === -1) throw new Error('notify() end not found — anchor moved');
  return SRC.slice(start, end + 2);
}

describe('notify() sends in the recipient language', () => {
  const body = notifyBody();

  it('resolves the language from the user doc it already loaded', () => {
    // The doc is already fetched for phone/email/name, so this costs no extra read.
    expect(body).toMatch(/resolveLang\(user\)/);
  });

  it('resolves it AFTER the user lookup, not before', () => {
    expect(body.indexOf('resolveLang(user)')).toBeGreaterThan(body.indexOf("collection('users')"));
  });

  it('passes the language to the in-app copy', () => {
    expect(body).toMatch(/copyFor\(event,\s*d,\s*lang\)/);
  });

  // notify() calls copyFor TWICE — once for the in-app write, once for wa_text.
  // The single toMatch above is satisfied by either one, so dropping `lang` from
  // the in-app write alone survives it: the bell would go out in Arabic to an
  // English reader while WhatsApp got it right. Every call site must carry lang.
  it('leaves no copyFor call without a language', () => {
    const calls = body.match(/copyFor\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) expect(call).toMatch(/,\s*lang\s*\)$/);
  });

  it('passes the language to the email renderer', () => {
    expect(body).toMatch(/emailFor\(event,\s*\{[^}]*\},\s*lang\)/);
  });

  it('sends wa_text so the n8n node does not have to render it', () => {
    expect(body).toMatch(/wa_text:/);
  });

  it('still sends email_content — the node prefers it', () => {
    expect(body).toMatch(/email_content:/);
  });

  it('gates wa_text on the whatsapp channel, as email_content is gated on email', () => {
    expect(body).toMatch(/channels\.whatsapp\s*\?\s*\{\s*wa_text/);
  });

  // The shape is load-bearing, not cosmetic: Task 4 makes the n8n node PREFER
  // wa_text and fall back to its own rendering, which is
  // `n8n/build-messages.js`'s `c.description ? `${c.title}\n${c.description}` :
  // c.title`. A different separator here would silently reformat every message
  // whenever the fallback ran, and nothing else in the suite would notice.
  it('renders wa_text in the shape the n8n node already produces', () => {
    expect(body).toMatch(/c\.description\s*\?\s*`\$\{c\.title\}\\n\$\{c\.description\}`\s*:\s*c\.title/);
  });
});
