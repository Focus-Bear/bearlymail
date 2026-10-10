import { PreviewKeys } from 'utils/parseDuration';

/**
 * "Reappears …" wording for the live snooze preview; mirrors the same date/time
 * resolution the server uses to schedule the snooze. Shared by the per-email and
 * bulk snooze forms so both describe a duration identically.
 */
export const SNOOZE_PREVIEW_KEYS: PreviewKeys = {
  today: 'emailActions.snoozePreviewToday',
  tomorrow: 'emailActions.snoozePreviewTomorrow',
  date: 'emailActions.snoozePreviewDate',
};
