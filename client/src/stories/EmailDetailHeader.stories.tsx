/**
 * EmailDetailHeader stories — uses EmailDetailHeaderView (presentational).
 * No auth, router, or notification context needed (issue #1219).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { HeaderDemo } from './storyHelpers/EmailDetailHeaderDemo';

const meta: Meta<typeof HeaderDemo> = {
  title: 'Email Detail/EmailDetailHeader',
  component: HeaderDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof HeaderDemo>;

export const Default: Story = {
  name: 'Default',
  args: {},
};

export const WithPriorityData: Story = {
  name: 'With priority data (click score to see)',
  args: { hasPriorityData: true },
};

export const PriorityExplanationOpen: Story = {
  name: 'Priority explanation open',
  args: { hasPriorityData: true, showPriorityExplanation: true },
};

export const EmailCopied: Story = {
  name: 'Email address copied state',
  args: { emailCopied: true },
};
