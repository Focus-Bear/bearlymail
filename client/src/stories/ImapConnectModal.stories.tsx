/**
 * The IMAP/SMTP connect form, the provider picker that leads to it, and an
 * account whose saved password stopped working. API calls are stubbed.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import axios from 'axios';
import i18n from 'i18next';

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

const CERTIFICATE_MISMATCH = {
  ok: false,
  failure: {
    protocol: 'imap',
    code: 'certificate_mismatch',
    detail:
      "Hostname/IP does not match certificate's altnames: Host: mail.mybusiness.com.au. is not in the cert's altnames: DNS:s123.crazydomains.com",
  },
};

/** Stubs the IMAP endpoints so the form can be exercised without a server. */
function withStubbedApi(testResult: unknown): Decorator {
  return Story => {
    axios.get = (async () => ({ data: { servers: null } })) as typeof axios.get;
    axios.post = (async (url: string) =>
      url.includes('/imap-accounts/test') ? { data: testResult } : { data: { ok: true } }) as typeof axios.post;
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

export const ConnectForm: Story = {
  name: 'Connect form',
  decorators: [withStubbedApi({ ok: true, mailboxes: { archive: 'INBOX.Archive', sent: 'INBOX.Sent', trash: null } })],
  render: () => <ImapConnectModal isOpen onClose={() => {}} onConnected={() => {}} />,
};

export const CertificateMismatch: Story = {
  name: 'Connect form: certificate for another host',
  decorators: [withStubbedApi(CERTIFICATE_MISMATCH)],
  render: () => <ImapConnectModal isOpen onClose={() => {}} onConnected={() => {}} />,
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
