/**
 * Executes ContactCompletionModal's body.
 *
 * No @types/react and non-strict TS, so a bad prop or a TDZ fault survives both
 * `tsc` and the unit suite and only breaks when a member hits the bid/sell gate
 * — which is every new seller. react-dom/server renders once and runs NO
 * effects, so this proves render-time correctness, not the OTP round trip.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('lucide-react', () => new Proxy({}, {
  get: (_t, key) => (typeof key === 'symbol' || key === 'then' || key === '__esModule'
    ? undefined
    : () => null),
  has: (_t, key) => typeof key === 'string' && key !== 'then',
}));
vi.mock('../services/firebase', () => ({ auth: {}, db: {} }));
vi.mock('./ui/PhoneInput', () => ({ PhoneInput: () => null }));

const appMock = {
  currentUser: { id: 'u1', name: 'MJ', phoneNumber: '', email: '' },
  language: 'en',
  requestWhatsappOtp: async () => ({ ok: true }),
  attachWhatsappPhone: async () => ({ ok: true }),
  linkPhoneSendCode: async () => 'vid',
  linkPhoneToAccount: async () => {},
  saveEmail: async () => {},
};
vi.mock('../context/AppContext', () => ({ useApp: () => appMock }));

import { ContactCompletionModal } from './ContactCompletionModal';

const render = (open = true) =>
  renderToStaticMarkup(
    React.createElement(ContactCompletionModal, { open, onClose: () => {}, onComplete: () => {} }),
  );

describe('ContactCompletionModal renders', () => {
  it('offers both channels, with WhatsApp available alongside SMS', () => {
    const html = render();
    expect(html).toContain('Complete your contact info');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('SMS');
  });

  it('hosts the invisible reCAPTCHA the SMS branch renders into', () => {
    // RecaptchaVerifier throws if this element is not already in the DOM.
    expect(render()).toContain('contact-recaptcha-container');
  });

  it('starts on the phone step, not the code step', () => {
    const html = render();
    expect(html).toContain('Send code');
    // Resend belongs to the code step only — showing it here would invite a
    // resend before anything was ever sent.
    expect(html).not.toContain('Resend code');
  });

  it('renders nothing when closed', () => {
    expect(render(false)).toBe('');
  });
});
