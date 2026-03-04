import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { encryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("summarization_rules")
export class SummarizationRule {
  @PrimaryGeneratedColumn("uuid")
  ruleId: string;

  @Column()
  userId: string;

  @Column({
    type: "text",
    transformer: encryptedColumnTransformer,
    comment: 'Plain text: "when the rule is used?"',
  })
  whenToUse: string;

  @Column({
    type: "text",
    transformer: encryptedColumnTransformer,
    comment: 'Plain text: "how to summarise?"',
  })
  howToSummarize: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.summarizationRules, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;
}
