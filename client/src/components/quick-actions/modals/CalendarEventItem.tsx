import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CALENDAR, EMOJI_LOCATION, EMOJI_PEOPLE } from 'constants/emojis';

interface CalendarEvent {
  summary?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: Array<{ email?: string; displayName?: string }>;
  htmlLink?: string;
}

interface CalendarEventItemProps {
  event: CalendarEvent;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const CalendarEventItem: React.FC<CalendarEventItemProps> = ({ event }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.xs,
          color: theme.colors.text.primary,
        }}
      >
        {event.summary || t('quickActions.calendar.untitledEvent')}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {EMOJI_CALENDAR} {formatDate(event.start)} - {formatDate(event.end)}
      </div>
      {event.location && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {EMOJI_LOCATION} {event.location}
        </div>
      )}
      {event.attendees && event.attendees.length > 0 && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {EMOJI_PEOPLE} {event.attendees.map(attendee => attendee.email || attendee.displayName).join(', ')}
        </div>
      )}
      {event.htmlLink && (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.primary.main,
            textDecoration: 'none',
          }}
        >
          {t('quickActions.calendar.openInGoogleCalendar')} →
        </a>
      )}
    </div>
  );
};
