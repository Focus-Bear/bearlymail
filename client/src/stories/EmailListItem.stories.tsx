/**
 * EmailListItem stories — uses EmailListItemView (presentational).
 * No Redux store needed — animation state is passed directly as props (issue #1219).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { ItemDemo } from './storyHelpers/EmailListItemDemo';

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
