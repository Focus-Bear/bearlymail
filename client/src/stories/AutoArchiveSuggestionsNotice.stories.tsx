/**
 * Inbox notice that points the user at pending auto-archive suggestions, which
 * otherwise only appear under Settings > Workflows. Shown with one and several
 * suggestions to check the pluralised copy.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { AutoArchiveSuggestionsBanner } from 'components/inbox/auto-archive-notice/AutoArchiveSuggestionsBanner';

const noop = () => undefined;

const INBOX_COLUMN_MAX_WIDTH = 960;

const inboxColumnStyle: React.CSSProperties = {
  maxWidth: INBOX_COLUMN_MAX_WIDTH,
  backgroundColor: theme.colors.background.default,
  paddingBottom: theme.spacing.sm,
};

const meta: Meta<typeof AutoArchiveSuggestionsBanner> = {
  title: 'Inbox/AutoArchiveSuggestionsNotice',
  component: AutoArchiveSuggestionsBanner,
  args: { onReview: noop, onDismiss: noop },
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <div style={inboxColumnStyle}>
            <Story />
          </div>
        </MemoryRouter>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AutoArchiveSuggestionsBanner>;

export const SeveralSuggestions: Story = {
  args: { pendingCount: 3 },
};

export const OneSuggestion: Story = {
  args: { pendingCount: 1 },
};
