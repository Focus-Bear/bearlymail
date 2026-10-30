/**
 * The IMAP/SMTP connect form, the provider picker that leads to it, and an
 * account whose saved password stopped working. API calls are stubbed.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import axios from 'axios';
import i18n from 'i18next';

import { GmailConnectionScreen } from 'components/inbox/GmailConnectionScreen';
import { EmailAccountsSection } from 'components/settings/email-delivery/EmailAccountsSection';
import { ImapConnectModal } from 'components/settings/email-delivery/imap/ImapConnectModal';
import { ProviderSelectionModal } from 'components/settings/email-delivery/ProviderSelectionModal';
import en from 'locales/en.json';

const storyI18n = i18n.createInstance();
storyI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

type ConnectOutcome = { ok: true } | { failureCode: string; detail?: string };

/** Stubs the connect endpoint so each story shows one outcome. */
function withStubbedApi(outcome: ConnectOutcome): Decorator {
  return Story => {
    axios.post = (async () => {
      if ('ok' in outcome) {
        return { data: { account: { id: 'i1' } } };
      }
      throw {
        isAxiosError: true,
        response: {
          status: 400,
          data: { failure: { protocol: 'imap', code: outcome.failureCode, detail: outcome.detail ?? '' } },
        },
      };
    }) as typeof axios.post;
    return (
      <I18nextProvider i18n={storyI18n}>
        <Story />
      </I18nextProvider>
    );
  };
}

const meta: Meta = {
  title: 'Settings/IMAP mailbox',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj;

const Modal: React.FC = () => (
  <ImapConnectModal isOpen onClose={() => {}} onConnected={() => {}} onUseProvider={() => {}} />
);

export const ConnectForm: Story = {
  name: 'Connect form',
  decorators: [withStubbedApi({ ok: true })],
  render: () => <Modal />,
};

export const WrongPassword: Story = {
  name: 'Wrong password',
  decorators: [withStubbedApi({ failureCode: 'auth_failed', detail: 'AUTHENTICATIONFAILED Authentication failed.' })],
  render: () => <Modal />,
};

export const GoogleMail: Story = {
  name: 'Address is Google mail',
  decorators: [withStubbedApi({ failureCode: 'use_gmail' })],
  render: () => <Modal />,
};

export const SettingsNotFound: Story = {
  name: 'Settings not found',
  decorators: [withStubbedApi({ failureCode: 'server_not_found', detail: 'connect ECONNREFUSED' })],
  render: () => <Modal />,
};

export const NoMailboxScreen: Story = {
  name: 'No mailbox connected yet',
  decorators: [withStubbedApi({ ok: true })],
  render: () => <GmailConnectionScreen />,
};

export const ProviderPicker: Story = {
  name: 'Provider picker with IMAP',
  decorators: [withStubbedApi({ ok: true })],
  render: () => <ProviderSelectionModal isOpen onClose={() => {}} onSelectProvider={() => {}} />,
};

export const AccountNeedsPassword: Story = {
  name: 'Account whose password was rejected',
  decorators: [withStubbedApi({ ok: true })],
  render: () => (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <EmailAccountsSection
        googleAccounts={[]}
        office365Accounts={[]}
        zohoAccounts={[]}
        appleMailAccounts={[]}
        appleMailAvailable={false}
        imapAccounts={[
          {
            id: 'i1',
            email: 'hello@mybusiness.com.au',
            name: 'Sam Rivera',
            imapHost: 'mail.mybusiness.com.au',
            smtpHost: 'mail.mybusiness.com.au',
            isPrimary: true,
            needsRelogin: true,
            lastError: 'AUTHENTICATIONFAILED',
          },
        ]}
        onFetchData={async () => {}}
      />
    </div>
  ),
};
