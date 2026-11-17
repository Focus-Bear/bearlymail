/**
 * The `focusbear://create-task` deep link that "Save to Focus Bear" opens.
 * The Focus Bear desktop app owns the route; these names are the contract
 * with it, so changing one breaks links the app already understands.
 */
export const FOCUS_BEAR_CREATE_TASK_URL = 'focusbear://create-task';

export const FOCUS_BEAR_TASK_PARAM = {
  TITLE: 'title',
  NOTES: 'notes',
  LINK: 'link',
  SOURCE: 'source',
  /** `YYYY-MM-DD`. */
  DUE_DATE: 'due_date',
  /** A Focus Bear project id. */
  PROJECT_ID: 'project_id',
  /** Whole minutes the task should take. */
  DURATION_MINUTES: 'duration_minutes',
} as const;

export const FOCUS_BEAR_TASK_SOURCE_BEARLYMAIL = 'bearlymail';

/**
 * Character budgets before encoding. Windows caps a protocol launch at 2,048
 * characters and percent-encoding can triple non-ASCII text, so the encoded
 * URL is also checked against FOCUS_BEAR_TASK_MAX_URL_LENGTH and the notes are
 * shortened further until it fits.
 */
export const FOCUS_BEAR_TASK_MAX_TITLE_LENGTH = 200;
export const FOCUS_BEAR_TASK_MAX_NOTES_LENGTH = 1000;
export const FOCUS_BEAR_TASK_MAX_URL_LENGTH = 2000;

export const FOCUS_BEAR_TASK_ELLIPSIS = '…';
