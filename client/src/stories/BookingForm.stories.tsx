/**
 * BookingForm — Agenda Textarea (Issue #1478)
 *
 * Uses the REAL BookingForm component from the codebase.
 * Demonstrates the new optional agenda/purpose textarea with live character
 * counter (turns red at the 500-char limit).
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { BookingForm } from 'components/booking/BookingForm';

// ---------------------------------------------------------------------------
// Controlled wrapper so state updates work in the story
// ---------------------------------------------------------------------------
const BookingFormWrapper = ({
  initialAgenda = '',
  bookingStatus = 'idle' as const,
  hasSlot = true,
}: {
  initialAgenda?: string;
  bookingStatus?: 'idle' | 'submitting' | 'success' | 'error';
  hasSlot?: boolean;
}) => {
  const [guestName, setGuestName] = useState('Jane Smith');
  const [guestEmail, setGuestEmail] = useState('jane@example.com');
  const [agenda, setAgenda] = useState(initialAgenda);
  const [additionalGuests, setAdditionalGuests] = useState<string[]>([]);

  const slot = hasSlot ? { start: '2026-04-01T10:00:00Z', end: '2026-04-01T10:30:00Z', duration: 30 } : null;

  return (
    <I18nextProvider i18n={i18n}>
      <div style={{ maxWidth: 480, padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <BookingForm
          selectedSlot={slot}
          guestEmail={guestEmail}
          guestName={guestName}
          agenda={agenda}
          bookingStatus={bookingStatus}
          onGuestEmailChange={setGuestEmail}
          onGuestNameChange={setGuestName}
          onAgendaChange={setAgenda}
          onSubmit={event => event.preventDefault()}
          additionalGuests={additionalGuests}
          onAddGuest={email => setAdditionalGuests(prev => [...prev, email])}
          onRemoveGuest={email => setAdditionalGuests(prev => prev.filter(guest => guest !== email))}
          maxAdditionalGuests={5}
        />
      </div>
    </I18nextProvider>
  );
};

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta = {
  title: 'Booking/BookingForm',
  parameters: {
    docs: {
      description: {
        component:
          'Booking form with the optional agenda/purpose textarea added in issue #1478. ' +
          'The textarea accepts up to 500 characters; the counter turns red when the limit is reached. ' +
          'Uses the REAL BookingForm component.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/**
 * Default state — empty agenda textarea, slot selected, form ready to submit.
 */
export const Default: Story = {
  render: () => <BookingFormWrapper />,
  name: 'Default (empty agenda)',
};

/**
 * Agenda pre-filled with a short purpose.
 */
export const WithAgenda: Story = {
  render: () => (
    <BookingFormWrapper initialAgenda="Discuss Q3 roadmap priorities and align on next steps for the email triage feature." />
  ),
  name: 'With agenda text',
};

/**
 * Counter turns red when agenda is at the 500-character limit.
 */
export const AgendaAtLimit: Story = {
  render: () => <BookingFormWrapper initialAgenda={'A'.repeat(500)} />,
  name: 'Agenda at character limit (counter red)',
};

/**
 * No time slot selected — submit button is disabled.
 */
export const NoSlotSelected: Story = {
  render: () => <BookingFormWrapper hasSlot={false} />,
  name: 'No slot selected (submit disabled)',
};

/**
 * Booking in progress — submit button shows loading text and is disabled.
 */
export const Submitting: Story = {
  render: () => <BookingFormWrapper bookingStatus="submitting" />,
  name: 'Submitting',
};
