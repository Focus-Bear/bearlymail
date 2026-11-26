/**
 * The inbox unsubscribe flow's last step: offering to archive the sender's mail,
 * which also blocks the sender's address. Static flow; no API calls.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { UnsubscribeDialogs } from 'components/inbox/actions/UnsubscribeDialogs';
import { UNSUBSCRIBE_OUTCOMES } from 'constants/unsubscribe';
import { UNSUBSCRIBE_FLOW_STEPS, UnsubscribeFlow } from 'hooks/useUnsubscribeFlow';

const noop = () => undefined;
const noopAsync = async () => undefined;
const SIBLING_COUNT = 3;

const offerFlow = (siblingCount: number | null): UnsubscribeFlow => ({
  action: null,
  step: { kind: UNSUBSCRIBE_FLOW_STEPS.OFFER_ARCHIVE, outcome: UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED, siblingCount },
  senderName: 'Xero',
  senderAddress: 'messaging-service@post.xero.com',
  start: noop,
  confirm: noopAsync,
  openFallbackLink: noop,
  archiveSender: noopAsync,
  dismiss: noop,
});

const meta: Meta = {
  title: 'Inbox/Unsubscribe archive offer',
  decorators: [
    Story => {
      // The dialog is portalled to <body>, outside any wrapper that sets the app font.
      document.body.style.fontFamily = theme.typography.fontFamily;
      return (
        <I18nextProvider i18n={i18n}>
          <Story />
        </I18nextProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj;

export const WithOtherEmails: Story = { render: () => <UnsubscribeDialogs flow={offerFlow(SIBLING_COUNT)} /> };

export const ThisEmailOnly: Story = { render: () => <UnsubscribeDialogs flow={offerFlow(null)} /> };
