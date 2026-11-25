/** BearlyMail's own endpoints that talk to Focus Bear on the user's behalf. */
export const FOCUS_BEAR_API_PATHS = {
  CONNECTION: '/focus-bear/connection',
  CONNECT_URL: '/focus-bear/oauth/connect-url',
  TASK_SUGGESTIONS: '/focus-bear/task-suggestions',
} as const;

/** How BearlyMail holds the user's Focus Bear access (the server's `FOCUS_BEAR_CONNECTION_METHODS`). */
export const FOCUS_BEAR_CONNECTION_METHODS = {
  OAUTH: 'oauth',
  /** A token pasted in before "Connect Focus Bear" existed; it keeps working until the user reconnects. */
  PASTED_TOKEN: 'pasted_token',
} as const;

export type FocusBearConnectionMethod =
  (typeof FOCUS_BEAR_CONNECTION_METHODS)[keyof typeof FOCUS_BEAR_CONNECTION_METHODS];

/** `?focusBear=` the server's OAuth callback returns to Settings with. */
export const FOCUS_BEAR_CONNECT_RESULT_PARAM = 'focusBear';

export const FOCUS_BEAR_CONNECT_RESULTS = {
  CONNECTED: 'connected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'failed',
} as const;

export type FocusBearConnectResult = (typeof FOCUS_BEAR_CONNECT_RESULTS)[keyof typeof FOCUS_BEAR_CONNECT_RESULTS];
