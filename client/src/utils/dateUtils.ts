/**
 * Humanizes a date to relative time (e.g., "2 hours ago", "yesterday", "3 days ago")
 * Uses the user's browser timezone automatically via toLocaleString
 */
export function humanizeTimestamp(date: Date | string): string {
  const now = new Date();
  const timestamp = typeof date === 'string' ? new Date(date) : date;
  
  // Get timezone from browser
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Calculate difference in various units
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  // Humanize based on time difference
  if (diffSeconds < 60) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
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
  } else if (diffMonths < 12) {
    return `${diffMonths} months ago`;
  } else if (diffYears === 1) {
    return 'A year ago';
  } else if (diffYears < 2) {
    return 'Over a year ago';
  }

  // For very old dates, show full date in user's timezone
  return timestamp.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: timestamp.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    timeZone: timezone,
  }) + ' at ' + timestamp.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}





