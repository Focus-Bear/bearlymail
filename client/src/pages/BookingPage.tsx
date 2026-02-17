import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BOOKING_STATUS_SUCCESS } from 'constants/strings';
import { DAYS_IN_MONTH_30 } from 'constants/numbers';
import axios from 'axios';
import { theme } from 'theme/theme';
import { BookingLoadingState } from 'components/booking/BookingLoadingState';
import { BookingSuccessState } from 'components/booking/BookingSuccessState';
import { SlotSelection } from 'components/booking/SlotSelection';
import { BookingForm } from 'components/booking/BookingForm';

import { API_URL } from 'config/api';

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

const BookingPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [timezone, setTimezone] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [daysAhead, setDaysAhead] = useState(DAYS_IN_MONTH_30);
  const [bookingStatus, setBookingStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const fetchSlots = async (days: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const response = await axios.get(`${API_URL}/public/calendar/${userId}/slots?daysAhead=${days}`);

      if (append) {
        setSlots(response.data.slots);
      } else {
        setSlots(response.data.slots);
      }
      setTimezone(response.data.timezone);
    } catch (error) {
      console.error('Error fetching slots:', error);
      setError(t('booking.failedToLoad'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchSlots(daysAhead);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleLoadMore = () => {
    const newDaysAhead = daysAhead + DAYS_IN_MONTH_30;
    setDaysAhead(newDaysAhead);
    fetchSlots(newDaysAhead, true);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !guestEmail || !userId) return;

    setBookingStatus('submitting');
    try {
      await axios.post(`${API_URL}/public/calendar/${userId}/book`, {
        startTime: selectedSlot.start,
        guestEmail,
        guestName,
        duration: selectedSlot.duration,
      });
      setBookingStatus('success');
    } catch (error) {
      console.error('Error booking slot:', error);
      setBookingStatus('error');
      setError(t('booking.failedToBook'));
    }
  };

  if (loading) {
    return <BookingLoadingState />;
  }

  if (bookingStatus === BOOKING_STATUS_SUCCESS) {
    return <BookingSuccessState guestEmail={guestEmail} />;
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
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>{t('booking.title')}</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: 0.9 }}>{t('booking.subtitle')}</p>
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

          <div style={{ display: 'flex', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
            <SlotSelection
              slots={slots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              timezone={timezone}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              hasMore
            />
            <BookingForm
              selectedSlot={selectedSlot}
              guestEmail={guestEmail}
              guestName={guestName}
              bookingStatus={bookingStatus}
              onGuestEmailChange={setGuestEmail}
              onGuestNameChange={setGuestName}
              onSubmit={handleBook}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;

