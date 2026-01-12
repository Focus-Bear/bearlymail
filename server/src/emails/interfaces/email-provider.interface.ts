// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Email } from "../../database/entities/email.entity";

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
}

/**
 * Email recipient with optional name
 */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Interface for email provider implementations
 * This abstraction allows supporting multiple email providers (Gmail, Outlook, MS Teams, etc.)
 */
export interface EmailProvider {
  /**
   * Sync emails from the provider's inbox
   * Should fetch new emails and create/update them in the database
   */
  syncEmails(userId: string): Promise<void>;

  /**
   * Scan historical emails for analysis
   * Typically scans last 7 days or max 300 emails
   */
  scanHistory(userId: string): Promise<void>;

  /**
   * Send a reply email (continues an existing thread)
   */
  sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<void>;

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
}
