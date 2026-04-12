/**
 * PermissionsExplanation — Issue #1485 / PR #1502
 *
 * Showcases the new 🛡️ callout box added to the Gmail permission item,
 * clarifying that BearlyMail only sends on the user's behalf when explicitly
 * asked. Uses the REAL PermissionsExplanation component.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { PermissionsExplanation } from 'components/auth/PermissionsExplanation';

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta<typeof PermissionsExplanation> = {
  title: 'Auth/PermissionsExplanation',
  component: PermissionsExplanation,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal shown before Google OAuth to explain why BearlyMail needs each permission. ' +
          'PR #1502 adds a 🛡️ callout box under the Gmail item clarifying that emails are ' +
          "only sent on the user's behalf when they explicitly compose or enable the AI autoresponder.",
      },
    },
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

// ---------------------------------------------------------------------------
// Default — shows the full modal with the new 🛡️ callout
// ---------------------------------------------------------------------------
/**
 * Default view of the permissions explanation modal.
 * The new 🛡️ callout box sits below the Gmail permission item and
 * reassures users that BearlyMail won't auto-send emails without consent.
 */
export const Default: Story = {
  args: {
    onContinue: () => alert('Continue clicked'),
    onCancel: () => alert('Cancel clicked'),
  },
  name: 'Default (with 🛡️ callout)',
};

// ---------------------------------------------------------------------------
// Interactive — handlers log to console
// ---------------------------------------------------------------------------
/**
 * Interactive version with console-logged callbacks.
 * Open the Actions panel to observe onContinue / onCancel events.
 */
export const Interactive: Story = {
  args: {
    onContinue: () => console.log('[PermissionsExplanation] onContinue fired'),
    onCancel: () => console.log('[PermissionsExplanation] onCancel fired'),
  },
  name: 'Interactive (console callbacks)',
};
