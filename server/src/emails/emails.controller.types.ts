export type CategoryOverrideBody = {
  categoryId?: string;
  categoryName?: string;
  category?: string;
  reason?: string;
};

export type InboxQuery = {
  includeBatched?: string;
  mode?: "triage" | "action" | "follow-up" | "blocked";
  accounts?: string;
  categoryIds?: string;
  minPriority?: string;
  maxPriority?: string;
  page?: string;
  limit?: string;
  offset?: string;
  /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
  assigneeId?: string;
};

export type InboxSummaryQuery = {
  mode?: "triage" | "action" | "follow-up" | "blocked";
  categoryIds?: string;
  minPriority?: string;
  maxPriority?: string;
  includeThreadIds?: string;
  accounts?: string;
};

export type ExportEmailBody = {
  password: string;
};

export type SendEmailBody = {
  to: import("./interfaces/email-provider.interface").EmailRecipient[];
  subject: string;
  body: string;
  cc?: import("./interfaces/email-provider.interface").EmailRecipient[];
  bcc?: import("./interfaces/email-provider.interface").EmailRecipient[];
  scheduledSendAt?: string;
  userTimezone?: string;
};
