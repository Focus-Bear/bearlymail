import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { EmailThread } from './email-thread.entity';
import { encryptedColumnTransformer, encryptedJsonTransformer } from '../../encryption/encryption.helper';

@Entity('emails')
@Index(['userId', 'priorityScore'])
@Index(['userId', 'threadId'])
@Index(['userId', 'messageId']) // For fast lookups by messageId
@Index(['userId', 'receivedAt']) // For date-based queries in inbox
@Index(['threadId']) // For joining with email_threads
@Index(['userId', 'emailThreadId']) // For inbox queries (getInbox)
@Index(['emailThreadId']) // For thread lookups
@Index(['userId', 'isBatched', 'batchReleaseAt']) // For batch-status queries (getNextBatchReleaseTime)
export class Email {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  threadId: string; // Gmail thread ID (for reference, but use emailThreadId for FK)

  @Column({ nullable: true })
  emailThreadId: string; // Foreign key to email_threads table

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

  @Column({ type: 'float', default: 50 })
  priorityScore: number;

  @Column({ default: false })
  isUrgent: boolean;

  // Thread-level properties moved to EmailThread entity
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

  @Column({ default: false })
  isRead: boolean;

  @Column('text', { nullable: true, transformer: encryptedColumnTransformer })
  summary: string; // Cached summary from LLM

  @Column('text', { nullable: true, transformer: encryptedJsonTransformer })
  labels: string[]; // JSON stringified list of labels

  @Column('text', { nullable: true, transformer: encryptedJsonTransformer })
  priorityExplanation: {
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  } | null; // Precomputed priority explanation

  @Column({ default: false })
  isProcessingPriority: boolean; // Flag to indicate LLM priority is being calculated

  @Column({ default: false })
  isProcessingSummary: boolean; // Flag to indicate summary is being generated

  @CreateDateColumn()
  receivedAt: Date;

  @ManyToOne(() => User, (user) => user.emails)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => EmailThread, (thread) => thread.emails)
  @JoinColumn({ name: 'emailThreadId' })
  thread: EmailThread;
}
