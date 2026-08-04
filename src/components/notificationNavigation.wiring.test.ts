// The bell navigates, and marks read, in one click.
//
// Pinned at the source: NotificationCenter needs the full app context and the
// motion stack, and vitest here is `environment: 'node'`. The DECISION is
// unit-tested in notificationDestination.test.ts; this pins that the component
// actually calls it and honours its answer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./NotificationCenter.tsx', import.meta.url), 'utf8');

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const CODE = stripComments(SRC);

function handler(): string {
  const i = CODE.indexOf('const handleNotificationClick');
  if (i === -1) throw new Error('handleNotificationClick not found');
  const end = CODE.indexOf('\n  };', i);
  if (end === -1) throw new Error('handler body never closes — anchor moved');
  return CODE.slice(i, end);
}

describe('clicking a notification', () => {
  it('is wired to the handler, not to a bare markAsRead', () => {
    // The reported state: onClick={() => markAsRead(item.id)} and nothing else.
    expect(CODE).toMatch(/onClick=\{\(\) => handleNotificationClick\(item\)\}/);
    expect(CODE).not.toMatch(/onClick=\{\(\) => markAsRead\(item\.id\)\}/);
  });

  it('still marks read — that is what the click always meant', () => {
    expect(handler()).toMatch(/markAsRead\(item\.id\)/);
  });

  it('marks read BEFORE deciding where to go, so an unroutable one still reads', () => {
    // An announcement has no destination; it must still stop being unread.
    const h = handler();
    const read = h.indexOf('markAsRead');
    const decide = h.indexOf('notificationDestination');
    expect(read).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(-1);
    expect(read).toBeLessThan(decide);
  });

  it('asks the shared resolver rather than branching on type inline', () => {
    expect(handler()).toMatch(/notificationDestination\(item\)/);
    // No second, divergent opinion about where things live.
    expect(handler()).not.toMatch(/item\.type === '(outbid|order|win)'/);
  });

  it('STAYS PUT when the resolver cannot say where', () => {
    // null means "no confident destination". Navigating anyway is the bug this
    // whole resolver exists to prevent.
    expect(handler()).toMatch(/if \(!destination\) return;/);
  });

  it('carries the entity id, not just the view', () => {
    const h = handler();
    expect(h).toMatch(/setActiveAuctionId\(destination\.auctionId\)/);
    expect(h).toMatch(/setGlobalSelectedOrderId\(destination\.orderId\)/);
    expect(h).toMatch(/setActiveView\(destination\.view\)/);
  });

  it('closes the panel, which would otherwise cover the destination', () => {
    expect(handler()).toMatch(/onClose\(\)/);
  });
});
