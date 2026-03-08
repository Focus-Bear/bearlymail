import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CalendarEventItem } from 'components/quick-actions/modals/CalendarEventItem';

interface CalendarEvent {
  summary?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: Array<{ email?: string; displayName?: string }>;
  htmlLink?: string;
}

interface CalendarEventsListProps {
  events: CalendarEvent[];
  attendeeEmail: string;
}

export const CalendarEventsList: React.FC<CalendarEventsListProps> = ({ events, attendeeEmail }) => {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <div
        style={{
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
        }}
      >
        {t('quickActions.calendar.noEventsFound', { email: attendeeEmail })}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      <div
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('quickActions.calendar.foundEvents', { count: events.length })}
      </div>
      {events.map(event => (
        <CalendarEventItem key={`${event.start}-${event.end}-${event.summary || 'untitled'}`} event={event} />
      ))}
    </div>
  );
};
