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
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { User } from "./user.entity";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  // base64 encoded
  content: string;
}

@Entity("scheduled_emails")
@Index(["userId", "scheduledSendAt"])
@Index(["scheduledSendAt", "status"])
export class ScheduledEmail {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  // Status: pending, sent, cancelled, failed
  @Column({
    type: "varchar",
    length: 20,
    default: "pending",
  })
  status: "pending" | "sent" | "cancelled" | "failed";

  @Column({
    type: "varchar",
    length: 20,
    comment: "Type: reply, forward, or new",
  })
  emailType: "reply" | "forward" | "new";

  @Column({
    nullable: true,
    comment: "Thread ID if this is a reply",
  })
  threadId: string | null;

  @Column({
    nullable: true,
    comment: "Email ID if this is a reply",
  })
  emailId: string | null;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer("scheduled_emails.to"),
    comment: "To recipients",
  })
  to: EmailRecipient[];

  @Column("text", {
    transformer: makeEncryptedJsonTransformer("scheduled_emails.cc"),
    nullable: true,
    comment: "CC recipients",
  })
  cc: EmailRecipient[] | null;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer("scheduled_emails.bcc"),
    nullable: true,
    comment: "BCC recipients",
  })
  bcc: EmailRecipient[] | null;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("scheduled_emails.subject"),
    comment: "Email subject",
  })
  subject: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("scheduled_emails.body"),
    comment: "Email body (plain text or HTML)",
  })
  body: string;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer("scheduled_emails.attachments"),
    nullable: true,
    comment: "Attachments (base64 encoded)",
  })
  attachments: EmailAttachment[] | null;

  @Column({
    type: "timestamp with time zone",
    comment: "When to send the email",
  })
  scheduledSendAt: Date;

  @Column({
    type: "timestamp with time zone",
    nullable: true,
    comment: "When the email was actually sent",
  })
  sentAt: Date | null;

  @Column({
    type: "text",
    nullable: true,
    comment: "Error message if sending failed",
  })
  errorMessage: string | null;

  @Column({
    type: "text",
    nullable: true,
    comment: "User's timezone for display purposes",
  })
  userTimezone: string | null;

  @Column({
    type: "int",
    nullable: true,
    comment: "Expected reply time in hours (for follow-up tracking)",
  })
  expectedReplyHours: number | null;

  @Column("text", {
    transformer: makeEncryptedJsonTransformer(
      "scheduled_emails.forwardAttachmentIds",
    ),
    nullable: true,
    comment:
      "Forward attachment IDs if this is a reply with forwarded attachments",
  })
  forwardAttachmentIds: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
