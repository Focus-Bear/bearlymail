import { OpenTrackingSummary } from 'types/email';

import {
  DAYS_IN_MONTH_30,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from 'constants/numbers';
import { OPEN_TRACKING_STATE, OpenTrackingState } from 'constants/openTracking';

const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;

const RELATIVE_TIME_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: 'year', seconds: DAYS_PER_YEAR * SECONDS_PER_DAY },
  { unit: 'month', seconds: DAYS_IN_MONTH_30 * SECONDS_PER_DAY },
  { unit: 'week', seconds: DAYS_PER_WEEK * SECONDS_PER_DAY },
  { unit: 'day', seconds: SECONDS_PER_DAY },
  { unit: 'hour', seconds: SECONDS_PER_HOUR },
  { unit: 'minute', seconds: SECONDS_PER_MINUTE },
];

/** Reliable opens win; Apple's automatic prefetches alone are flagged as such. */
export function getOpenTrackingState(summary: OpenTrackingSummary): OpenTrackingState {
  if (summary.openCount > 0) {
    return OPEN_TRACKING_STATE.OPENED;
  }
  if (summary.automaticOpenCount > 0) {
    return OPEN_TRACKING_STATE.MAYBE_AUTOMATIC;
  }
  return OPEN_TRACKING_STATE.SENT;
}

/** Compact, localised "2 hr. ago" / "hace 2 h" for indicator text. */
export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const elapsedSeconds = (new Date(iso).getTime() - now.getTime()) / MS_PER_SECOND;
  const match = RELATIVE_TIME_UNITS.find(({ seconds }) => Math.abs(elapsedSeconds) >= seconds);
  if (!match) {
    return formatter.format(0, 'minute');
  }
  return formatter.format(Math.round(elapsedSeconds / match.seconds), match.unit);
}

/** Absolute, localised date + time for the open-history tooltip. */
export function formatOpenTimestamp(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}
