import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Maps an imported email's RFC-822 message ID to Mail.app's numeric message
 * id. Mail's AppleScript interface reads the RFC-822 id ~300ms/message (it
 * is not in the envelope index), while numeric-id lookups take ~25ms — so
 * every targeted operation (flag, archive, attachments, reply) resolves
 * messages through this mapping instead of searching Mail.app.
 */
@Entity("apple_mail_message_refs")
@Index(["userId", "messageId"], { unique: true })
@Index(["userId", "appleId"])
export class AppleMailMessageRef {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "RFC-822 message ID (matches emails.messageId)" })
  messageId: string;

  @Column({ type: "bigint", comment: "Mail.app numeric message id" })
  appleId: string;

  @Column({ comment: "Mail.app account name that owns the message" })
  accountName: string;

  @CreateDateColumn()
  createdAt: Date;
}
