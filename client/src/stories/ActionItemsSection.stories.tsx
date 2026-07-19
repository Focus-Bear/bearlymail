/**
 * ActionItemsSection stories — uses the real ActionItemsSection component.
 * Previously used an inlined fake; updated to import the real component (issue #1219).
 *
 * captureEvent (PostHog) is a no-op in Storybook — the real component calls it
 * but it simply resolves without sending any data since VITE_POSTHOG_KEY is unset.
 */
import type { Meta, StoryObj } from '@storybook/react';

import { ActionItem, ActionItemsDemo } from './storyHelpers/ActionItemsDemo';

const SAMPLE: ActionItem[] = [
  { id: '1', description: 'Confirm catering arrangements by Thursday', isCompleted: false, source: 'llm' },
  { id: '2', description: 'Get final sign-off from finance team', isCompleted: true, source: 'llm' },
  { id: '3', description: 'Assign three team members to registration duties', isCompleted: false, source: 'user' },
  { id: '4', description: 'Send calendar invites to all attendees', isCompleted: false, source: 'llm' },
];

const meta: Meta<typeof ActionItemsDemo> = {
  title: 'Email Detail/ActionItemsSection',
  component: ActionItemsDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ActionItemsDemo>;

export const Empty: Story = { args: { initialItems: [] } };
export const WithItems: Story = { args: { initialItems: SAMPLE } };
export const AllCompleted: Story = {
  args: { initialItems: SAMPLE.map(i => ({ ...i, isCompleted: true })) },
};
export const Extracting: Story = { args: { loading: true } };
