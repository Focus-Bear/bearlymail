/**
 * Gmail label constants
 * Use these instead of magic strings throughout the codebase
 */

export const GMAIL_LABELS = {
  INBOX: "INBOX",
  SENT: "SENT",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  ARCHIVED: "ARCHIVED",
  TRASH: "TRASH",
  SPAM: "SPAM",
  DRAFT: "DRAFT",
  /** Gmail's own importance marker, learned from how the user treats each sender. */
  IMPORTANT: "IMPORTANT",
} as const;

export type GmailLabel = (typeof GMAIL_LABELS)[keyof typeof GMAIL_LABELS];
