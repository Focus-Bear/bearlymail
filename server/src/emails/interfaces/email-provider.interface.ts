// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Email } from "../../database/entities/email.entity";

/**
 * Email attachment metadata
 */
export interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
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
   * @param syncWindowHours - Optional custom sync window in hours (overrides default calculation)
   */
  syncEmails(userId: string, syncWindowHours?: number): Promise<void>;

  /**
   * Scan historical emails for analysis
   * Typically scans last 7 days or max 300 emails
   */
  scanHistory(userId: string): Promise<void>;

  /**
   * Send a reply email (continues an existing thread)
   * @param htmlBody - Optional HTML version of the body for rich formatting
   */
  sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachmentData[],
    htmlBody?: string,
  ): Promise<{ messageId: string; threadId: string }>;

  /**
   * Send a new email (creates a new thread)
   */
  sendEmail(
    userId: string,
    to: EmailRecipient[],
    subject: string,
    body: string,
    cc?: EmailRecipient[],
    bcc?: EmailRecipient[],
    attachments?: EmailAttachmentData[],
  ): Promise<{ messageId: string; threadId: string }>;

  /**
   * Check if the user is connected to this email provider
   */
  isConnected(userId: string): Promise<boolean>;

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
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}
