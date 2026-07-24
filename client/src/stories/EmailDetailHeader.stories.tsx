/**
 * EmailDetailHeader stories — uses EmailDetailHeaderView (presentational) with the
 * SAME shared inbox-list PriorityBadge injected as the priority chip.
 *
 * Covers the chip label states (score / unresolved / calculating) and the chip's
 * click-popup opened (the shared PriorityTooltipContent: score, category,
 * "Categorised by", score breakdown, total, "Correct prioritisation").
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
  name: 'Priority chip (score)',
  args: { hasPriorityData: true },
};

export const PopupOpen: Story = {
  name: 'Chip clicked — shared priority popup open',
  args: { hasPriorityData: true, popupOpen: true },
};

export const NotPrioritised: Story = {
  name: 'Chip — not prioritised (unresolved)',
  args: { hasPriorityData: false, emailOverrides: { priorityScore: null, isProcessingPriority: false } },
};

export const Calculating: Story = {
  name: 'Chip — calculating',
  args: { hasPriorityData: false, emailOverrides: { priorityScore: null, isProcessingPriority: true } },
};
