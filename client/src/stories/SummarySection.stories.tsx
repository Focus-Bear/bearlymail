/**
 * SummarySection stories — uses the real SummarySection component.
 * Previously used an inlined fake; updated to import the real component (issue #1219).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { SummarySectionWrapper } from './storyHelpers/SummarySectionWrapper';

const SAMPLE_SUMMARY = `The sender is following up on last week's discussion about the Monash Grand Prix event. Key points:

• The event is scheduled for March 15th at the main campus
• They need confirmation of catering arrangements by Thursday
• The budget has been approved, pending final sign-off from finance
• Three team members need to be assigned to registration duties`;

const meta: Meta<typeof SummarySectionWrapper> = {
  title: 'Email Detail/SummarySection',
  component: SummarySectionWrapper,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof SummarySectionWrapper>;

export const WithSummary: Story = { args: { summary: SAMPLE_SUMMARY } };
export const Loading: Story = { args: { loading: true } };
export const ProcessingEmail: Story = { args: { processing: true } };
export const NoSummary: Story = { args: { summary: null } };
export const Collapsed: Story = { args: { summary: SAMPLE_SUMMARY, defaultCollapsed: true } };

// Narrow split-view width with the widest dropdown label ("Sender's Request")
// while generating — reproduces the header where the select used to overlap the
// title. The title should now truncate with an ellipsis instead.
export const NarrowLoading: Story = {
  name: 'Narrow — loading (sender request)',
  args: { loading: true, width: 300, initialSummaryType: 'sender-request' },
};
