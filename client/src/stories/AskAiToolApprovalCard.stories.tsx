/**
 * Ask AI approval card — shown when the assistant wants to use a connected tool
 * that is not read-only. Rendered inside a sidebar-width column so the layout
 * matches the Ask AI tab.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { AskAiToolApprovalCard } from 'components/inbox/AskAiToolApprovalCard';

const SIDEBAR_WIDTH_PX = 380;
const noop = () => undefined;

const meta: Meta<typeof AskAiToolApprovalCard> = {
  title: 'Inbox/AskAiToolApprovalCard',
  component: AskAiToolApprovalCard,
  args: {
    onDecide: noop,
    pendingToolCall: {
      approvalId: 'approval-1',
      serverName: 'Google Drive',
      toolName: 'share_file',
      toolTitle: 'Share file',
      arguments: { fileId: '1AbCdEf-q3-board-deck', email: 'sam@example.com', role: 'writer' },
      argumentsHash: 'a'.repeat(64),
      expiresAt: '2026-11-13T10:00:00.000Z',
    },
  },
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <div
          style={{
            maxWidth: SIDEBAR_WIDTH_PX,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.default,
            fontFamily: theme.typography.fontFamily,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AskAiToolApprovalCard>;

export const ShareFile: Story = {};

export const NoArguments: Story = {
  args: {
    pendingToolCall: {
      approvalId: 'approval-2',
      serverName: 'Acme CRM',
      toolName: 'refresh_contacts',
      arguments: {},
      argumentsHash: 'b'.repeat(64),
      expiresAt: '2026-11-13T10:00:00.000Z',
    },
  },
};
