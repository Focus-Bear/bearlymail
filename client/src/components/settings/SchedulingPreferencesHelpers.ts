import { HOURS_12_HOUR_FORMAT } from 'constants/numbers';

export function formatHour(hour: number): string {
  if (hour === 0) {
    return '12 AM';
  }
  if (hour < HOURS_12_HOUR_FORMAT) {
    return `${hour} AM`;
  }
  if (hour === HOURS_12_HOUR_FORMAT) {
    return '12 PM';
  }
  return `${hour - HOURS_12_HOUR_FORMAT} PM`;
}
