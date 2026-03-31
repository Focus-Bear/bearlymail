import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getAxiosErrorMessage } from 'utils/errors';

import { ModalBackdrop } from 'components/modal/ModalBackdrop';
import { ModalContent } from 'components/modal/ModalContent';
import { CalendarEventsList } from 'components/quick-actions/modals/CalendarEventsList';
import { CalendarModalHeader } from 'components/quick-actions/modals/CalendarModalHeader';
import { API_URL } from 'config/api';
import { CALENDAR_DAYS_AHEAD, CALENDAR_DAYS_BACK, MODAL_WIDTH_LARGE, VIEWPORT_HEIGHT_90 } from 'constants/numbers';

interface CalendarEvent {
  summary?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: Array<{ email?: string; displayName?: string }>;
  htmlLink?: string;
}

interface CalendarFindEventsModalProps {
  attendeeEmail: string;
  onClose: () => void;
}

export const CalendarFindEventsModal: React.FC<CalendarFindEventsModalProps> = ({ attendeeEmail, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await axios.post(`${API_URL}/suggested-actions/calendar/events`, {
          attendeeEmail,
          daysAhead: CALENDAR_DAYS_AHEAD,
          daysBack: CALENDAR_DAYS_BACK,
        });
        setEvents(response.data || []);
      } catch (err: unknown) {
        setError(getAxiosErrorMessage(err, 'Failed to find calendar events'));
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [attendeeEmail]);

  return (
    <ModalBackdrop onClose={onClose} zIndex={2001}>
      <ModalContent maxWidth={`${MODAL_WIDTH_LARGE}px`} maxHeight={VIEWPORT_HEIGHT_90}>
        <CalendarModalHeader title={`🔎 Calendar Events with ${attendeeEmail}`} onClose={onClose} />
        {loading && (
          <div
            style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '24px',
                height: '24px',
                border: `3px solid ${theme.colors.primary.main}`,
                borderTop: '3px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginRight: theme.spacing.sm,
              }}
            />
            Loading events...
          </div>
        )}
        {error && (
          <div
            style={{
              marginBottom: theme.spacing.md,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.sunray.light4,
              border: `1px solid ${theme.colors.accent.error}`,
              borderRadius: theme.borderRadius.md,
              color: theme.colors.accent.error,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {error}
          </div>
        )}
        {!loading && <CalendarEventsList events={events} attendeeEmail={attendeeEmail} />}
      </ModalContent>
    </ModalBackdrop>
  );
};
