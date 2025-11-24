import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('emails')
@Index(['userId', 'priorityScore'])
@Index(['userId', 'threadId'])
export class Email {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  threadId: string;

  @Column()
  messageId: string;

  @Column()
  from: string;

  @Column({ nullable: true })
  fromName: string;

  @Column({ nullable: true })
  senderJobTitle: string;

  @Column()
  subject: string;

  @Column('text')
  body: string;

  @Column('text', { nullable: true })
  htmlBody: string;

  @Column({ type: 'float', default: 50 })
  priorityScore: number;

  @Column({ default: false })
  isUrgent: boolean;

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

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  receivedAt: Date;

  @ManyToOne(() => User, (user) => user.emails)
  @JoinColumn({ name: 'userId' })
  user: User;
}

