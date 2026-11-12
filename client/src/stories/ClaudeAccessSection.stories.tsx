/**
 * Settings → Connect Claude, with the tokens API stubbed: a first-time user
 * (connector recommended, tokens tucked away) and someone who uses tokens.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Decorator, Meta, StoryObj } from '@storybook/react';
import axios from 'axios';
import i18n from 'i18next';

import { ClaudeAccessSection } from 'components/settings/claude-access';
import { NotificationProvider } from 'contexts/NotificationContext';
import en from 'locales/en.json';

const storyI18n = i18n.createInstance();
storyI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const CLAUDE_CONNECTION = {
  id: 'token-9',
  kind: 'oauth',
  name: 'Claude (claude.ai)',
  tokenPrefix: 'bm_oat_zzzzz',
  scopes: ['mail:read', 'mail:send'],
  expiresAt: '2026-12-04T00:00:00Z',
  lastUsedAt: '2026-11-05T00:00:00Z',
  createdAt: '2026-11-04T00:00:00Z',
};

const PERSONAL_TOKEN = {
  id: 'token-1',
  kind: 'personal',
  name: 'Cursor',
  tokenPrefix: 'bm_pat_abcde',
  scopes: ['mail:read'],
  expiresAt: '2027-02-01T00:00:00Z',
  lastUsedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
};

function withTokens(tokens: unknown[]): Decorator {
  return Story => {
    axios.get = (async () => ({ data: tokens })) as typeof axios.get;
    return (
      <I18nextProvider i18n={storyI18n}>
        <NotificationProvider>
          <div style={{ maxWidth: 760, padding: 24 }}>
            <Story />
          </div>
        </NotificationProvider>
      </I18nextProvider>
    );
  };
}

const meta: Meta = { title: 'Settings/Connect Claude', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

export const FirstTime: Story = {
  name: 'Claude connected, no tokens',
  decorators: [withTokens([CLAUDE_CONNECTION])],
  render: () => <ClaudeAccessSection />,
};

export const WithTokens: Story = {
  name: 'Also uses an access token',
  decorators: [withTokens([CLAUDE_CONNECTION, PERSONAL_TOKEN])],
  render: () => <ClaudeAccessSection />,
};
