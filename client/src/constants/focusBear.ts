import { MS_PER_SECOND } from 'constants/numbers';

/** BearlyMail's own endpoints that talk to Focus Bear on the user's behalf. */
export const FOCUS_BEAR_API_PATHS = {
  CONNECTION: '/focus-bear/connection',
  TASK_SUGGESTIONS: '/focus-bear/task-suggestions',
} as const;

/**
 * A quick save (the 🐻 without opening the panel) waits this long for the suggested
 * project and date before going ahead without them.
 */
export const FOCUS_BEAR_QUICK_SAVE_WAIT_MS = 3 * MS_PER_SECOND;
