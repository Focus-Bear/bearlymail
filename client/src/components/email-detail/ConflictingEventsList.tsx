import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/** A calendar event that overlaps the proposed meeting slot. */
export interface ConflictingEvent {
  /** Event summary; null when the event has no title. */
  title: string | null;
  /** ISO datetime, or bare YYYY-MM-DD for all-day events. */
  start: string;
  end: string;
}

/** True for a bare YYYY-MM-DD (all-day event boundary) rather than a full ISO datetime. */
function isDateOnly(value: string): boolean {
  return !value.includes('T');
}

/** Format a UTC ISO string as a short local clock time, e.g. "2:00 PM". */
function formatClockTime(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Names the events behind a conflict warning ("Standup · 12:00 – 12:30 PM"), so the
 * user can see WHAT they'd clash with instead of just that a clash exists.
 */
export const ConflictingEventsList: React.FC<{ events: ConflictingEvent[] }> = ({ events }) => {
  const { t, i18n } = useTranslation();
  if (events.length === 0) {
    return null;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {events.filter(Boolean).map((event) => {
        const start = event.start ?? '';
        const end = event.end ?? '';
        const timeText = isDateOnly(start)
          ? t('emailDetail.schedulingRequest.proposedTime.conflictEventAllDay')
          : `${formatClockTime(start, i18n.language)} – ${formatClockTime(end, i18n.language)}`;
        return (
          <div
            key={`${start}-${event.title ?? ''}`}
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              paddingLeft: theme.spacing.sm,
            }}
          >
            {event.title || t('emailDetail.schedulingRequest.proposedTime.conflictEventUntitled')}
            {' · '}
            {timeText}
          </div>
        );
      })}
    </div>
  );
};
