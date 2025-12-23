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
  starCount: number; // 0 = not starred, 1-3 = priority level
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
   * Archive a thread (remove from inbox, add bearly-mail-archived label)
   */
  archiveThread(userId: string, threadId: string): Promise<void>;

  /**
   * Unarchive a thread (add to inbox, remove bearly-mail-archived label)
   */
  unarchiveThread(userId: string, threadId: string): Promise<void>;
}
