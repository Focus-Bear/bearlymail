/**
 * Settings → Use your own AI account, with the AI-keys API stubbed: a user who
 * hasn't connected anything (fields hidden), the expanded empty form, and a
 * user whose saved key the provider has since rejected.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import axios from 'axios';
import i18n from 'i18next';

import { OwnAiAccountSection } from 'components/settings/own-ai-account/OwnAiAccountSection';
import { AI_PROVIDER_IDS, AI_PROVIDERS } from 'constants/ownAiAccount';
import type { AiKeyStatus } from 'hooks/settings/useOwnAiKeys';
import en from 'locales/en.json';

const storyI18n = i18n.createInstance();
storyI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const NO_KEYS: AiKeyStatus[] = AI_PROVIDERS.map(provider => ({
  provider: provider.id,
  hasKey: false,
  maskedKey: null,
  rejectedAt: null,
}));

const WITH_REJECTED_OPENAI_KEY: AiKeyStatus[] = NO_KEYS.map(status =>
  status.provider === AI_PROVIDER_IDS.OPENAI
    ? { ...status, hasKey: true, maskedKey: 'sk-••••a1B2', rejectedAt: '2026-11-10T01:30:00Z' }
    : status
);

function withStatuses(providers: AiKeyStatus[]): Decorator {
  return Story => {
    axios.get = (async () => ({ data: { providers } })) as typeof axios.get;
    return (
      <I18nextProvider i18n={storyI18n}>
        <div style={{ maxWidth: 760, padding: 24 }}>
          <Story />
        </div>
      </I18nextProvider>
    );
  };
}

const meta: Meta = { title: 'Settings/Use your own AI account', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const NotConnected: Story = {
  name: 'Not connected (fields hidden)',
  decorators: [withStatuses(NO_KEYS)],
  render: () => <OwnAiAccountSection />,
};

export const RejectedKey: Story = {
  name: 'Saved key the provider rejected',
  decorators: [withStatuses(WITH_REJECTED_OPENAI_KEY)],
  render: () => <OwnAiAccountSection />,
};
