/** Ports, limits and search operators for password-based (IMAP/SMTP) mail. */

export const IMAP_IMPLICIT_TLS_PORT = 993;
export const IMAP_STARTTLS_PORT = 143;
export const SMTP_IMPLICIT_TLS_PORT = 465;
export const SMTP_SUBMISSION_PORT = 587;
export const SMTP_ALTERNATE_SUBMISSION_PORT = 2525;

export const MAIL_CONNECTION_TIMEOUT_MS = 15_000;
export const MAIL_GREETING_TIMEOUT_MS = 15_000;
/** Automatic discovery tries several hosts, so dead ones must fail fast. */
export const MAIL_DISCOVERY_TIMEOUT_MS = 8_000;
export const IMAP_SOCKET_TIMEOUT_MS = 120_000;
export const SMTP_SOCKET_TIMEOUT_MS = 60_000;

/** 25 MiB: larger messages are listed from their headers only. */
export const IMAP_MAX_FULL_SOURCE_BYTES = 26_214_400;

export const IP_VERSION = { V4: 4, V6: 6 } as const;

/** Gmail-style operators callers send to every provider's searchEmails. */
export const GMAIL_SEARCH_OPERATORS = {
  FROM: "from",
  TO: "to",
  SUBJECT: "subject",
  AFTER: "after",
  BEFORE: "before",
  IN: "in",
  IS: "is",
} as const;

export const GMAIL_SEARCH_VALUES = {
  SENT: "sent",
  ANYWHERE: "anywhere",
  UNREAD: "unread",
  STARRED: "starred",
} as const;
