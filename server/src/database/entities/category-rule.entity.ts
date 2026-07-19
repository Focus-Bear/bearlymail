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
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
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

/**
 * v2: each positive condition supports multiple matching options (OR within,
 * AND across). The optional `*NotContainsAny` arrays are EXCLUSIONS — a rule
 * fails to match if ANY of the listed phrases is present in the corresponding
 * field. Empty/missing exclusion arrays mean "no exclusions" (issue #1789).
 */
export type CompositeCategoryRuleSpecV2 = {
  v: 2;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  /** Phrases that, if any are present in the subject, disqualify the rule. */
  subjectNotContainsAny?: string[];
  /** Phrases that, if any are present in the body, disqualify the rule. */
  bodyNotContainsAny?: string[];
};

/**
 * v3: renamed `senderMatchesAny` → `fromMatchesAny` to match the priority
 * classification model input format (issue #1975). Adds optional fields for
 * read status, attachment, and received/read time conditions.
 */
export type CompositeCategoryRuleSpecV3 = {
  v: 3;
  fromMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny?: string[];
  bodyNotContainsAny?: string[];
  emailIsRead?: boolean;
  emailAttachment?: Record<string, string>;
  emailReceived?: string;
  emailRead?: string;
};

/** Union of all supported composite rule spec versions. */
export type CompositeCategoryRuleSpec =
  | CompositeCategoryRuleSpecV1
  | CompositeCategoryRuleSpecV2
  | CompositeCategoryRuleSpecV3;

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

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("category_rules.categoryName"),
  })
  categoryName: string;

  /**
   * FK to `user_contexts.contextId` (EMAIL_CATEGORY). Source of truth for
   * category matching — replaces name-based lookup so renames don't break rules.
   * SET NULL on delete so the rule is not lost if the category is deleted.
   * Null on legacy rows that predate the migration (treated as orphaned/skipped).
   */
  @Column({ type: "uuid", nullable: true })
  categoryId: string | null;

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

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("category_rules.pattern"),
  })
  pattern: string | null;

  @Column({ nullable: true })
  patternHash: string | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("category_rules.subjectPrefix"),
  })
  subjectPrefix: string | null;

  @Column({
    type: "enum",
    enum: ["legacy", "composite"],
    default: "legacy",
  })
  ruleKind: CategoryRuleKind;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedJsonTransformer("category_rules.compositeSpec"),
  })
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
