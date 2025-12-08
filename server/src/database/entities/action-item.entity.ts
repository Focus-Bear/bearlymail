import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Email } from './email.entity';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

@Entity('action_items')
@Index(['userId', 'isCompleted']) // For querying active tasks
export class ActionItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  emailId: string;

  @Column({ nullable: true })
  emailThreadId: string; // Denormalized for easy thread access

  @Column('text', { transformer: encryptedColumnTransformer })
  description: string;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'text', default: 'user' }) // 'user' or 'llm'
  source: string;

  @Column({ type: 'float', nullable: true })
  confidenceScore: number; // For LLM suggestions

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Email)
  @JoinColumn({ name: 'emailId' })
  email: Email;
}




