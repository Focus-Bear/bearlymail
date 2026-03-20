/**
 * PrivateNotesSection stories — uses the real PrivateNotesSection component.
 * Previously used an inlined fake; updated to import the real component (issue #1219).
 *
 * captureEvent (PostHog) auto-save events are no-ops in Storybook since VITE_POSTHOG_KEY is unset.
 */
import type { Meta, StoryObj } from '@storybook/react';

import { PrivateNotesDemo } from './storyHelpers/PrivateNotesDemo';

const meta: Meta<typeof PrivateNotesDemo> = {
  title: 'Email Detail/PrivateNotesSection',
  component: PrivateNotesDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PrivateNotesDemo>;

export const Empty: Story = { args: { initialContent: '' } };
export const WithContent: Story = {
  args: {
    initialContent:
      'Follow up with Alice about the budget proposal. She mentioned the finance team needs the breakdown by end of week. Also check in with Bob re: catering headcount.',
  },
};
export const Collapsed: Story = {
  args: {
    initialContent: 'Follow up with Alice about the budget proposal.',
    defaultCollapsed: true,
  },
};
export const CollapsedEmpty: Story = { args: { defaultCollapsed: true } };
