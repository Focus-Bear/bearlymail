/**
 * Email verification screens for password sign-ups:
 *
 *   - CheckInbox      — after sign-up, or when sign-in is refused because the
 *                       address isn't confirmed yet; offers a resend button
 *   - ResendFailed    — the resend request failed
 *   - Verifying       — the emailed link is being checked
 *   - Verified        — the link worked; next step is signing in
 *   - LinkExpired     — the link expired or was used; asks for the address to
 *                       send a new one
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';

import { CheckInboxPanel } from 'components/auth/CheckInboxPanel';
import { VERIFY_EMAIL_STATUS, VerifyEmailView } from 'components/auth/VerifyEmailView';
import en from 'locales/en.json';

const verifyI18n = i18n.createInstance();
verifyI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const resolves = () => Promise.resolve();
const rejects = () => Promise.reject(new Error('network'));
const noop = () => undefined;

const meta: Meta = {
  title: 'Auth/VerifyEmail',
  decorators: [
    Story => (
      <I18nextProvider i18n={verifyI18n}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </I18nextProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

export const CheckInbox: Story = {
  render: () => <CheckInboxPanel email="ana@example.com" onResend={resolves} onBack={noop} />,
};

export const ResendFailed: Story = {
  render: () => <CheckInboxPanel email="ana@example.com" onResend={rejects} onBack={noop} />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button')?.click();
  },
};

export const Verifying: Story = {
  render: () => <VerifyEmailView status={VERIFY_EMAIL_STATUS.VERIFYING} onResend={resolves} />,
};

export const Verified: Story = {
  render: () => <VerifyEmailView status={VERIFY_EMAIL_STATUS.VERIFIED} onResend={resolves} />,
};

export const LinkExpired: Story = {
  render: () => <VerifyEmailView status={VERIFY_EMAIL_STATUS.FAILED} onResend={resolves} />,
};
