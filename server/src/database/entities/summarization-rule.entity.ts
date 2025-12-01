import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { encryptedColumnTransformer } from '../../encryption/encryption.helper';

@Entity('summarization_rules')
export class SummarizationRule {
  @PrimaryGeneratedColumn('uuid')
  ruleId: string;

  @Column()
  userId: string;

  @Column('text', { transformer: encryptedColumnTransformer })
  whenToUse: string; // Plain text: "when the rule is used?"

  @Column('text', { transformer: encryptedColumnTransformer })
  howToSummarize: string; // Plain text: "how to summarise?"

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.summarizationRules)
  @JoinColumn({ name: 'userId' })
  user: User;
}

