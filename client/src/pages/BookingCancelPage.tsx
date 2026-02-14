import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { BookingLoadingState } from 'components/booking/BookingLoadingState';
import { EMOJI_CHECK } from 'constants/emojis';
import { BOOKING_STATUS_SUCCESS, BOOKING_STATUS_SUBMITTING, BOOKING_STATUS_CANCELLED } from 'constants/strings';
import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';
import { API_URL } from 'config/api';

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

const BookingCancelPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
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
    if (!token) return;

    setStatus('submitting');
    try {
      await axios.post(`${API_URL}/public/calendar/booking/${token}/cancel`);
      setStatus('success');
    } catch {
      setStatus('error');
      setError(t('booking.cancel.failedToCancel'));
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
          }}>{t('booking.cancel.success')}</h1>
          <p style={{ color: theme.colors.text.secondary }}>
            {t('booking.cancel.successMessage')}
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
        maxWidth: '600px',
        margin: '0 auto',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.accent.error,
          color: 'white',
        }}>
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>
            {t('booking.cancel.title')}
          </h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: 0.9 }}>
            {t('booking.cancel.subtitle')}
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

          {booking && booking.status === BOOKING_STATUS_CANCELLED && (
            <div style={{
              textAlign: 'center',
              padding: theme.spacing.xl,
              color: theme.colors.text.secondary,
            }}>
              <p>{t('booking.cancel.alreadyCancelled')}</p>
            </div>
          )}

          {booking && booking.status !== BOOKING_STATUS_CANCELLED && (
            <>
              <div style={{
                backgroundColor: `${theme.colors.accent.error}10`,
                padding: theme.spacing.lg,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.lg,
                border: `1px solid ${theme.colors.accent.error}30`,
              }}>
                <p style={{
                  margin: 0,
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                }}>
                  {t('booking.cancel.bookingDetails')}
                </p>
                <p style={{
                  margin: `${theme.spacing.sm} 0 0`,
                  color: theme.colors.text.primary,
                  fontWeight: theme.typography.fontWeight.medium,
                  fontSize: theme.typography.fontSize.lg,
                }}>
                  {new Date(booking.startTime).toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <p style={{
                  margin: `${theme.spacing.xs} 0 0`,
                  color: theme.colors.text.primary,
                }}>
                  {new Date(booking.startTime).toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {' - '}
                  {new Date(booking.endTime).toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
                {booking.title && (
                  <p style={{
                    margin: `${theme.spacing.sm} 0 0`,
                    color: theme.colors.text.secondary,
                  }}>
                    {booking.title}
                  </p>
                )}
              </div>

              <p style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.lg,
                textAlign: 'center',
              }}>
                {t('booking.cancel.confirmMessage')}
              </p>

              <button
                onClick={handleCancel}
                disabled={status === BOOKING_STATUS_SUBMITTING}
                style={{
                  width: '100%',
                  padding: theme.spacing.lg,
                  backgroundColor: theme.colors.accent.error,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: status === BOOKING_STATUS_SUBMITTING ? 'not-allowed' : 'pointer',
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  opacity: status === BOOKING_STATUS_SUBMITTING ? OPACITY_DISABLED_ALT : OPACITY_FULL,
                }}
              >
                {status === BOOKING_STATUS_SUBMITTING
                  ? t('booking.cancel.cancelling')
                  : t('booking.cancel.confirmCancel')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingCancelPage;
