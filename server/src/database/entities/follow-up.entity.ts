import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { EmailThread } from './email-thread.entity';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

export enum FollowUpStatus {
  AWAITING_REPLY = 'awaiting_reply', // Waiting for the other party to reply
  FOLLOW_UP_DUE = 'follow_up_due',   // Follow-up time has passed, needs action
  COMPLETED = 'completed',           // Got a reply or manually marked complete
  CANCELLED = 'cancelled',           // User cancelled the follow-up
}

@Entity('follow_ups')
@Index(['userId', 'status'])
@Index(['userId', 'followUpDueAt'])
export class FollowUp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  threadId: string; // Gmail thread ID

  @Column({ nullable: true })
  emailThreadId: string; // FK to email_threads

  @ManyToOne(() => EmailThread)
  @JoinColumn({ name: 'emailThreadId' })
  emailThread: EmailThread;

  @Column({ nullable: true })
  sentEmailId: string; // The email ID that was sent (triggering the follow-up)

  @Column({
    type: 'varchar',
    default: FollowUpStatus.AWAITING_REPLY,
  })
  status: FollowUpStatus;

  // When the user expects a reply by
  @Column()
  followUpDueAt: Date;

  // Number of days user set for follow-up
  @Column()
  followUpDays: number;

  // Last email from the other party (for context in follow-up drafts)
  @Column('text', { nullable: true, transformer: encryptedColumnTransformer })
  lastTheirReply: string;

  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  lastTheirReplyFrom: string;

  @Column({ nullable: true })
  lastTheirReplyAt: Date;

  // Last email from the user (for context in follow-up drafts)
  @Column('text', { nullable: true, transformer: encryptedColumnTransformer })
  lastMyReply: string;

  @Column({ nullable: true })
  lastMyReplyAt: Date;

  // Generated follow-up draft (can be edited by user)
  @Column('text', { nullable: true, transformer: encryptedColumnTransformer })
  draftFollowUp: string;

  // Subject line for the thread
  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  subject: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}




