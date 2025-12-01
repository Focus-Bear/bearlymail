import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

/**
 * Temporary table for storing emails during the historical scan process.
 * Emails are stored here during scanning, then analyzed and rules are created,
 * then deleted. This keeps scan data separate from the main emails table.
 */
@Entity('scan_emails')
@Index(['userId', 'receivedAt'])
@Index(['userId', 'messageId'])
export class ScanEmail {
  @PrimaryGeneratedColumn('uuid')
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

  @Column('text', { transformer: encryptedColumnTransformer })
  body: string;

  @Column('text', { nullable: true, transformer: encryptedColumnTransformer })
  htmlBody: string;

  @Column({ type: 'int', default: 0 })
  starCount: number; // 0 = not starred, 1-3 = priority level

  @CreateDateColumn()
  receivedAt: Date;

  @Column({ default: false })
  isRead: boolean;

  // Fields for analysis - populated during scan from Gmail labels/threads
  @Column({ nullable: true })
  timeToReply: number; // Hours to reply (calculated from thread)

  @Column({ default: false })
  isArchived: boolean; // Whether user archived this email (from Gmail labels)

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date; // When it was archived (estimated from receivedAt if archived)

  @Column({ default: false })
  wasRepliedTo: boolean; // Whether user replied to this email (check thread)
}

