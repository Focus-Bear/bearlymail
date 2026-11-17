/**
 * MCPServerCard stories — a connected app in Settings → Connected Apps.
 *
 * Covers:
 * 1. Needs sign-in — an OAuth connection (e.g. Zoho Bigin) the user hasn't authorized yet
 * 2. Connected — authorized, tools discovered, test passed
 *
 * The server URL is always shown redacted to its origin because providers such
 * as Zoho embed the access key in the URL path.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { MCPServerCard } from 'components/settings/mcp/MCPServerCard';
import { MCPServerConfig } from 'components/settings/workflows/types';

const noop = () => undefined;

const zohoConnection: MCPServerConfig = {
  id: 'server-1',
  name: 'Zoho Bigin',
  serverUrlRedacted: 'https://example.zohomcp.com.au/…',
  hasApiKey: false,
  needsAuthorization: true,
  purpose: 'sender_context',
  authType: 'oauth',
  cachedTools: null,
  toolsCachedAt: null,
  enabled: true,
  createdAt: '2026-11-11T00:00:00Z',
};

const meta: Meta<typeof MCPServerCard> = {
  title: 'Settings/MCPServerCard',
  component: MCPServerCard,
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <div style={{ maxWidth: 1100 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
  args: {
    testing: false,
    onTest: noop,
    onRefresh: noop,
    onRemove: noop,
    onAuthorize: noop,
  },
};

export default meta;
type Story = StoryObj<typeof MCPServerCard>;

export const NeedsSignIn: Story = {
  args: { server: zohoConnection },
};

export const Connected: Story = {
  args: {
    server: {
      ...zohoConnection,
      needsAuthorization: false,
      cachedTools: Array.from({ length: 20 }, (_, index) => ({
        name: `tool_${index}`,
        description: '',
        inputSchema: {},
      })),
      toolsCachedAt: '2026-11-11T00:00:00Z',
    },
    testResult: { ok: true, toolCount: 20, needsAuthorization: false },
  },
};
