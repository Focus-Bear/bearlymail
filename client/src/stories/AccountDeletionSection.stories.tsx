/**
 * AccountDeletionSection stories — the "Are you absolutely sure?" prompt
 * reassures the user that deleting their BearlyMail account leaves their email
 * in their provider, naming the provider when it can.
 */
import React, { useEffect } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';

import { AccountDeletionSection } from 'components/settings/AccountDeletionSection';
import { PROVIDER_GMAIL, PROVIDER_IMAP, PROVIDER_OFFICE365 } from 'constants/strings';
import { AuthContext } from 'contexts/AuthContext';
import en from 'locales/en.json';

const DELETE_BUTTON_SELECTOR = '#account-deletion button';

const deletionI18n = i18n.createInstance();
deletionI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const storyAuth = { logout: () => undefined } as unknown as React.ContextType<typeof AuthContext>;

/** Opens the confirmation so the story shows the prompt, not just the button. */
const OpenedPrompt: React.FC<React.ComponentProps<typeof AccountDeletionSection>> = props => {
  useEffect(() => {
    document.querySelector<HTMLButtonElement>(DELETE_BUTTON_SELECTOR)?.click();
  }, []);
  return (
    <I18nextProvider i18n={deletionI18n}>
      <AuthContext.Provider value={storyAuth}>
        <AccountDeletionSection {...props} />
      </AuthContext.Provider>
    </I18nextProvider>
  );
};

const meta: Meta<typeof OpenedPrompt> = {
  title: 'Settings/AccountDeletionSection',
  component: OpenedPrompt,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof OpenedPrompt>;

export const Gmail: Story = { args: { connectedProviders: [PROVIDER_GMAIL] } };

export const Outlook: Story = { args: { connectedProviders: [PROVIDER_OFFICE365] } };

export const GmailAndOutlook: Story = { args: { connectedProviders: [PROVIDER_GMAIL, PROVIDER_OFFICE365] } };

export const ImapMailbox: Story = { args: { connectedProviders: [PROVIDER_IMAP] } };
