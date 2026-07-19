/**
 * EmailListItem stories — uses EmailListItemView (presentational).
 * No Redux store needed — animation state is passed directly as props (issue #1219).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { DRAFTED_FOLLOWUP_DATA, EMPTY_FOLLOWUP_DATA, ItemDemo } from './storyHelpers/EmailListItemDemo';

const meta: Meta<typeof ItemDemo> = {
  title: 'Inbox/EmailListItem',
  component: ItemDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ItemDemo>;

export const Default: Story = { name: 'Default', args: {} };
export const Selected: Story = { name: 'Selected', args: { isSelected: true } };
export const AnimatingArchive: Story = {
  name: 'Animating — archive',
  args: { animating: 'archive' },
};
export const AnimatingPriority: Story = {
  name: 'Animating — priority',
  args: { animating: 'priority' },
};

// Follow-up mode, narrow (split-view) width — reproduces the reported issues:
// the empty draft box, and the snooze/archive actions wrapping to a new line.
export const FollowUpNoDraft: Story = {
  name: 'Follow-up — no draft (narrow)',
  args: { mode: 'follow-up', followUpData: EMPTY_FOLLOWUP_DATA, maxWidth: 520 },
};
export const FollowUpWithDraft: Story = {
  name: 'Follow-up — with draft (narrow)',
  args: { mode: 'follow-up', followUpData: DRAFTED_FOLLOWUP_DATA, maxWidth: 520 },
};
