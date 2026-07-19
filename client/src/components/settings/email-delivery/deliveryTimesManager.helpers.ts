/**
 * Pure helper functions extracted from DeliveryTimesManager.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const HOURS_12_HOUR_FORMAT = 12;
const PADDING_START_2 = 2;

export function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= HOURS_12_HOUR_FORMAT ? 'PM' : 'AM';
  const hours12 = hours % HOURS_12_HOUR_FORMAT || HOURS_12_HOUR_FORMAT;
  return `${hours12}:${minutes.toString().padStart(PADDING_START_2, '0')} ${period}`;
}
