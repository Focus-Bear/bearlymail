import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: string; // base64 encoded
}

@Entity("scheduled_emails")
@Index(["userId", "scheduledSendAt"])
@Index(["scheduledSendAt", "status"])
export class ScheduledEmail {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "pending",
    comment: "Status: pending, sent, cancelled, failed",
  })
  status: "pending" | "sent" | "cancelled" | "failed";

  @Column({
    type: "varchar",
    length: 20,
    comment: "Type: reply or new",
  })
  emailType: "reply" | "new";

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

  @Column("jsonb", {
    transformer: encryptedJsonTransformer,
    comment: "To recipients",
  })
  to: EmailRecipient[];

  @Column("jsonb", {
    transformer: encryptedJsonTransformer,
    nullable: true,
    comment: "CC recipients",
  })
  cc: EmailRecipient[] | null;

  @Column("jsonb", {
    transformer: encryptedJsonTransformer,
    nullable: true,
    comment: "BCC recipients",
  })
  bcc: EmailRecipient[] | null;

  @Column({
    type: "text",
    transformer: encryptedColumnTransformer,
    comment: "Email subject",
  })
  subject: string;

  @Column({
    type: "text",
    transformer: encryptedColumnTransformer,
    comment: "Email body (plain text or HTML)",
  })
  body: string;

  @Column("jsonb", {
    transformer: encryptedJsonTransformer,
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

  @Column("jsonb", {
    transformer: encryptedJsonTransformer,
    nullable: true,
    comment: "Forward attachment IDs if this is a reply with forwarded attachments",
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
