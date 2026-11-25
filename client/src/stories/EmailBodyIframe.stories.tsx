/**
 * EmailBodyIframe stories: how an email with remote images renders before and
 * after the reader chooses "Show images" (#548).
 */
import 'i18n';

import type { Meta, StoryObj } from '@storybook/react';

import { EmailBodyIframe } from 'components/email-detail/EmailBodyIframe';

const NEWSLETTER_HTML = `
  <h2>Your weekly digest</h2>
  <p>Here is what happened this week in your projects.</p>
  <img src="https://images.example.com/banner.png" alt="Weekly banner" width="560" height="120">
  <p>Thanks for reading!</p>
  <img src="https://tracker.example.com/open.gif?u=123" width="1" height="1" alt="">
`;

const PLAIN_HTML = '<p>Hi! Are we still on for Thursday at 3pm?</p><p>Thanks,<br>Sam</p>';

const meta: Meta<typeof EmailBodyIframe> = {
  title: 'Email Detail/EmailBodyIframe',
  component: EmailBodyIframe,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof EmailBodyIframe>;

export const RemoteImagesBlocked: Story = { args: { html: NEWSLETTER_HTML } };
export const NoRemoteContent: Story = { args: { html: PLAIN_HTML } };
