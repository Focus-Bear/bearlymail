import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { PriorityRule } from './priority-rule.entity';
import { UserContext } from './user-context.entity';
import { PrivateNote } from './private-note.entity';
import { Email } from './email.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true })
  googleId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  googleCalendarAccessToken: string;

  @Column({ nullable: true })
  googleCalendarRefreshToken: string;

  @Column({ default: 6 })
  batchDeliveryHours: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => PriorityRule, (rule) => rule.user)
  priorityRules: PriorityRule[];

  @OneToMany(() => UserContext, (context) => context.user)
  contexts: UserContext[];

  @OneToMany(() => PrivateNote, (note) => note.user)
  notes: PrivateNote[];

  @OneToMany(() => Email, (email) => email.user)
  emails: Email[];
}

