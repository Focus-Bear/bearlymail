import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  encryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";

/**
 * Temporary table for storing emails during the historical scan process.
 * Emails are stored here during scanning, then analyzed and rules are created,
 * then deleted. This keeps scan data separate from the main emails table.
 */
@Entity("scan_emails")
@Index(["userId", "receivedAt"])
@Index(["userId", "messageId"])
export class ScanEmail {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  threadId: string;

  @Column()
  messageId: string;

  @Column({ transformer: encryptedColumnTransformer })
  from: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  fromName: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  senderJobTitle: string;

  @Column({ transformer: encryptedColumnTransformer })
  subject: string;

  @Column("text", { transformer: encryptedColumnTransformer })
  body: string;

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
  htmlBody: string;

  @Column({
    type: "int",
    default: 0,
    comment: "0 = not starred, 1-3 = priority level",
  })
  starCount: number;

  @CreateDateColumn()
  receivedAt: Date;

  @Column({ default: false })
  isRead: boolean;

  @Column({
    nullable: true,
    comment: "Hours to reply (calculated from thread)",
  })
  timeToReply: number;

  @Column({
    default: false,
    comment: "Whether user archived this email (from Gmail labels)",
  })
  isArchived: boolean;

  @Column({
    type: "timestamp",
    nullable: true,
    comment: "When it was archived (estimated from receivedAt if archived)",
  })
  archivedAt: Date;

  @Column({
    default: false,
    comment: "Whether user replied to this email (check thread)",
  })
  wasRepliedTo: boolean;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("scan_emails.labels"),
    comment: "Email labels from provider (Gmail labels, Office365 categories)",
  })
  labels: string[];
}
