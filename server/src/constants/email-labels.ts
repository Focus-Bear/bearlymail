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
} as const;

export type GmailLabel = (typeof GMAIL_LABELS)[keyof typeof GMAIL_LABELS];
