import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getAxiosResponseErrorMessage } from 'utils/axios-error-message';

import { BookingErrorState } from 'components/booking/BookingErrorState';
import { BookingForm } from 'components/booking/BookingForm';
import { BookingLoadingState } from 'components/booking/BookingLoadingState';
import { BookingSuccessState } from 'components/booking/BookingSuccessState';
import { SlotSelection } from 'components/booking/SlotSelection';
import { API_URL } from 'config/api';
import { MAX_WIDTH_600_PX, OPACITY_90_PERCENT } from 'constants/numbers';
import {
  BOOKING_ERROR,
  BOOKING_IDLE,
  BOOKING_STATUS_SUCCESS,
  BOOKING_SUBMITTING,
  BOOKING_SUCCESS,
  STRING_AUTO,
  STRING_HIDDEN,
  STRING_WHITE,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const MAX_ADDITIONAL_GUESTS = 10;

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

const INITIAL_SLOTS = 5;
const LOAD_MORE_SLOTS = 15;
const DAYS_AHEAD_INITIAL = 28;
const DAYS_AHEAD_LOAD_MORE = 90;

const BookingPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [timezone, setTimezone] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [agenda, setAgenda] = useState('');
  const [additionalGuests, setAdditionalGuests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [slotOffset, setSlotOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<
    typeof BOOKING_IDLE | typeof BOOKING_SUBMITTING | typeof BOOKING_SUCCESS | typeof BOOKING_ERROR
  >(BOOKING_IDLE);
  const [error, setError] = useState('');
  const [meetLink, setMeetLink] = useState<string | undefined>(undefined);

  const fetchSlots = useCallback(
    async (currentOffset: number, append = false) => {
      const currentLimit = append ? LOAD_MORE_SLOTS : INITIAL_SLOTS;
      const currentDaysAhead = append ? DAYS_AHEAD_LOAD_MORE : DAYS_AHEAD_INITIAL;
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        // withCredentials is set globally in config/api.ts; the HttpOnly JWT cookie
        // is sent automatically, so no manual Authorization header is needed.
        const response = await axios.get(
          `${API_URL}/public/calendar/${userId}/slots?daysAhead=${currentDaysAhead}&offset=${currentOffset}&limit=${currentLimit}`
        );

        if (append) {
          setSlots(prev => {
            const existingKeys = new Set(prev.map((slot: TimeSlot) => slot.start));
            const newSlots = (response.data.slots as TimeSlot[]).filter(slot => !existingKeys.has(slot.start));
            const merged = [...prev, ...newSlots];
            return merged.sort((slotA, slotB) => new Date(slotA.start).getTime() - new Date(slotB.start).getTime());
          });
        } else {
          setSlots(response.data.slots);
        }
        setTimezone(response.data.timezone);
        setHasMore(response.data.hasMore);
        setSlotOffset(currentOffset + currentLimit);
      } catch (error) {
        console.error('Error fetching slots:', error);
        const isHostView = Boolean(userId && user?.id && user.id === userId);
        const serverMessage = getAxiosResponseErrorMessage(error);
        if (isHostView) {
          setError(serverMessage ?? t('booking.error.ownerFallback'));
        } else {
          setError(t('booking.failedToLoad'));
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, user?.id, t]
  );

  useEffect(() => {
    if (userId) {
      fetchSlots(0);
    }
  }, [userId, fetchSlots]);

  const handleLoadMore = async () => {
    await fetchSlots(slots.length, true);
    setHasLoadedMore(true);
  };

  const handleAddGuest = (email: string) => {
    setAdditionalGuests(prev => [...prev, email]);
  };

  const handleRemoveGuest = (email: string) => {
    setAdditionalGuests(prev => prev.filter(guest => guest !== email));
  };

  const handleBook = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSlot || !guestEmail || !userId) {
      return;
    }

    setBookingStatus(BOOKING_SUBMITTING);
    try {
      const bookingResponse = await axios.post(
        `${API_URL}/public/calendar/${userId}/book`,
        {
          startTime: selectedSlot.start,
          guestEmail,
          guestName,
          duration: selectedSlot.duration,
          additionalGuests,
          agenda: agenda.trim() || undefined,
        },
      );
      if (bookingResponse.data?.meetLink) {
        setMeetLink(bookingResponse.data.meetLink);
      }
      setBookingStatus(BOOKING_SUCCESS);
    } catch (error) {
      console.error('Error booking slot:', error);
      setBookingStatus(BOOKING_ERROR);
      const isHostView = Boolean(userId && user?.id && user.id === userId);
      const serverMessage = getAxiosResponseErrorMessage(error);
      if (isHostView && serverMessage) {
        setError(serverMessage);
      } else {
        setError(t('booking.failedToBook'));
      }
    }
  };

  if (loading) {
    return <BookingLoadingState />;
  }

  if (error && slots.length === 0) {
    const isHostView = Boolean(userId && user?.id && user.id === userId);
    return <BookingErrorState showHostDiagnostic={isHostView} hostDiagnosticText={isHostView ? error : undefined} />;
  }

  if (bookingStatus === BOOKING_STATUS_SUCCESS) {
    return <BookingSuccessState guestEmail={guestEmail} meetLink={meetLink} additionalGuests={additionalGuests} />;
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
        <div
          style={{
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.primary.main,
            color: STRING_WHITE,
          }}
        >
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>{t('booking.title')}</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: OPACITY_90_PERCENT }}>{t('booking.subtitle')}</p>
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

          <div style={{ display: 'flex', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
            <SlotSelection
              slots={slots}
              selectedSlot={selectedSlot}
              onSelectSlot={setSelectedSlot}
              timezone={timezone}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              hasMore={!hasLoadedMore || hasMore}
            />
            <BookingForm
              selectedSlot={selectedSlot}
              guestEmail={guestEmail}
              guestName={guestName}
              agenda={agenda}
              bookingStatus={bookingStatus}
              onGuestEmailChange={setGuestEmail}
              onGuestNameChange={setGuestName}
              onAgendaChange={setAgenda}
              onSubmit={handleBook}
              additionalGuests={additionalGuests}
              onAddGuest={handleAddGuest}
              onRemoveGuest={handleRemoveGuest}
              maxAdditionalGuests={MAX_ADDITIONAL_GUESTS}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
