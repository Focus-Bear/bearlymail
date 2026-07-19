/**
 * EmailActionsRow stories — verify the Snooze/Archive/⋮ actions stay on the same
 * row as the PRIORITY pills at every card width. Narrow cards (split view,
 * ~510px) hide the button text labels via the `email-actions` container query in
 * App.css (imported here because Storybook's preview doesn't load App.tsx);
 * wide cards keep the labels. Uses the full EmailListItemView demo so the row
 * renders in its real card context.
 */
import 'App.css';

import type { Meta, StoryObj } from '@storybook/react';

import { EMPTY_FOLLOWUP_DATA, ItemDemo } from './storyHelpers/EmailListItemDemo';

const meta: Meta<typeof ItemDemo> = {
  title: 'Inbox/EmailActionsRow',
  component: ItemDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ItemDemo>;

export const NarrowSplitView: Story = {
  name: 'Narrow (~500px) — icon-only actions, one row',
  args: { maxWidth: 500 },
};

// Reproduces the reported prod follow-up card: the actions row measured ~604px
// wide, where the labelled buttons (~628px needed) used to wrap below the pills.
export const ProdFollowUpWidth: Story = {
  name: 'Prod follow-up (~604px row) — icon-only, one row',
  args: { maxWidth: 658, mode: 'follow-up', followUpData: EMPTY_FOLLOWUP_DATA },
};

export const Wide: Story = {
  name: 'Wide (~800px) — labelled actions, one row',
  args: { maxWidth: 800 },
};
