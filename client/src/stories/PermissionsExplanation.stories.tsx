/**
 * PermissionsExplanation — shown before the OAuth redirect. Explains each
 * scope the server requests in plain language and requires a 5-second
 * press-and-hold to continue. Uses the REAL PermissionsExplanation component.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { PermissionsExplanation } from 'components/auth/PermissionsExplanation';
import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';

const meta: Meta<typeof PermissionsExplanation> = {
  title: 'Auth/PermissionsExplanation',
  component: PermissionsExplanation,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal shown before the OAuth consent screen. Lists every requested scope with a plain-language reason, ' +
          'tells Google users to keep every box ticked and choose ongoing access, and makes the user press and hold ' +
          'the continue button for 5 seconds (keyboard: hold Space/Enter).',
      },
    },
  },
  args: {
    onContinue: () => console.log('[PermissionsExplanation] onContinue fired'),
    onCancel: () => console.log('[PermissionsExplanation] onCancel fired'),
  },
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PermissionsExplanation>;

export const Google: Story = { args: { provider: PROVIDER_GOOGLE } };

export const Microsoft: Story = { args: { provider: PROVIDER_MICROSOFT } };

export const Zoho: Story = { args: { provider: PROVIDER_ZOHO } };
