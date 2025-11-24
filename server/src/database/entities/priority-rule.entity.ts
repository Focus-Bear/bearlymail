import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from './user.entity';

export enum RuleType {
  IMPLICIT_BEHAVIOR = 'IMPLICIT_BEHAVIOR',
  EXPLICIT_SENDER = 'EXPLICIT_SENDER',
}

@Entity('priority_rules')
export class PriorityRule {
  @PrimaryGeneratedColumn()
  ruleId: number;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: RuleType,
  })
  ruleType: RuleType;

  @Column()
  conditionKey: string;

  @Column()
  conditionVal: string;

  @Column()
  priorityBoost: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.priorityRules)
  @JoinColumn({ name: 'userId' })
  user: User;
}

