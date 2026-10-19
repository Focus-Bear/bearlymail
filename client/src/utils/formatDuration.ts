import { HOURS_PER_DAY, MINUTES_PER_HOUR } from 'constants/numbers';

/** Compact duration for stats tiles: "45m", "3.5h", "2d"; "-" when unknown. */
export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null) {
    return '-';
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `${Math.round(minutes)}m`;
  }
  const hours = minutes / MINUTES_PER_HOUR;
  if (hours < HOURS_PER_DAY) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  const days = hours / HOURS_PER_DAY;
  return `${Math.round(days * 10) / 10}d`;
}
