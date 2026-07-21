import { describe, it, expect } from 'vitest';
import { resolveConfirm } from './useBidFlow';

describe('resolveConfirm', () => {
  it('sends the staged amount when the minimum has not moved', () => {
    expect(resolveConfirm(120, 120)).toEqual({ action: 'send', amount: 120 });
  });

  it('sends the staged amount when the user staged above the minimum', () => {
    expect(resolveConfirm(150, 120)).toEqual({ action: 'send', amount: 150 });
  });

  it('re-prompts at the fresh minimum when a rival outbid during the confirm window', () => {
    expect(resolveConfirm(120, 135)).toEqual({ action: 'reprompt', amount: 135 });
  });
});
