import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { User } from "./user.entity";

export type CategoryRuleType =
  | "exact_sender"
  | "sender_domain"
  | "subject_prefix"
  | "sender_domain_and_subject_prefix";

export type CategoryRuleKind = "legacy" | "composite";

/** Encrypted JSON at rest; decrypted shape for v1 (legacy — single sender/subject). */
export type CompositeCategoryRuleSpecV1 = {
  v: 1;
  sender: string;
  subjectContains: string;
  bodyContainsAny: string[];
};

/** v2: each condition supports multiple matching options (OR within, AND across). */
export type CompositeCategoryRuleSpecV2 = {
  v: 2;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
};

/** Union of all supported composite rule spec versions. */
export type CompositeCategoryRuleSpec =
  | CompositeCategoryRuleSpecV1
  | CompositeCategoryRuleSpecV2;

/**
 * Deterministic category rules: legacy hash-based (auto-generated) or composite
 * (user-defined sender + subject + body OR phrases).
 */
@Entity("category_rules")
@Index(["userId", "isEnabled"])
export class CategoryRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column("text", { transformer: encryptedColumnTransformer })
  categoryName: string;

  @Column({
    type: "enum",
    enum: [
      "exact_sender",
      "sender_domain",
      "subject_prefix",
      "sender_domain_and_subject_prefix",
    ],
    nullable: true,
  })
  ruleType: CategoryRuleType | null;

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
  pattern: string | null;

  @Column({ nullable: true })
  patternHash: string | null;

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
  subjectPrefix: string | null;

  @Column({
    type: "enum",
    enum: ["legacy", "composite"],
    default: "legacy",
  })
  ruleKind: CategoryRuleKind;

  @Column("text", { nullable: true, transformer: encryptedJsonTransformer })
  compositeSpec: CompositeCategoryRuleSpec | null;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ default: 0 })
  hitCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
