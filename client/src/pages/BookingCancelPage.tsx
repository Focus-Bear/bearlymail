import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { BookingLoadingState } from 'components/booking/BookingLoadingState';
import { API_URL } from 'config/api';
import { EMOJI_CHECK } from 'constants/emojis';
import {
  MAX_WIDTH_500_PX,
  MAX_WIDTH_600_PX,
  OPACITY_90_PERCENT,
  OPACITY_DISABLED_ALT,
  OPACITY_FULL,
  WIDTH_FULL_PX,
} from 'constants/numbers';
import {
  BOOKING_ERROR,
  BOOKING_IDLE,
  BOOKING_STATUS_CANCELLED,
  BOOKING_STATUS_SUCCESS,
  BOOKING_SUBMITTING,
  BOOKING_SUCCESS,
  STRING_2_DIGIT,
  STRING_AUTO,
  STRING_CENTER,
  STRING_HIDDEN,
  STRING_LONG,
  STRING_NONE,
  STRING_NOT_ALLOWED,
  STRING_NUMERIC,
  STRING_POINTER,
  STRING_WHITE,
} from 'constants/strings';

interface BookingData {
  id: string;
  userId: string;
  guestEmail: string;
  guestName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  title: string;
  status: string;
}

const BookingCancelSuccess: React.FC<{ t: (key: string) => string }> = ({ t }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: STRING_CENTER,
      alignItems: STRING_CENTER,
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      fontFamily: theme.typography.fontFamily,
    }}
  >
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        textAlign: STRING_CENTER,
        maxWidth: `${MAX_WIDTH_500_PX}px`,
      }}
    >
      <div
        style={{
          color: theme.colors.accent.success,
          fontSize: theme.typography.fontSize['3xl'],
          marginBottom: theme.spacing.lg,
        }}
      >
        {EMOJI_CHECK}
      </div>
      <h1 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md }}>
        {t('booking.cancel.success')}
      </h1>
      <p style={{ color: theme.colors.text.secondary }}>{t('booking.cancel.successMessage')}</p>
    </div>
  </div>
);

interface BookingCancelDetailsProps {
  booking: BookingData;
  t: (key: string) => string;
}

const BookingCancelDetails: React.FC<BookingCancelDetailsProps> = ({ booking, t }) => (
  <div
    style={{
      backgroundColor: `${theme.colors.accent.error}10`,
      padding: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
      marginBottom: theme.spacing.lg,
      border: `1px solid ${theme.colors.accent.error}30`,
    }}
  >
    <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
      {t('booking.cancel.bookingDetails')}
    </p>
    <p
      style={{
        margin: `${theme.spacing.sm} 0 0`,
        color: theme.colors.text.primary,
        fontWeight: theme.typography.fontWeight.medium,
        fontSize: theme.typography.fontSize.lg,
      }}
    >
      {new Date(booking.startTime).toLocaleDateString(undefined, {
        weekday: STRING_LONG,
        month: STRING_LONG,
        day: STRING_NUMERIC,
        year: STRING_NUMERIC,
      })}
    </p>
    <p style={{ margin: `${theme.spacing.xs} 0 0`, color: theme.colors.text.primary }}>
      {new Date(booking.startTime).toLocaleTimeString(undefined, { hour: STRING_2_DIGIT, minute: STRING_2_DIGIT })}
      {' - '}
      {new Date(booking.endTime).toLocaleTimeString(undefined, { hour: STRING_2_DIGIT, minute: STRING_2_DIGIT })}
    </p>
    {booking.title && (
      <p style={{ margin: `${theme.spacing.sm} 0 0`, color: theme.colors.text.secondary }}>{booking.title}</p>
    )}
  </div>
);

const BookingCancelPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    typeof BOOKING_IDLE | typeof BOOKING_SUBMITTING | typeof BOOKING_SUCCESS | typeof BOOKING_ERROR
  >(BOOKING_IDLE);
  const [error, setError] = useState('');

  const fetchBooking = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/public/calendar/booking/${token}`);
      setBooking(response.data);
    } catch {
      setError(t('booking.cancel.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (token) {
      fetchBooking();
    }
  }, [token, fetchBooking]);

  const handleCancel = async () => {
    if (!token) {
      return;
    }
    setStatus(BOOKING_SUBMITTING);
    try {
      await axios.post(`${API_URL}/public/calendar/booking/${token}/cancel`);
      setStatus(BOOKING_SUCCESS);
    } catch {
      setStatus(BOOKING_ERROR);
      setError(t('booking.cancel.failedToCancel'));
    }
  };

  if (loading) {
    return <BookingLoadingState />;
  }

  if (status === BOOKING_STATUS_SUCCESS) {
    return <BookingCancelSuccess t={t} />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          maxWidth: `${MAX_WIDTH_600_PX}px`,
          margin: STRING_AUTO,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          overflow: STRING_HIDDEN,
        }}
      >
        <div style={{ padding: theme.spacing.xl, backgroundColor: theme.colors.accent.error, color: STRING_WHITE }}>
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>{t('booking.cancel.title')}</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: OPACITY_90_PERCENT }}>{t('booking.cancel.subtitle')}</p>
        </div>

        <div style={{ padding: theme.spacing.xl }}>
          {error && (
            <div
              style={{
                backgroundColor: `${theme.colors.accent.error}20`,
                color: theme.colors.accent.error,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.lg,
              }}
            >
              {error}
            </div>
          )}

          {booking && booking.status === BOOKING_STATUS_CANCELLED && (
            <div style={{ textAlign: STRING_CENTER, padding: theme.spacing.xl, color: theme.colors.text.secondary }}>
              <p>{t('booking.cancel.alreadyCancelled')}</p>
            </div>
          )}

          {booking && booking.status !== BOOKING_STATUS_CANCELLED && (
            <>
              <BookingCancelDetails booking={booking} t={t} />
              <p
                style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg, textAlign: STRING_CENTER }}
              >
                {t('booking.cancel.confirmMessage')}
              </p>
              <button
                onClick={handleCancel}
                disabled={status === BOOKING_SUBMITTING}
                style={{
                  width: WIDTH_FULL_PX,
                  padding: theme.spacing.lg,
                  backgroundColor: theme.colors.accent.error,
                  color: STRING_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  cursor: status === BOOKING_SUBMITTING ? STRING_NOT_ALLOWED : STRING_POINTER,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  opacity: status === BOOKING_SUBMITTING ? OPACITY_DISABLED_ALT : OPACITY_FULL,
                }}
              >
                {status === BOOKING_SUBMITTING ? t('booking.cancel.cancelling') : t('booking.cancel.confirmCancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingCancelPage;
