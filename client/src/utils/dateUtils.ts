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
 */
export function humanizeTimestamp(date: Date | string): string {
  const now = new Date();
  // eslint-disable-next-line no-restricted-syntax -- 'string' is needed for TypeScript type narrowing
  const timestamp = typeof date === 'string' ? new Date(date) : date;

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
  if (diffSeconds < SECONDS_PER_MINUTE) {
    return 'Just now';
  } else if (diffMinutes < MINUTES_PER_HOUR) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < HOURS_PER_DAY) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffWeeks === 1) {
    return 'A week ago';
  } else if (diffWeeks < 4) {
    return `${diffWeeks} weeks ago`;
  } else if (diffMonths === 1) {
    return 'A month ago';
  } else if (diffMonths < MONTHS_IN_YEAR) {
    return `${diffMonths} months ago`;
  } else if (diffYears === 1) {
    return 'A year ago';
  } else if (diffYears < 2) {
    return 'Over a year ago';
  }

  // For very old dates, show full date in user's timezone
  return `${timestamp.toLocaleDateString('en-US', {
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
