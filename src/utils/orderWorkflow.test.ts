import { describe, it, expect } from 'vitest';

// executeOrderTransition is Firebase-bound (imports db/getCallableFunction from
// '../services/firebase'), so it cannot run headless in this test. Instead,
// this test locks down the PURE transition-target logic by re-deriving it
// from the module's exported VALID_TRANSITIONS/validateTransition, which ARE
// pure and exported. It asserts the FSM still allows the transition this
// slice depends on (paid -> disputed) and that disputed is a legal source
// for all three resolution targets — a regression guard, not a full
// integration test of the Firestore write (which the manual smoke test covers).
import { VALID_TRANSITIONS, validateTransition } from './orderWorkflow';

describe('orderWorkflow — dispute transitions (Slice D regression guard)', () => {
  it('paid, shipped, and delivered can all transition to disputed', () => {
    expect(VALID_TRANSITIONS.paid).toContain('disputed');
    expect(VALID_TRANSITIONS.shipped).toContain('disputed');
    expect(VALID_TRANSITIONS.delivered).toContain('disputed');
  });
  it('disputed can resolve to completed, refunded, or paid (resume)', () => {
    expect(VALID_TRANSITIONS.disputed).toEqual(expect.arrayContaining(['completed', 'refunded', 'paid']));
  });
  it('validateTransition does not throw for paid -> disputed', () => {
    expect(() => validateTransition('paid', 'disputed')).not.toThrow();
  });
});
