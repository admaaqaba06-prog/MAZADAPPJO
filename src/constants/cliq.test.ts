import { describe, it, expect } from 'vitest';
import { CLIQ_RECIPIENT_NAME_AR, CLIQ_RECIPIENT_NAME_EN } from './cliq';

// Guards the money-surface recipient name against accidental blanking:
// these strings are rendered wherever a user is told who to CliQ money to.
describe('CliQ recipient constants', () => {
  it('AR recipient name is a non-empty string', () => {
    expect(typeof CLIQ_RECIPIENT_NAME_AR).toBe('string');
    expect(CLIQ_RECIPIENT_NAME_AR.trim().length).toBeGreaterThan(0);
  });

  it('EN recipient name is a non-empty string', () => {
    expect(typeof CLIQ_RECIPIENT_NAME_EN).toBe('string');
    expect(CLIQ_RECIPIENT_NAME_EN.trim().length).toBeGreaterThan(0);
  });
});
