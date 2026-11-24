/**
 * DateMismatchBanner stories — shown in the reply/compose composer when the draft
 * pairs a weekday with a date that falls on a different day. The send pauses
 * until the user fixes the date or holds to send anyway. The warning text is
 * produced server-side by `findWeekdayDateMismatch`.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { theme } from 'theme/theme';

import { DateMismatchBanner } from 'components/email-detail-inline/DateMismatchBanner';

const bannerI18n = i18n.createInstance();
bannerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.dateMismatchLabel': 'Date check:',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const BannerFrame: React.FC<{ dateMismatch: string }> = ({ dateMismatch }) => (
  <I18nextProvider i18n={bannerI18n}>
    <div
      style={{
        maxWidth: 560,
        padding: 24,
        backgroundColor: theme.colors.background.paper,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      <DateMismatchBanner dateMismatch={dateMismatch} />
    </div>
  </I18nextProvider>
);

const meta: Meta<typeof BannerFrame> = {
  title: 'EmailDetail/DateMismatchBanner',
  component: BannerFrame,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof BannerFrame>;

/** The motivating case: "Tuesday 7th December" when 7 December 2026 is a Monday. */
export const WeekdayDoesNotMatch: Story = {
  name: 'Weekday does not match the date',
  args: {
    dateMismatch:
      '"Tuesday 7th December" — 7 December 2026 is a Monday. Did you mean Monday 7 December or Tuesday 8 December?',
  },
};

/** A day that does not exist in that month. */
export const DayOutOfRange: Story = {
  name: 'Day does not exist in the month',
  args: {
    dateMismatch: '"Monday 31st November" — November 2026 only has 30 days.',
  },
};
