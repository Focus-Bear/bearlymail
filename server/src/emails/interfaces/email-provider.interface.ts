/**
 * Email attachment metadata
 */
export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Base64-encoded content for inline MIME parts (e.g. text/calendar, inline images) that
   *  have no Gmail attachment ID. When present the content is served directly
   *  without a round-trip to the Gmail Attachments API. */
  inlineData?: string;
  /** Content-ID value from the MIME Content-ID header (without angle brackets).
   *  When set, this attachment is an inline image referenced in the HTML body
   *  via `<img src="cid:{contentId}">`. Client filters attachments with a
   *  contentId out of the download list. */
  contentId?: string;
}

/**
 * Represents a raw email message from an email provider
 */
export interface RawEmailMessage {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  senderJobTitle?: string;
  body: string;
  htmlBody?: string;
  starCount: number;
  // 0 = not starred, 1-3 = priority level
  receivedAt: Date;
  isRead?: boolean;
  labelIds?: string[];
  attachments?: EmailAttachment[];
}

/**
 * Email recipient with optional name
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Attachment data for sending emails
 */
export interface EmailAttachmentData {
  filename: string;
  mimeType: string;
  content: Buffer;
  /**
   * When set, this attachment is an inline image referenced in the HTML body
   * via `<img src="cid:{contentId}">`. The value must match the `cid:` reference
   * in the HTML (without angle brackets). The MIME part will be sent with
   * `Content-ID: <{contentId}>` and `Content-Disposition: inline`.
   */
  contentId?: string;
}

/**
 * Optional parameters for sendReply
 */
export interface SendReplyOptions {
  attachments?: EmailAttachmentData[];
  htmlBody?: string;
  cc?: string;
  bcc?: string;
}

/**
 * Options for email sync operations
 * Used to support continuation/pagination for large mailboxes
 */
export interface SyncEmailsOptions {
  /**
   * Custom sync window in hours (overrides default calculation)
   */
  syncWindowHours?: number;

  /**
   * Specific thread IDs to process (for continuation jobs)
   * When provided, skips the thread list fetch and processes only these threads
   */
  threadIds?: string[];

  /**
   * Whether this is a continuation job (affects logging and behavior)
   */
  isContinuation?: boolean;

  /**
   * When true, fetch the full ongoing sync window (ONGOING_SYNC_WINDOW_DAYS)
   * instead of the incremental window. Used by the 2-hour extended sync to
   * catch any missed emails. Despite the name, the fetch is still clamped to
   * the sync-window policy (see sync-window-policy.ts) — the name is kept for
   * compatibility with in-flight job payloads.
   */
  noDateFilter?: boolean;
}

/**
 * Interface for email provider implementations
 * This abstraction allows supporting multiple email providers (Gmail, Outlook, MS Teams, etc.)
 */
export interface EmailProvider {
  /**
   * Sync emails from the provider's inbox
   * Should fetch new emails and create/update them in the database
   * @param userId - The user ID to sync emails for
   * @param syncWindowHoursOrOptions - Optional sync window in hours OR SyncEmailsOptions object
   */
  syncEmails(
    userId: string,
    syncWindowHoursOrOptions?: number | SyncEmailsOptions,
  ): Promise<void>;

  /**
   * Scan historical emails for analysis
   * Typically scans last 7 days or max 300 emails
   */
  scanHistory(userId: string): Promise<void>;

  /**
   * Send a reply email (continues an existing thread)
   * @param to - Comma-separated list of recipient email addresses (supports "Name <email>" format)
   * @param options.cc - Optional comma-separated list of CC recipient email addresses
   * @param options.htmlBody - Optional HTML version of the body for rich formatting
   * @param options.attachments - Optional email attachments
   */
  sendReply(
    userId: string,
    params: {
      threadId: string;
      to: string;
      subject: string;
      body: string;
      options?: SendReplyOptions;
    },
  ): Promise<{ messageId: string; threadId: string }>;

  /**
   * Send a new email (creates a new thread)
   */
  sendEmail(
    userId: string,
    params: {
      to: EmailRecipient[];
      subject: string;
      body: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      attachments?: EmailAttachmentData[];
    },
  ): Promise<{ messageId: string; threadId: string }>;

  /**
   * Check if the user is connected to this email provider
   */
  isConnected(userId: string): Promise<boolean>;

  /**
   * Get account information for the connected provider
   * Returns email address, name, and whether it's the primary account
   */
  getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null>;

  /**
   * Search emails using provider-specific search syntax
   * Returns raw email messages that match the query
   */
  searchEmails(
    userId: string,
    query: string,
    maxResults?: number,
  ): Promise<RawEmailMessage[]>;

  /**
   * Fetch all messages in a specific thread.
   * For Gmail: uses thread ID directly on the Gmail API.
   * For Zoho: uses the messages endpoint with threadId param (not searchEmails,
   *   which uses Gmail-style query syntax Zoho doesn't support).
   * For O365: uses conversationId filter.
   */
  fetchThreadMessages(
    userId: string,
    threadId: string,
    limit?: number,
  ): Promise<RawEmailMessage[]>;

  /**
   * Archive a thread (remove from inbox)
   * Note: For Gmail, this removes the INBOX label. For O365/Zoho, this moves to archive folder.
   */
  archiveThread(userId: string, threadId: string): Promise<void>;

  /**
   * Unarchive a thread (add back to inbox)
   * Note: For Gmail, this adds the INBOX label. For O365/Zoho, this moves from archive folder back to inbox.
   */
  unarchiveThread(userId: string, threadId: string): Promise<void>;

  /**
   * Sync star status to the email provider
   * Updates the starred/unstarred status of all messages in a thread
   */
  syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void>;

  /**
   * Delete/trash a thread (move to trash folder)
   */
  trashThread(userId: string, threadId: string): Promise<void>;

  /**
   * Snooze a thread (apply snooze label/action to hide from inbox until snoozeUntil date)
   * Note: For Gmail, this adds a custom label. For O365/Zoho, this may use folders or categories.
   */
  snoozeThread(
    userId: string,
    threadId: string,
    snoozeUntil: Date,
  ): Promise<void>;

  /**
   * Unsnooze a thread (remove snooze label/action to restore to inbox)
   * Note: For Gmail, this removes the snooze label. For O365/Zoho, this restores from snooze folder.
   */
  unsnoozeThread(userId: string, threadId: string): Promise<void>;

  /**
   * Add a label to a thread in the email provider
   * Used for applying labels like "BearlyMail-Blocked" to blocked emails
   * @param userId - The user ID
   * @param threadId - The thread ID to label
   * @param labelName - The label name to apply
   */
  addLabelToThread(
    userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void>;

  /**
   * Get attachment data from an email
   * Returns the attachment file data and metadata
   * @param attachmentMetadata - Optional metadata to help find the attachment if the ID has changed
   *                             (Gmail attachment IDs are ephemeral and can change between API calls)
   */
  getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
    attachmentMetadata?: {
      filename: string;
      mimeType: string;
      size: number;
    },
  ): Promise<{
    attachmentBuffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}
