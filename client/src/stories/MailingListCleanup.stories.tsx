/**
 * Settings → Subscriptions (issue #481): the mailing-list table, the confirm
 * step that lists who gets an unsubscribe email, and the result with the
 * websites left to finish on. Static data; the section itself fetches from
 * `GET /mailing-lists`.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { CleanupConfirmPanel } from 'components/settings/email-delivery/subscriptions/CleanupConfirmPanel';
import { CleanupResultPanel } from 'components/settings/email-delivery/subscriptions/CleanupResultPanel';
import { MailingList } from 'components/settings/email-delivery/subscriptions/mailingLists.api';
import { MailingListTable } from 'components/settings/email-delivery/subscriptions/MailingListTable';
import { UNSUBSCRIBE_METHODS } from 'constants/unsubscribe';

const noop = () => undefined;
const SETTINGS_COLUMN_MAX_WIDTH = 760;

const LISTS: MailingList[] = [
  {
    emailId: 'a',
    name: 'Paragon',
    address: 'news@useparagon.com',
    emailCount: 24,
    triageThreadCount: 6,
    lastReceivedAt: '2026-11-23T09:00:00.000Z',
    perWeek: 2,
    method: UNSUBSCRIBE_METHODS.ONE_CLICK,
  },
  {
    emailId: 'b',
    name: 'Weekly Deals',
    address: 'deals@shop.example',
    emailCount: 13,
    triageThreadCount: 4,
    lastReceivedAt: '2026-11-22T09:00:00.000Z',
    perWeek: 1,
    method: UNSUBSCRIBE_METHODS.MAILTO,
  },
  {
    emailId: 'c',
    name: null,
    address: 'hello@designblog.example',
    emailCount: 5,
    triageThreadCount: 0,
    lastReceivedAt: '2026-11-18T09:00:00.000Z',
    perWeek: 0.4,
    method: UNSUBSCRIBE_METHODS.LINK,
  },
];

const InteractiveTable: React.FC = () => {
  const [selectedIds, setSelectedIds] = useState(new Set(['a', 'b']));
  const toggle = (emailId: string) =>
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  return (
    <MailingListTable
      lists={LISTS}
      selectedIds={selectedIds}
      selectedCount={selectedIds.size}
      isBusy={false}
      isConfirming={false}
      onToggle={toggle}
      onToggleAll={noop}
      onCleanUp={noop}
    />
  );
};

const meta: Meta = {
  title: 'Settings/Subscriptions',
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <div
          style={{
            maxWidth: SETTINGS_COLUMN_MAX_WIDTH,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.paper,
          }}
        >
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const MailingLists: Story = { render: () => <InteractiveTable /> };

export const Confirm: Story = {
  render: () => <CleanupConfirmPanel selected={LISTS} onConfirm={noop} onCancel={noop} />,
};

export const Result: Story = {
  render: () => (
    <CleanupResultPanel
      result={{
        unsubscribed: [LISTS[0], LISTS[1]],
        toFinish: [{ list: LISTS[2], url: 'https://designblog.example/unsubscribe' }],
        failed: [],
        archivedThreads: 10,
      }}
      onDismiss={noop}
    />
  ),
};
