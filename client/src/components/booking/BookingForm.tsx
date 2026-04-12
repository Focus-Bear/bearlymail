import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';

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

const AGENDA_MAX_LENGTH = 500;

interface BookingFormProps {
  selectedSlot: TimeSlot | null;
  guestEmail: string;
  guestName: string;
  agenda: string;
  bookingStatus: 'idle' | 'submitting' | 'success' | 'error';
  onGuestEmailChange: (email: string) => void;
  onGuestNameChange: (name: string) => void;
  onAgendaChange: (agenda: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  additionalGuests: string[];
  onAddGuest: (email: string) => void;
  onRemoveGuest: (email: string) => void;
  maxAdditionalGuests: number;
}

interface BookingFormFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  containerStyle?: React.CSSProperties;
  inputId?: string;
}

const BookingFormField: React.FC<BookingFormFieldProps> = ({
  label,
  type,
  value,
  onChange,
  containerStyle,
  inputId,
}) => (
  <div style={containerStyle}>
    <label htmlFor={inputId} style={labelStyle}>
      {label}
    </label>
    <input
      id={inputId}
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      required
      style={inputStyle}
    />
  </div>
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const BookingForm: React.FC<BookingFormProps> = ({
  selectedSlot,
  guestEmail,
  guestName,
  agenda,
  bookingStatus,
  onGuestEmailChange,
  onGuestNameChange,
  onAgendaChange,
  onSubmit,
  additionalGuests,
  onAddGuest,
  onRemoveGuest,
  maxAdditionalGuests,
}) => {
  const { t } = useTranslation();
  const [guestInputValue, setGuestInputValue] = useState('');
  const [guestInputError, setGuestInputError] = useState('');

  const handleAddGuest = () => {
    const trimmed = guestInputValue.trim();

    if (!EMAIL_REGEX.test(trimmed)) {
      setGuestInputError(t('booking.guests.invalidEmail'));
      return;
    }

    if (additionalGuests.some(guest => guest.toLowerCase() === trimmed.toLowerCase())) {
      setGuestInputError(t('booking.guests.duplicateEmail'));
      return;
    }

    onAddGuest(trimmed);
    setGuestInputValue('');
    setGuestInputError('');
  };

  const handleGuestInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      handleAddGuest();
    }
  };

  const isAtCap = additionalGuests.length >= maxAdditionalGuests;

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

        <div style={{ marginBottom: theme.spacing.lg }}>
          <p
            style={{
              ...labelStyle,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('booking.guests.sectionTitle')}
          </p>

          {additionalGuests.map(email => (
            <div
              key={email}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                marginBottom: theme.spacing.xs,
                backgroundColor: theme.colors.background.default,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              <span style={{ color: theme.colors.text.primary }}>• {email}</span>
              <button
                type="button"
                onClick={() => onRemoveGuest(email)}
                aria-label={t('booking.guests.removeGuest', { email })}
                style={{
                  background: STRING_NONE,
                  border: STRING_NONE,
                  cursor: 'pointer',
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.base,
                  lineHeight: 1,
                  padding: `0 ${theme.spacing.xs}`,
                }}
              >
                ×
              </button>
            </div>
          ))}

          {isAtCap ? (
            <p
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                marginTop: theme.spacing.xs,
              }}
            >
              {t('booking.guests.maxReached', { max: maxAdditionalGuests })}
            </p>
          ) : (
            <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="additional-guest-input" style={labelStyle}>
                  {t('booking.guests.inputLabel')}
                </label>
                <input
                  id="additional-guest-input"
                  type="email"
                  value={guestInputValue}
                  onChange={event => {
                    setGuestInputValue(event.target.value);
                    setGuestInputError('');
                  }}
                  onKeyDown={handleGuestInputKeyDown}
                  placeholder={t('booking.guests.inputPlaceholder')}
                  style={inputStyle}
                />
                {guestInputError && (
                  <p
                    style={{
                      color: theme.colors.accent.error,
                      fontSize: theme.typography.fontSize.sm,
                      marginTop: theme.spacing.xs,
                    }}
                  >
                    {guestInputError}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: guestInputError ? '1.5rem' : 0 }}>
                <button
                  type="button"
                  onClick={handleAddGuest}
                  style={{
                    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    backgroundColor: theme.colors.primary.main,
                    color: COLOR_NAMED_WHITE,
                    border: STRING_NONE,
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontSize: theme.typography.fontSize.sm,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('booking.guests.addButton')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: theme.spacing.lg }}>
          <label htmlFor="booking-agenda" style={labelStyle}>
            {t('booking.agenda.label')}
          </label>
          <textarea
            id="booking-agenda"
            value={agenda}
            onChange={event => onAgendaChange(event.target.value)}
            maxLength={AGENDA_MAX_LENGTH}
            placeholder={t('booking.agenda.placeholder')}
            rows={4}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <p
            style={{
              textAlign: 'right',
              fontSize: theme.typography.fontSize.sm,
              color: agenda.length >= AGENDA_MAX_LENGTH ? theme.colors.accent.error : theme.colors.text.secondary,
              marginTop: theme.spacing.xs,
            }}
          >
            {agenda.length}/{AGENDA_MAX_LENGTH}
          </p>
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
