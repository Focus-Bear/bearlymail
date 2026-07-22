/**
 * CalendarConflictBanner stories — the non-blocking, advisory banner shown in the
 * reply/compose composer when the draft mentions a day for a meeting/call with the
 * recipient that doesn't line up with the user's calendar. Advisory only: the user
 * can fix the date or hold-to-send anyway. Stories pass mocked warning strings —
 * the real warning is produced server-side from a live Google Calendar.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { theme } from 'theme/theme';

import { CalendarConflictBanner } from 'components/email-detail-inline/CalendarConflictBanner';

const bannerI18n = i18n.createInstance();
bannerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.calendarConflictLabel': 'Calendar check:',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const BannerFrame: React.FC<{ calendarWarning: string }> = ({ calendarWarning }) => (
  <I18nextProvider i18n={bannerI18n}>
    <div
      style={{
        maxWidth: 560,
        padding: 24,
        backgroundColor: theme.colors.background.paper,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      <CalendarConflictBanner calendarWarning={calendarWarning} />
    </div>
  </I18nextProvider>
);

const meta: Meta<typeof BannerFrame> = {
  title: 'EmailDetail/CalendarConflictBanner',
  component: BannerFrame,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof BannerFrame>;

/**
 * The motivating case: the draft says "tomorrow", but the only event with the
 * person on the calendar is a week later — double-check the date before sending.
 */
export const DateMismatch: Story = {
  name: 'Stated day differs from the event',
  args: {
    calendarWarning:
      'You mention meeting Sarah Chen "talking tomorrow" (around Thu 23 Jul), but your calendar shows an event with them on Thu 30 Jul, not that day. Double-check the date before sending?',
  },
};

/**
 * The recipient has no event with the user on (or near) the stated day at all.
 */
export const NoMatchingEvent: Story = {
  name: 'No event with the person around then',
  args: {
    calendarWarning:
      'You mention meeting Sarah Chen "talking tomorrow" (around Thu 23 Jul), but there\'s no event with them on your calendar around then. Double-check the date before sending?',
  },
};

const MISMATCH_WARNING =
  'You mention meeting Sarah Chen "talking tomorrow" (around Thu 23 Jul), but your calendar shows an event with them on Thu 30 Jul, not that day. Double-check the date before sending?';
const NO_EVENT_WARNING =
  'You mention meeting Sarah Chen "talking tomorrow" (around Thu 23 Jul), but there\'s no event with them on your calendar around then. Double-check the date before sending?';

const BothCasesFrame: React.FC = () => (
  <I18nextProvider i18n={bannerI18n}>
    <div
      style={{
        maxWidth: 560,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        backgroundColor: theme.colors.background.paper,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 6 }}>
          Stated day differs from the calendar event
        </div>
        <CalendarConflictBanner calendarWarning={MISMATCH_WARNING} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 6 }}>
          No event with the person around then
        </div>
        <CalendarConflictBanner calendarWarning={NO_EVENT_WARNING} />
      </div>
    </div>
  </I18nextProvider>
);

/** Both advisory variants together, for the PR screenshot. */
export const BothCases: StoryObj<typeof BothCasesFrame> = {
  render: () => <BothCasesFrame />,
};
