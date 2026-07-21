/**
 * TimePicker.stories.tsx — Storybook stories for the "Schedule Email" modal.
 *
 * Renders the REAL TimePicker component. Two states worth screenshotting:
 *
 *   1. WithEarlyMorningOption — the conditional "Today 8:30am" quick option
 *      (shown only before the local 08:30 cutoff) sitting above the regular
 *      server-provided suggestions.
 *   2. CustomHumanTime — the natural-language custom input open, with a typed
 *      string ("tomorrow 9am") and its live "Sends tomorrow at …" preview.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { userEvent, within } from 'storybook/test';
import { buildEarlyMorningScheduleSuggestion } from 'utils/earlyMorningSuggestion';

import { TimePicker } from 'components/compose/TimePicker';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

const SERVER_SUGGESTIONS: TimeSuggestion[] = [
  { label: 'Tomorrow 8am', value: '2026-07-21T08:00:00', description: 'Start of the workday' },
  { label: 'This evening 6pm', value: '2026-07-20T18:00:00', description: 'After hours today' },
  { label: 'Tomorrow 9am', value: '2026-07-21T09:00:00', description: 'Mid-morning tomorrow' },
];

// Force the early-morning option to exist regardless of the wall clock so the
// story always demonstrates it.
const earlyMorning = buildEarlyMorningScheduleSuggestion(new Date(2026, 6, 20, 6, 0), (key, params) =>
  i18n.t(key, params)
);
const SUGGESTIONS_WITH_EARLY: TimeSuggestion[] = earlyMorning
  ? [earlyMorning, ...SERVER_SUGGESTIONS]
  : SERVER_SUGGESTIONS;

const TimePickerStory: React.FC<{ suggestions: TimeSuggestion[] }> = ({ suggestions }) => (
  <I18nextProvider i18n={i18n}>
    <TimePicker
      selectedTime={null}
      suggestions={suggestions}
      onTimeSelect={() => {}}
      onCancel={() => {}}
    />
  </I18nextProvider>
);

const meta: Meta<typeof TimePickerStory> = {
  title: 'Compose/TimePicker',
  component: TimePickerStory,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof TimePickerStory>;

export const WithEarlyMorningOption: Story = {
  name: 'Quick options — with "Today 8:30am"',
  args: { suggestions: SUGGESTIONS_WITH_EARLY },
};

export const CustomHumanTime: Story = {
  name: 'Custom time — type a human string',
  args: { suggestions: SERVER_SUGGESTIONS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Custom Time'));
    const input = await canvas.findByPlaceholderText(/tomorrow 9am/i);
    await userEvent.type(input, 'tomorrow 9am');
  },
};
