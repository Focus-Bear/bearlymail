/**
 * BookingErrorState — Issue #1465
 *
 * Uses the REAL BookingErrorState component from the codebase.
 * Demonstrates the generic error screen shown to guests when a calendar
 * booking link fails to load (expired token, no calendar connected, etc.).
 * No internal reason codes are exposed to the guest.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { BookingErrorState } from 'components/booking/BookingErrorState';

const meta: Meta<typeof BookingErrorState> = {
  title: 'Booking/BookingErrorState',
  component: BookingErrorState,
  parameters: {
    docs: {
      description: {
        component:
          'Generic error screen shown to guests when a calendar booking link is unavailable (e.g. expired auth token, calendar not connected, or user not found). Intentionally shows no internal reason codes — privacy fix for #1465.',
      },
    },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof BookingErrorState>;

/**
 * Default error state — shown to guests for any server-side failure.
 * All error variants (auth_expired, not_connected, user_not_found) render
 * the same generic message. Internal reason codes are never sent to the client.
 */
export const Default: Story = {
  render: () => (
    <I18nextProvider i18n={i18n}>
      <BookingErrorState />
    </I18nextProvider>
  ),
  name: 'Default (generic error — no internal reason codes)',
};
