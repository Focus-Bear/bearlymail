import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const BOOKING_STATUS_SUBMITTING = 'submitting';

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

interface BookingFormProps {
  selectedSlot: TimeSlot | null;
  guestEmail: string;
  guestName: string;
  bookingStatus: 'idle' | 'submitting' | 'success' | 'error';
  onGuestEmailChange: (email: string) => void;
  onGuestNameChange: (name: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  selectedSlot,
  guestEmail,
  guestName,
  bookingStatus,
  onGuestEmailChange,
  onGuestNameChange,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ flex: 1, minWidth: '300px' }}>
      <h2
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('booking.yourDetails')}
      </h2>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label
            style={{
              display: 'block',
              marginBottom: theme.spacing.xs,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('auth.name')}
          </label>
          <input
            type="text"
            value={guestName}
            onChange={event => onGuestNameChange(event.target.value)}
            required
            style={{
              width: '100%',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
            }}
          />
        </div>

        <div style={{ marginBottom: theme.spacing.lg }}>
          <label
            style={{
              display: 'block',
              marginBottom: theme.spacing.xs,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('auth.email')}
          </label>
          <input
            type="email"
            value={guestEmail}
            onChange={event => onGuestEmailChange(event.target.value)}
            required
            style={{
              width: '100%',
              padding: theme.spacing.md,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!selectedSlot || bookingStatus === BOOKING_STATUS_SUBMITTING}
          style={{
            width: '100%',
            padding: theme.spacing.lg,
            backgroundColor: selectedSlot ? theme.colors.primary.main : theme.colors.border.dark,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: selectedSlot ? 'pointer' : 'not-allowed',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {bookingStatus === BOOKING_STATUS_SUBMITTING ? t('booking.booking') : t('booking.confirmBooking')}
        </button>

        {!selectedSlot && (
          <p
            style={{
              marginTop: theme.spacing.sm,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              textAlign: 'center',
            }}
          >
            {t('booking.selectSlotFirst')}
          </p>
        )}
      </form>
    </div>
  );
};
