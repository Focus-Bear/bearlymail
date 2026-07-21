import { EARLY_MORNING_SCHEDULE_HOUR, EARLY_MORNING_SCHEDULE_MINUTE } from 'constants/numbers';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * True when the local `now` falls at/after midnight but before today's 08:30
 * cutoff — the window where scheduling an email for later this morning is still
 * useful. `getHours()` is always ≥ 0, so the midnight bound holds implicitly.
 */
export function isBeforeEarlyMorningCutoff(now: Date): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  return (
    hour < EARLY_MORNING_SCHEDULE_HOUR ||
    (hour === EARLY_MORNING_SCHEDULE_HOUR && minute < EARLY_MORNING_SCHEDULE_MINUTE)
  );
}

/**
 * Builds the conditional "Today 8:30am" schedule quick option, or null when the
 * current local time is already past the cutoff. Resolves to today at 08:30 in
 * the user's local timezone so it flows through the same rendering as the
 * server-provided suggestions.
 */
export function buildEarlyMorningScheduleSuggestion(
  now: Date,
  translate: TranslateFn,
  locale = 'en'
): TimeSuggestion | null {
  if (!isBeforeEarlyMorningCutoff(now)) {
    return null;
  }
  const target = new Date(now);
  target.setHours(EARLY_MORNING_SCHEDULE_HOUR, EARLY_MORNING_SCHEDULE_MINUTE, 0, 0);
  const time = target.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return {
    label: translate('compose.scheduleTodayEarlyTitle', { time }),
    value: target.toISOString(),
    description: translate('compose.scheduleTodayEarlySubtitle'),
  };
}
