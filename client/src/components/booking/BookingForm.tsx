import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const BOOKING_STATUS_SUBMITTING = 'submitting';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.md,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.sm,
};

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

interface BookingFormFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  containerStyle?: React.CSSProperties;
}

const BookingFormField: React.FC<BookingFormFieldProps> = ({ label, type, value, onChange, containerStyle }) => (
  <div style={containerStyle}>
    <label style={labelStyle}>{label}</label>
    <input
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      required
      style={inputStyle}
    />
  </div>
);

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
        <BookingFormField
          label={t('auth.name')}
          type="text"
          value={guestName}
          onChange={onGuestNameChange}
          containerStyle={{ marginBottom: theme.spacing.md }}
        />
        <BookingFormField
          label={t('auth.email')}
          type="email"
          value={guestEmail}
          onChange={onGuestEmailChange}
          containerStyle={{ marginBottom: theme.spacing.lg }}
        />

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
