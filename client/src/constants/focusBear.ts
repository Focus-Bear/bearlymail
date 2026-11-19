/** BearlyMail's own endpoints that talk to Focus Bear on the user's behalf. */
export const FOCUS_BEAR_API_PATHS = {
  CONNECTION: '/focus-bear/connection',
  CONNECT_URL: '/focus-bear/connect-url',
  TASK_SUGGESTIONS: '/focus-bear/task-suggestions',
} as const;

/**
 * After the user signs in to Focus Bear, the server sends the browser back to settings with the
 * outcome in this query param. Must match FOCUS_BEAR_CONNECT_RESULT on the server.
 */
export const FOCUS_BEAR_CONNECT_RESULT = {
  QUERY_PARAM: 'focusBear',
  CONNECTED: 'connected',
  FAILED: 'failed',
} as const;
