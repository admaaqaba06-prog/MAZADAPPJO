import { describe, it, expect } from 'vitest';
import {
  ORDER_REF_ALPHABET,
  generateOrderRef,
  isValidOrderRef,
  normalizeOrderRefInput,
  displayOrderRef,
} from './orderRef';

describe('orderRef (client)', () => {
  it('generateOrderRef() output passes isValidOrderRef', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidOrderRef(generateOrderRef())).toBe(true);
    }
  });

  it('is deterministic with an injected pick (pick=0 → MZ-22222)', () => {
    expect(generateOrderRef(() => 0)).toBe('MZ-22222');
  });

  it('is deterministic with an injected pick (pick=1 → MZ-33333)', () => {
    expect(generateOrderRef(() => 1)).toBe('MZ-33333');
  });

  it('alphabet has 32 chars and excludes the misread-prone 0 O 1 I', () => {
    // A 32-symbol base cannot exclude all of {0,O,1,I,L} — only 31 such symbols
    // exist in [2-9A-Z]. The pinned constant keeps L to stay a clean power-of-two.
    expect(ORDER_REF_ALPHABET.length).toBe(32);
    for (const bad of ['0', 'O', '1', 'I']) {
      expect(ORDER_REF_ALPHABET.includes(bad)).toBe(false);
    }
  });

  it('isValidOrderRef accepts and rejects correctly', () => {
    expect(isValidOrderRef('MZ-7K3QP')).toBe(true);
    expect(isValidOrderRef('MZ-7K3Q0')).toBe(false); // 0 not in alphabet
    expect(isValidOrderRef('mz-7k3qp')).toBe(false); // lowercase
    expect(isValidOrderRef('7K3QP')).toBe(false); // no prefix
  });

  it('normalizeOrderRefInput trims, uppercases, strips spaces, prefixes MZ-', () => {
    expect(normalizeOrderRefInput(' mz-7k3qp ')).toBe('MZ-7K3QP');
    expect(normalizeOrderRefInput('7k3qp')).toBe('MZ-7K3QP');
    expect(normalizeOrderRefInput('mz 7k3qp')).toBe('MZ-7K3QP');
  });

  it('displayOrderRef prefers orderRef, falls back to id', () => {
    expect(displayOrderRef({ orderRef: 'MZ-7K3QP', id: 'abc' })).toBe('MZ-7K3QP');
    expect(displayOrderRef({ id: 'abcdef1234567' })).toBe('#ABCDEF12');
  });
});
