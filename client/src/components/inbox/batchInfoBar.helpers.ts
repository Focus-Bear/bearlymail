import { MINUTES_PER_HOUR, MS_PER_MINUTE } from 'constants/numbers';

export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Return a compact text representation for the next delivery time.
 *
 * Examples:
 * - null -> null
 * - in 45 minutes -> "45m"
 * - in 2 hours -> "2h"
 * - in 2 hours 15 minutes -> "2h 15m"
 *
 * This function returns null when the provided date is in the past or equal to now.
 */
export function getNextDeliveryText(nextDelivery: Date | null): string | null {
  if (!nextDelivery) {
    return null;
  }
  const now = new Date();
  const diffMs = nextDelivery.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / MS_PER_MINUTE);
  if (diffMins <= 0) {
    return null;
  }
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
  const remainingMins = diffMins % MINUTES_PER_HOUR;
  if (diffMins < MINUTES_PER_HOUR) {
    return `${diffMins}m`;
  }
  if (remainingMins === 0) {
    return `${diffHours}h`;
  }
  return `${diffHours}h ${remainingMins}m`;
}

/**
 * Return a human-readable "last check" text using the supplied translation function.
 *
 * Keys used (examples):
 * - 'inbox.batchInfo.neverChecked'
 * - 'inbox.batchInfo.justNow'
 * - 'inbox.batchInfo.oneMinuteAgo'
 * - 'inbox.batchInfo.minutesAgo' (opts: { count })
 * - 'inbox.batchInfo.oneHourAgo'
 * - 'inbox.batchInfo.hoursAgo' (opts: { count })
 */
export function getLastCheckText(lastUrgentCheck: Date | null, translate: TranslateFn): string {
  if (!lastUrgentCheck) {
    return translate('inbox.batchInfo.neverChecked');
  }
  const now = new Date();
  const diffMs = now.getTime() - lastUrgentCheck.getTime();
  const diffMins = Math.round(diffMs / MS_PER_MINUTE);

  if (diffMins < 1) {
    return translate('inbox.batchInfo.justNow');
  }
  if (diffMins === 1) {
    return translate('inbox.batchInfo.oneMinuteAgo');
  }
  if (diffMins < MINUTES_PER_HOUR) {
    return translate('inbox.batchInfo.minutesAgo', { count: diffMins });
  }
  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR);
  if (diffHours === 1) {
    return translate('inbox.batchInfo.oneHourAgo');
  }
  return translate('inbox.batchInfo.hoursAgo', { count: diffHours });
}
