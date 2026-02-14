import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { BookingLoadingState } from 'components/booking/BookingLoadingState';
import { SlotSelection } from 'components/booking/SlotSelection';
import { EMOJI_CHECK } from 'constants/emojis';
import { BOOKING_STATUS_SUCCESS, BOOKING_STATUS_SUBMITTING, BOOKING_STATUS_CANCELLED } from 'constants/strings';
import { API_URL } from 'config/api';

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

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

const BookingReschedulePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [timezone, setTimezone] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const fetchBookingAndSlots = useCallback(async () => {
    try {
      const bookingResponse = await axios.get(`${API_URL}/public/calendar/booking/${token}`);
      const bookingData = bookingResponse.data;
      setBooking(bookingData);

      if (bookingData.status === BOOKING_STATUS_CANCELLED) {
        setError(t('booking.reschedule.alreadyCancelled'));
        setLoading(false);
        return;
      }

      const slotsResponse = await axios.get(`${API_URL}/public/calendar/${bookingData.userId}/slots`);
      setSlots(slotsResponse.data.slots);
      setTimezone(slotsResponse.data.timezone);
    } catch {
      setError(t('booking.reschedule.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (token) {
      fetchBookingAndSlots();
    }
  }, [token, fetchBookingAndSlots]);

  const handleReschedule = async () => {
    if (!selectedSlot || !token) return;

    setStatus('submitting');
    try {
      await axios.post(`${API_URL}/public/calendar/booking/${token}/reschedule`, {
        newStartTime: selectedSlot.start,
      });
      setStatus('success');
    } catch {
      setStatus('error');
      setError(t('booking.reschedule.failedToReschedule'));
    }
  };

  if (loading) {
    return <BookingLoadingState />;
  }

  if (status === BOOKING_STATUS_SUCCESS) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
      }}>
        <div style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
          textAlign: 'center',
          maxWidth: '500px',
        }}>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <div style={{
            color: theme.colors.accent.success,
            fontSize: theme.typography.fontSize['3xl'],
            marginBottom: theme.spacing.lg,
          }}>{EMOJI_CHECK}</div>
          <h1 style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
          }}>{t('booking.reschedule.success')}</h1>
          <p style={{ color: theme.colors.text.secondary }}>
            {t('booking.reschedule.successMessage')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      fontFamily: theme.typography.fontFamily,
      padding: theme.spacing.xl,
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.primary.main,
          color: 'white',
        }}>
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>
            {t('booking.reschedule.title')}
          </h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: 0.9 }}>
            {t('booking.reschedule.subtitle')}
          </p>
        </div>

        <div style={{ padding: theme.spacing.xl }}>
          {error && (
            <div style={{
              backgroundColor: `${theme.colors.accent.error}20`,
              color: theme.colors.accent.error,
              padding: theme.spacing.md,
              borderRadius: theme.borderRadius.md,
              marginBottom: theme.spacing.lg,
            }}>
              {error}
            </div>
          )}

          {booking && booking.status !== BOOKING_STATUS_CANCELLED && (
            <>
              <div style={{
                backgroundColor: `${theme.colors.primary.main}10`,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.lg,
                border: `1px solid ${theme.colors.border.light}`,
              }}>
                <p style={{
                  margin: 0,
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                }}>
                  {t('booking.reschedule.currentTime')}
                </p>
                <p style={{
                  margin: `${theme.spacing.xs} 0 0`,
                  color: theme.colors.text.primary,
                  fontWeight: theme.typography.fontWeight.medium,
                }}>
                  {new Date(booking.startTime).toLocaleDateString(undefined, {
                    weekday: 'long', month: 'short', day: 'numeric',
                  })}{' '}
                  {new Date(booking.startTime).toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>

              <SlotSelection
                slots={slots}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
                timezone={timezone}
              />

              <button
                onClick={handleReschedule}
                disabled={!selectedSlot || status === BOOKING_STATUS_SUBMITTING}
                style={{
                  marginTop: theme.spacing.lg,
                  width: '100%',
                  padding: theme.spacing.lg,
                  backgroundColor: selectedSlot ? theme.colors.primary.main : theme.colors.border.dark,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: selectedSlot ? 'pointer' : 'not-allowed',
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {status === BOOKING_STATUS_SUBMITTING
                  ? t('booking.reschedule.rescheduling')
                  : t('booking.reschedule.confirmReschedule')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingReschedulePage;
