import {
  DAYS_IN_MONTH_30,
  DAYS_PER_YEAR,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MONTHS_IN_YEAR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from 'constants/numbers';

/**
 * Returns 9:00 AM the next business day in browser-local time.
 * Skips Saturday (→ Monday) and Sunday (→ Monday).
 */
export const getNextMorning = (): Date => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  if (next.getDay() === 6) {
    next.setDate(next.getDate() + 2);
  } else if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(9, 0, 0, 0);
  return next;
};

/**
 * Formats a Date for display in scheduled-send UI.
 * Example: "Mon, Jan 6, 9:00 AM"
 */
export const formatScheduledTime = (date: Date): string =>
  date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Humanizes a date to relative time (e.g., "2 hours ago", "yesterday", "3 days ago")
 * Uses the user's browser timezone automatically via toLocaleString
 *
 * @param date - The date to humanize
 * @param options.showAbsoluteDate - When true, appends the absolute date in brackets,
 *   e.g. "4 weeks ago [Feb 14]". Defaults to false for backward compatibility.
 */
export function humanizeTimestamp(date: Date | string, options: { showAbsoluteDate?: boolean } = {}): string {
  // Guard against missing input first: `new Date(null)` is the epoch (1970),
  // not Invalid Date, so a null/empty value would otherwise render "55 years ago".
  if (!date) {
    return '';
  }
  const now = new Date();
  const timestamp = date instanceof Date ? date : new Date(date);

  // Guard against unparseable input so callers never render
  // "Invalid Date at Invalid Date" when a date field is malformed (#search).
  if (Number.isNaN(timestamp.getTime())) {
    return '';
  }

  // Get timezone from browser
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Calculate difference in various units
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / MS_PER_SECOND);
  const diffMinutes = Math.floor(diffSeconds / SECONDS_PER_MINUTE);
  const diffHours = Math.floor(diffMinutes / MINUTES_PER_HOUR);
  const diffDays = Math.floor(diffHours / HOURS_PER_DAY);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / DAYS_IN_MONTH_30);
  const diffYears = Math.floor(diffDays / DAYS_PER_YEAR);

  // Humanize based on time difference
  let relative: string;
  if (diffSeconds < SECONDS_PER_MINUTE) {
    relative = 'Just now';
  } else if (diffMinutes < MINUTES_PER_HOUR) {
    relative = `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < HOURS_PER_DAY) {
    relative = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays === 1) {
    relative = 'Yesterday';
  } else if (diffDays < 7) {
    relative = `${diffDays} days ago`;
  } else if (diffWeeks === 1) {
    relative = 'A week ago';
  } else if (diffDays < DAYS_IN_MONTH_30) {
    // Use diffDays < DAYS_IN_MONTH_30 (instead of diffWeeks < 4) to cover 28-29 day
    // emails that would otherwise produce "0 months ago" (fixes #887).
    relative = `${diffWeeks} weeks ago`;
  } else if (diffMonths === 1) {
    relative = 'A month ago';
  } else if (diffMonths < MONTHS_IN_YEAR) {
    relative = `${diffMonths} months ago`;
  } else if (diffYears === 1) {
    relative = 'A year ago';
  } else if (diffYears < 2) {
    relative = 'Over a year ago';
  } else {
    // For very old dates, show full date in user's timezone
    relative = `${timestamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: timestamp.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      timeZone: timezone,
    })} at ${timestamp.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })}`;
  }

  if (!options.showAbsoluteDate) {
    return relative;
  }

  const absDate = timestamp.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: timestamp.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    timeZone: timezone,
  });
  return `${relative} [${absDate}]`;
}
