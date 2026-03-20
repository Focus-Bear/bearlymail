/**
 * ReplyComposerFooter stories — uses the real ReplyComposerFooter component.
 * Previously used an inlined fake; updated to import the real component (issue #1219).
 *
 * captureEvent (PostHog) events are no-ops in Storybook since VITE_POSTHOG_KEY is unset.
 */
import type { Meta, StoryObj } from '@storybook/react';

import { ReplyComposerDemo } from './storyHelpers/ReplyComposerDemo';

const meta: Meta<typeof ReplyComposerDemo> = {
  title: 'EmailDetail/ReplyComposerFooter',
  component: ReplyComposerDemo,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Footer of the reply composer. Layout (top to bottom): (1) Expected-reply selector row, (2) "I still need to take action" checkbox row, (3) Cancel / Send / Schedule button row.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof ReplyComposerDemo>;

export const Default: Story = {
  name: 'Default',
  args: { draft: 'Hello, just following up…' },
};

export const NoDraft: Story = {
  name: 'Disabled (No Draft)',
  args: { draft: null },
};

export const SendingInProgress: Story = {
  name: 'Sending In Progress',
  args: { draft: 'Hello…', sending: true },
};

export const CheckingToneStory: Story = {
  name: 'Checking Tone',
  args: { draft: 'Hello…', checkingTone: true },
};

export const WithScheduledSend: Story = {
  name: 'Scheduled Send',
  args: {
    draft: 'Hello, just following up…',
    scheduledSendAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  },
};
