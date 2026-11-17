/**
 * EmailActionsRow stories — Snooze and Archive are labelled buttons on desktop
 * at every card width: narrow cards (split view, ~510px) wrap them onto their
 * own line below the PRIORITY pills rather than shrinking them to bare icons.
 * Only mobile hides the labels, via the `email-actions` container query in
 * App.css (imported here because Storybook's preview doesn't load App.tsx).
 * Uses the full EmailListItemView demo so the row renders in its real card
 * context.
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
  name: 'Narrow split view (~500px) — labelled buttons wrap below the pills',
  args: { maxWidth: 500 },
};

// The prod follow-up card: the actions row measured ~604px wide.
export const ProdFollowUpWidth: Story = {
  name: 'Prod follow-up (~604px row) — labelled buttons',
  args: { maxWidth: 658, mode: 'follow-up', followUpData: EMPTY_FOLLOWUP_DATA },
};

export const Wide: Story = {
  name: 'Wide (~800px) — labelled buttons, one row',
  args: { maxWidth: 800 },
};
