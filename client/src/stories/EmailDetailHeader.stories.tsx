/**
 * EmailDetailHeader stories — uses EmailDetailHeaderView (presentational).
 * No auth, router, or notification context needed (issue #1219).
 *
 * The always-visible priority debug panel (score + breakdown + category) is the
 * focus of these stories, plus the unresolved / calculating debug states.
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
  name: 'Priority panel (score + breakdown)',
  args: { hasPriorityData: true },
};

export const BreakdownLoading: Story = {
  name: 'Score resolved, breakdown still loading',
  args: { hasPriorityData: false },
};

export const NotYetCalculated: Story = {
  name: 'Priority not yet calculated (unresolved)',
  args: { hasPriorityData: false, emailOverrides: { priorityScore: null, isProcessingPriority: false } },
};

export const Calculating: Story = {
  name: 'Priority calculating',
  args: { hasPriorityData: false, emailOverrides: { priorityScore: null, isProcessingPriority: true } },
};

export const EmailCopied: Story = {
  name: 'Email address copied state',
  args: { hasPriorityData: true, emailCopied: true },
};
