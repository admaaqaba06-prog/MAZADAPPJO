import { describe, it, expect } from 'vitest';
import { toE164Jordan } from './phoneNumber';

describe('toE164Jordan', () => {
  it('converts local 07xxxxxxxx to E.164', () => {
    expect(toE164Jordan('0791234567')).toBe('+962791234567');
    expect(toE164Jordan('079 123 4567')).toBe('+962791234567');
  });
  it('accepts already-E.164 and 00962 forms', () => {
    expect(toE164Jordan('+962791234567')).toBe('+962791234567');
    expect(toE164Jordan('00962791234567')).toBe('+962791234567');
    expect(toE164Jordan('962791234567')).toBe('+962791234567');
  });
  it('handles country code followed by a local leading zero', () => {
    expect(toE164Jordan('+9620791234567')).toBe('+962791234567');
    expect(toE164Jordan('009620791234567')).toBe('+962791234567');
  });
  it('accepts local without leading zero (7xxxxxxxx)', () => {
    expect(toE164Jordan('791234567')).toBe('+962791234567');
  });
  it('rejects invalid input', () => {
    expect(toE164Jordan('')).toBeNull();
    expect(toE164Jordan('12345')).toBeNull();
    expect(toE164Jordan('06123456')).toBeNull(); // landline, not a 7x mobile
    expect(toE164Jordan('notaphone')).toBeNull();
  });
});
