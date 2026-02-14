import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { EmailThread } from "./email-thread.entity";
import { GoogleAccount } from "./google-account.entity";
import { Office365Account } from "./office365-account.entity";
import { ZohoAccount } from "./zoho-account.entity";
import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";

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

  @Column({ transformer: encryptedColumnTransformer })
  from: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  fromName: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  senderJobTitle: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  to: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  cc: string;

  @Column({
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment:
      "Reply-To header value - when present, replies should be sent to this address instead of From",
  })
  replyTo: string;

  @Column({ transformer: encryptedColumnTransformer })
  subject: string;

  @Column("text", { transformer: encryptedColumnTransformer })
  body: string;

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
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
    transformer: encryptedColumnTransformer,
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
    transformer: encryptedColumnTransformer,
    comment: "Cached summary from LLM",
  })
  summary: string;

  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedJsonTransformer,
    comment: "JSON stringified list of labels",
  })
  labels: string[];

  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedJsonTransformer,
    comment:
      "JSON array of attachment metadata: {attachmentId, filename, mimeType, size}[]",
  })
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }> | null;

  // Priority explanation moved to EmailThread entity (thread-level property)

  @Column({
    default: false,
    comment: "Flag to indicate summary is being generated",
  })
  isProcessingSummary: boolean;

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

  @CreateDateColumn()
  receivedAt: Date;

  @ManyToOne(() => User, (user) => user.emails)
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
