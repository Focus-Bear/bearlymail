import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Index, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Email } from './email.entity';

@Entity('email_threads')
@Index(['userId', 'threadId'], { unique: true }) // One thread per user
@Index(['userId', 'starCount', 'isArchived']) // For inbox filtering
@Index(['userId', 'isArchived', 'starCount']) // For triage/process filtering
export class EmailThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  threadId: string; // Gmail thread ID

  @Column({ type: 'int', default: 0 })
  starCount: number; // 0 = not starred, 1 = low importance, 2 = medium importance, 3 = high importance

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Email, (email) => email.thread)
  emails: Email[];
}

