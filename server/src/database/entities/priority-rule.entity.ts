import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

export enum RuleType {
  IMPLICIT_BEHAVIOR = 'IMPLICIT_BEHAVIOR',
  EXPLICIT_SENDER = 'EXPLICIT_SENDER',
}

@Entity('priority_rules')
export class PriorityRule {
  @PrimaryGeneratedColumn('uuid')
  ruleId: string;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: RuleType,
  })
  ruleType: RuleType;

  @Column({ transformer: encryptedColumnTransformer })
  conditionKey: string;

  @Column({ transformer: encryptedColumnTransformer })
  conditionVal: string;

  @Column()
  priorityBoost: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.priorityRules)
  @JoinColumn({ name: 'userId' })
  user: User;
}

