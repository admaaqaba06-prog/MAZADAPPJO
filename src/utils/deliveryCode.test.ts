// Wave 3 — delivery-code twin (client). NORMALIZE_CASES is duplicated from
// functions/deliveryCode.test.js on purpose: the buyer types the code here and
// the server compares normalized forms, so the two must agree exactly.
import { describe, it, expect } from 'vitest';
import { isValidDeliveryCode, normalizeDeliveryCodeInput } from './deliveryCode';

const NORMALIZE_CASES: [string, string][] = [
  ['dc-7k3qp', 'DC-7K3QP'],
  ['DC-7K3QP', 'DC-7K3QP'],
  ['  dc 7k3qp  ', 'DC-7K3QP'],
  ['7K3QP', 'DC-7K3QP'],
  ['dc7k3qp', 'DC-7K3QP'],
  ['DC-DC-7K3QP', 'DC-7K3QP'],
];

describe('deliveryCode (client twin)', () => {
  it('normalizes buyer typing the same way the server does', () => {
    for (const [input, expected] of NORMALIZE_CASES) {
      expect(normalizeDeliveryCodeInput(input)).toBe(expected);
    }
  });

  it('validates exactly what the server validates', () => {
    expect(isValidDeliveryCode('DC-7K3QP')).toBe(true);
    expect(isValidDeliveryCode('MZ-7K3QP')).toBe(false);
    expect(isValidDeliveryCode('DC-7K3Q0')).toBe(false);
    expect(isValidDeliveryCode('dc-7k3qp')).toBe(false);
    expect(isValidDeliveryCode(undefined)).toBe(false);
  });
});
