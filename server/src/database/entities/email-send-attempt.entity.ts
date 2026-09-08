import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  EMAIL_SEND_STATUS,
  EmailSendFailureReason,
  EmailSendStatus,
  EmailSendType,
} from "../../constants/email-send.constants";
import { EmailRecipient } from "../../emails/interfaces/email-provider.interface";
import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/** An attachment carried through the queue; `content` is base64. */
export interface QueuedAttachment {
  filename: string;
  mimeType: string;
  content: string;
}

/** An inline image carried through the queue, keyed by its MIME Content-ID. */
export interface QueuedInlineImage extends QueuedAttachment {
  contentId: string;
}

/** Everything `EmailProvider.sendEmail` needs for a composed message. */
export interface QueuedNewEmailPayload {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  attachments?: QueuedAttachment[];
}

/** Everything `RepliesService.sendReply` needs, minus the Buffers. */
export interface QueuedReplyPayload {
  body: string;
  recipients?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  isForward: boolean;
  keepInAction: boolean;
  expectedReplyHours?: number;
  forwardAttachmentIds?: string[];
  attachments?: QueuedAttachment[];
  inlineImages?: QueuedInlineImage[];
}

export type QueuedSendPayload = QueuedNewEmailPayload | QueuedReplyPayload;

/**
 * A durable record of one outbound send.
 *
 * The send endpoints persist this row *before* enqueueing the pg-boss job and
 * return its `id` as the correlation id, so a message can never be lost between
 * the HTTP request and the worker: the row survives a worker crash and the
 * sweeper re-enqueues or finalises it. The row is also the idempotency key — a
 * retried job re-claims it with a conditional `queued → sending` update, so a
 * duplicate job cannot send the same message twice.
 */
@Entity("email_send_attempts")
@Index(["userId", "status"])
@Index(["status", "updatedAt"])
export class EmailSendAttempt {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    type: "varchar",
    length: 20,
    default: EMAIL_SEND_STATUS.QUEUED,
  })
  status: EmailSendStatus;

  @Column({ type: "varchar", length: 10 })
  sendType: EmailSendType;

  /** Source email the reply/forward is threaded onto. Null for new messages. */
  @Column({ type: "uuid", nullable: true })
  emailId: string | null;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer("email_send_attempts.payload"),
  })
  payload: QueuedSendPayload;

  /** Provider message id, once the send succeeded. */
  @Column({ type: "text", nullable: true })
  messageId: string | null;

  /** Provider thread id, once the send succeeded. */
  @Column({ type: "text", nullable: true })
  threadId: string | null;

  /** Provider attempts made so far, capped by MAX_EMAIL_SEND_ATTEMPTS. */
  @Column({ type: "int", default: 0 })
  attempts: number;

  /** User-safe failure code published to the client. Null unless failed. */
  @Column({ type: "varchar", length: 40, nullable: true })
  failureReason: EmailSendFailureReason | null;

  /** Raw provider error, for operators. Never shown to the user. */
  @Column({ type: "text", nullable: true })
  errorDetail: string | null;

  @Column({ type: "timestamp with time zone", nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
