/**
 * Unsubscribe flow. The method and outcome values mirror the server's
 * `UNSUBSCRIBE_METHODS` / `UNSUBSCRIBE_OUTCOMES` (server/src/constants/unsubscribe.constants.ts).
 */
export const UNSUBSCRIBE_METHODS = {
  ONE_CLICK: 'one-click',
  MAILTO: 'mailto',
  LINK: 'link',
} as const;

export type UnsubscribeMethod = (typeof UNSUBSCRIBE_METHODS)[keyof typeof UNSUBSCRIBE_METHODS];

export const UNSUBSCRIBE_OUTCOMES = {
  UNSUBSCRIBED: 'unsubscribed',
  OPEN_LINK: 'open-link',
} as const;

export type UnsubscribeOutcome = (typeof UNSUBSCRIBE_OUTCOMES)[keyof typeof UNSUBSCRIBE_OUTCOMES];

export const UNSUBSCRIBE_ENDPOINTS = {
  unsubscribe: (emailId: string) => `/emails/${emailId}/unsubscribe`,
  archiveSender: (emailId: string) => `/emails/${emailId}/unsubscribe/archive-sender`,
  /** Settings → Subscriptions: the mailing lists the user could unsubscribe from. */
  mailingLists: '/mailing-lists',
} as const;

export const UNSUBSCRIBE_MENU_KEY = 'unsubscribe';
export const HTTPS_PROTOCOL = 'https:';
export const NEW_TAB_TARGET = '_blank';
export const NEW_TAB_FEATURES = 'noopener,noreferrer';
export const BLANK_PAGE_URL = 'about:blank';
