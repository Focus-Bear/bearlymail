import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { EmailThread } from "./email-thread.entity";
import { GoogleAccount } from "./google-account.entity";
import { Office365Account } from "./office365-account.entity";
import { User } from "./user.entity";
import { ZohoAccount } from "./zoho-account.entity";

@Entity("emails")
@Index(["userId", "threadId"])
// For fast lookups by messageId
@Index(["userId", "messageId"])
// For date-based queries in inbox
@Index(["userId", "receivedAt"])
// For joining with email_threads
@Index(["threadId"])
// For inbox queries (getInbox)
@Index(["userId", "emailThreadId"])
// For thread lookups
@Index(["emailThreadId"])
// For batch-status queries (getNextBatchReleaseTime)
@Index(["userId", "isBatched", "batchReleaseAt"])
// For contact-thread HMAC lookup (indexed SQL search — avoids full table scan)
@Index(["userId", "senderEmailHmac"])
// Partial index for reply-time stats aggregations (AVG(timeToReply)) — #2220.
// Only rows with a real reply time are indexed, keeping it small.
@Index("IDX_emails_userId_receivedAt_hasReplyTime", ["userId", "receivedAt"], {
  where: '"timeToReply" > 0',
})
export class Email {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    comment: "Gmail thread ID (for reference, but use emailThreadId for FK)",
  })
  threadId: string;

  @Column({
    nullable: true,
    comment: "Foreign key to email_threads table",
  })
  emailThreadId: string;

  @Column()
  messageId: string;

  @Column({ nullable: true, comment: "Foreign key to google_accounts table" })
  googleAccountId: string | null;

  @Column({
    nullable: true,
    comment: "Foreign key to office365_accounts table",
  })
  office365AccountId: string | null;

  @Column({ nullable: true, comment: "Foreign key to zoho_accounts table" })
  zohoAccountId: string | null;

  @Column({ transformer: makeEncryptedColumnTransformer("emails.from") })
  from: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.fromName"),
  })
  fromName: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.senderJobTitle"),
  })
  senderJobTitle: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.to"),
  })
  to: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.cc"),
  })
  cc: string;

  /**
   * HMAC-SHA256 fingerprint of the sender's email address (normalised to
   * lower-case).  Stored alongside the AES-encrypted `from` field so that
   * contact-thread lookup can use an indexed SQL WHERE instead of full scan.
   * Populated on email ingestion; null for emails ingested before this column.
   */
  @Column({ nullable: true })
  senderEmailHmac: string | null;

  /**
   * Contact ID for the sender of this email. Populated at ingest using the
   * senderEmailHmac → Contact.emailHash indexed lookup. Null for senders
   * not in the contacts table, or emails ingested before this column.
   */
  @Column({ nullable: true })
  senderContactId: string | null;

  /**
   * Comma-delimited HMAC fingerprints of all recipient addresses from `to`
   * and `cc` fields, stored as `,hmac1,hmac2,` so LIKE '%,<hmac>,%' matches
   * exactly.  Null for emails ingested before this column.
   */
  @Column({ type: "text", nullable: true })
  recipientEmailsHmac: string | null;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.replyTo"),
    comment:
      "Reply-To header value - when present, replies should be sent to this address instead of From",
  })
  replyTo: string;

  @Column({ transformer: makeEncryptedColumnTransformer("emails.subject") })
  subject: string;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("emails.body"),
  })
  body: string;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.htmlBody"),
  })
  htmlBody: string;

  // Thread-level properties moved to EmailThread entity
  // Urgency is now on EmailThread (urgencyScore, urgencyExplanation)
  // starCount and isArchived are now on EmailThread

  @Column({ default: false })
  isSnoozed: boolean;

  @Column({ nullable: true })
  snoozeUntil: Date;

  @Column({ default: false })
  isBatched: boolean;

  @Column({ nullable: true })
  batchReleaseAt: Date;

  @Column({ nullable: true })
  sentimentScore: number;

  @Column({ nullable: true })
  timeToReply: number;

  @Column({
    type: "float",
    nullable: true,
    comment: "User's manual priority override (0-100)",
  })
  userPriorityOverride: number | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "emails.priorityOverrideReason",
    ),
    comment: "Reason user provided for override",
  })
  priorityOverrideReason: string | null;

  @Column({
    nullable: true,
    comment:
      "Category of override reason (e.g., 'wrong_sender_priority', 'wrong_urgency', 'topic_mismatch')",
  })
  priorityOverrideReasonType: string | null;

  @Column({ default: false })
  isRead: boolean;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("emails.summary"),
    comment: "Cached summary from LLM",
  })
  summary: string;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "How `summary` was produced: 'llm' (real summary) or 'deterministic' (cheap text placeholder for low-priority threads, upgraded to an LLM summary when the email is opened). NULL when no summary yet.",
  })
  summarySource: "llm" | "deterministic" | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("emails.actionItemsJson"),
    comment:
      "Structured action items extracted during summary pass: Array<{ description: string; confidence: number }>",
  })
  actionItemsJson: Array<{ description: string; confidence: number }> | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("emails.labels"),
    comment: "JSON stringified list of labels",
  })
  labels: string[];

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("emails.attachments"),
    comment:
      "JSON array of attachment metadata: {attachmentId, filename, mimeType, size, inlineData?}[]",
  })
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
    /** Base64-encoded content for inline MIME parts (e.g. text/calendar). */
    inlineData?: string;
  }> | null;

  // Priority explanation moved to EmailThread entity (thread-level property)

  @Column({
    default: false,
    comment: "Flag to indicate summary is being generated",
  })
  isProcessingSummary: boolean;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "Phishing detection confidence level: low, medium, or high. NULL means not detected.",
  })
  phishingConfidence: "low" | "medium" | "high" | null;

  @Column({
    type: "text",
    nullable: true,
    comment: "Human-readable reason for the phishing detection signal",
  })
  phishingReason: string | null;

  @Column({
    default: false,
    comment:
      "Flag to indicate email was delivered early (emergency) due to high priority outside batch window",
  })
  wasDeliveredEarly: boolean;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "Human-readable reason for the batching decision (e.g. 'Batched until 15:00', 'Schedule disabled', 'Emergency delivery')",
  })
  batchDecisionReason: string | null;

  @Column({
    default: false,
    comment:
      "True when this email was sent by the BearlyMail autoresponder on behalf of the user. " +
      "Used by checkThreadFollowUpStatus to avoid classifying autoresponder-sent emails as " +
      "human replies (which would incorrectly move threads from Action to Follow-Up).",
  })
  sentByAutoResponder: boolean;

  @CreateDateColumn()
  receivedAt: Date;

  @ManyToOne(() => User, (user) => user.emails, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => EmailThread, (thread) => thread.emails)
  @JoinColumn({ name: "emailThreadId" })
  thread: EmailThread;

  @ManyToOne(() => GoogleAccount, { nullable: true })
  @JoinColumn({ name: "googleAccountId" })
  googleAccount: GoogleAccount | null;

  @ManyToOne(() => Office365Account, { nullable: true })
  @JoinColumn({ name: "office365AccountId" })
  office365Account: Office365Account | null;

  @ManyToOne(() => ZohoAccount, { nullable: true })
  @JoinColumn({ name: "zohoAccountId" })
  zohoAccount: ZohoAccount | null;

  /**
   * Calculate priority score from breakdown array
   * This is the single source of truth for priority scores
   * Priority explanation is now stored on the thread, not the email
   * @returns The calculated score (0-100), or 0 if no breakdown exists
   */
  getPriorityScore(): number {
    if (
      !this.thread?.priorityExplanation ||
      !this.thread.priorityExplanation.breakdown
    ) {
      return 0;
    }

    const total = this.thread.priorityExplanation.breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );

    return Math.max(0, Math.min(100, total));
  }
}
