import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("summarization_rules")
export class SummarizationRule {
  @PrimaryGeneratedColumn("uuid")
  ruleId: string;

  @Column()
  userId: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer(
      "summarization_rules.whenToUse",
    ),
    comment:
      'Plain text: human-readable rule name / "when to use?" description',
  })
  whenToUse: string;

  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer(
      "summarization_rules.howToSummarize",
    ),
    comment: 'Plain text: "how to summarise?" custom prompt instructions',
  })
  howToSummarize: string;

  /**
   * Glob / regex / substring patterns matched against the sender address.
   * Empty array = match any sender.
   * Examples: ["*@github.com", "noreply@linear.app", "/JIRA-\\d+/i"]
   *
   * Column name uses snake_case to match migration 1778000000000.
   */
  @Column("text", { name: "from_patterns", array: true, default: "{}" })
  fromPatterns: string[];

  /**
   * Glob / regex / substring patterns matched against the email subject.
   * Empty array = match any subject.
   * Examples: ["[Pull Request]", "invoice", "/URGENT/i"]
   *
   * Column name uses snake_case to match migration 1778000000000.
   */
  @Column("text", { name: "subject_patterns", array: true, default: "{}" })
  subjectPatterns: string[];

  /**
   * Lower number = higher priority. Rules are sorted ascending before matching;
   * first match wins. Use 0 for highest-priority rules, higher numbers for
   * catch-all fallbacks.
   */
  @Column({ type: "int", default: 0 })
  priority: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.summarizationRules, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;
}
