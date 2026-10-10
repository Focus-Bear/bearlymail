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

import type {
  GithubActorKind,
  GithubItemState,
} from "../../constants/github-notification.constants";
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
  /**
   * Structural condition for uniform-notification platforms: require the email
   * to belong to a specific notification sub-stream (e.g. `github:pr`,
   * `atlassian:tag:proj-#`). Resolved generically by the notification-subtype
   * util from the shared `PLATFORM_PINNING` registry (GitHub PR/issue is the
   * first concrete case). Set automatically when a rule is auto-generated for a
   * sender whose sub-stream can be resolved, so overlapping sub-categories from
   * one sender are separated by the sub-stream rather than brittle phrase
   * exclusions. Undefined = no constraint.
   */
  notificationSubtype?: string;
  /**
   * SET form of the structural condition: the email's resolved subtype must
   * equal or refine ANY listed member (OR within). Lets one rule cover several
   * fine GitHub sub-streams — e.g. a human "PR updates" rule pinned to
   * `github:pr:comment:human`, `github:pr:push:human` and
   * `github:pr:review_approved:human` while excluding bot/merged/review-request
   * streams. Read together with `notificationSubtype` (union); the normaliser
   * stores a single subtype in `notificationSubtype` and two or more here.
   */
  notificationSubtypeAny?: string[];
  /**
   * GitHub-metadata structural conditions, evaluated against the thread's
   * fetched `githubMetadata` for the PR/issue the email is about (see
   * `GithubCategorySignals`). Each is "no constraint" when absent; a present
   * condition can never be satisfied by an email whose thread has no fetched
   * metadata. `githubStateAny` pins the item's lifecycle state (open / closed /
   * merged); `githubProjectStatusAny` pins the GitHub Projects board status
   * (case-insensitive, optionally scoped to one project); `githubAuthorKind`
   * pins whether the PR/issue was AUTHORED by a bot or a human (distinct from
   * the notification's actor, which lives in the subtype); `githubLabelsAny`
   * requires any of the listed labels (case-insensitive).
   */
  githubStateAny?: GithubItemState[];
  githubProjectStatusAny?: GithubProjectStatusCondition[];
  githubAuthorKind?: GithubActorKind;
  githubLabelsAny?: string[];
};

/** One pinned GitHub Projects board status, optionally scoped to a project. */
export type GithubProjectStatusCondition = {
  /** Board "Status" field value, e.g. "QA passed"; matched case-insensitively. */
  status: string;
  /** Project (board) title; when set the status must come from that board. */
  project?: string;
};

/** Union of all supported composite rule spec versions. */
export type CompositeCategoryRuleSpec =
  | CompositeCategoryRuleSpecV1
  | CompositeCategoryRuleSpecV2
  | CompositeCategoryRuleSpecV3;

/**
 * Outcome of the strong-model sanity review an AUTO-generated composite rule
 * passed before it was persisted (encrypted JSON at rest). Null for rules a
 * person authored, for rules created before the review existed, and when the
 * review was unavailable (disabled / LLM error) and the rule was created
 * unchecked. Rejected candidates are never persisted, so a stored verdict is
 * always "accept" or "revise".
 */
export type CategoryRuleSanityCheck = {
  verdict: "accept" | "revise";
  /** Reviewer confidence in the verdict, 0–1. */
  confidence: number;
  reason: string;
  /** Model that produced the verdict. */
  model: string;
  /** ISO timestamp of the review. */
  checkedAt: string;
  /** True when the persisted spec is the reviewer's revision, not the original candidate. */
  revised: boolean;
};

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

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedJsonTransformer("category_rules.sanityCheck"),
  })
  sanityCheck: CategoryRuleSanityCheck | null;

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
