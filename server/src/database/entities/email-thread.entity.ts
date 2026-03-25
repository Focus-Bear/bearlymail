import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { Email } from "./email.entity";
import { ProtoCategory } from "./proto-category.entity";
import { User } from "./user.entity";

@Entity("email_threads")
// One thread per user
@Index(["userId", "threadId"], { unique: true })
// For inbox filtering
@Index(["userId", "starCount", "isArchived"])
// For triage/process filtering
@Index(["userId", "isArchived", "starCount"])
// For urgency-based queries
@Index(["userId", "urgencyScore"])
// For priority-based sorting
@Index(["userId", "priorityScore"])
// For batch-status queries
@Index(["userId", "isBatched", "batchReleaseAt"])
@Index(["userId", "syncStatus", "syncStatusUpdatedAt"])
export class EmailThread {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ comment: "Gmail thread ID" })
  threadId: string;

  @Column({
    type: "int",
    default: 0,
    comment:
      "0 = not starred, 1 = low importance, 2 = medium importance, 3 = high importance",
  })
  starCount: number;

  @Column({ default: false })
  isArchived: boolean;

  @Column({
    type: "float",
    default: 0,
    comment: "0-100 urgency score determined by LLM",
  })
  urgencyScore: number;

  @Column({
    type: "float",
    default: 0,
    nullable: true,
    comment:
      "Denormalized priority score for efficient sorting (calculated from priorityExplanation breakdown)",
  })
  priorityScore: number | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "Explanation of why it's urgent",
  })
  urgencyExplanation: string | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "User override reason",
  })
  urgencyOverrideReason: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedJsonTransformer,
    comment: "Precomputed priority explanation (thread-level)",
  })
  priorityExplanation: {
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
      sentiment: { score: number; type: string; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
    // ISO timestamp when priority was last calculated
    calculatedAt?: string;
  } | null;

  @Column({
    default: false,
    comment:
      "Flag to indicate LLM priority is being calculated for this thread",
  })
  isProcessingPriority: boolean;

  @Column({
    type: "int",
    default: 0,
    comment:
      "Number of priority retry attempts made for this thread. Used to prevent infinite retry loops.",
  })
  priorityRetryCount: number;

  // GitHub issue/PR metadata
  @Column("text", { nullable: true, transformer: encryptedJsonTransformer })
  githubMetadata: {
    links: Array<{
      type: "issue" | "pr";
      repo: string;
      owner: string;
      number: number;
      url: string;
      status?: {
        state: string;
        title?: string;
        labels?: Array<{ name: string; color: string }>;
        assignees?: Array<{ login: string; avatar_url: string }>;
        project?: string;
        reviewStatus?: "approved" | "changes_requested" | "pending" | null;
        commentsCount?: number;
        mergeable?: boolean;
        merged?: boolean;
      };
      fetchedAt?: string;
    }>;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({
    type: "timestamp",
    nullable: true,
    comment: "Last time this thread was checked against Gmail",
  })
  lastCheckedAt: Date | null;

  @Column({ default: false })
  isSnoozed: boolean;

  @Column({ type: "timestamp", nullable: true })
  snoozeUntil: Date | null;

  @Column({
    default: false,
    comment: "Whether this thread is currently held in a batch window",
  })
  isBatched: boolean;

  @Column({
    type: "timestamp",
    nullable: true,
    comment:
      "When this batched thread will be released and visible in the inbox",
  })
  batchReleaseAt: Date | null;

  @Column({
    default: false,
    comment:
      "Whether this thread was delivered early (emergency) due to high priority outside batch window",
  })
  wasDeliveredEarly: boolean;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "Human-readable reason for the batching decision (e.g. 'Batched until 15:00', 'Schedule disabled', 'Emergency delivery')",
  })
  batchDecisionReason: string | null;

  @Column({
    type: "timestamp",
    nullable: true,
    comment:
      "Last time user performed an operation (archive, snooze, star) on this thread in BearlyMail. " +
      "Used to prevent sync from overriding user actions - sync should only update status if new emails arrived after this timestamp.",
  })
  lastUserOperationAt: Date | null;

  @Column({
    type: "varchar",
    default: "synced",
    comment:
      "Sync state for local thread changes. 'unsynced' means a recent user action has not yet been confirmed in the provider; during this window local state is authoritative.",
  })
  syncStatus: "synced" | "unsynced";

  @Column({
    type: "timestamp",
    nullable: true,
    comment: "When syncStatus was last changed",
  })
  syncStatusUpdatedAt: Date | null;

  @Column({
    type: "timestamp",
    nullable: true,
    comment:
      "Last time an auto-response was sent for this thread. Used to prevent Gmail sync from " +
      "archiving threads that were recently auto-responded to — sync should not override " +
      "the thread's inbox visibility for at least 24h after an auto-response.",
  })
  lastAutoRespondedAt: Date | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment:
      "Explanation of why this category was chosen (especially useful for Other)",
  })
  categoryExplanation: string | null;

  @Column({
    type: "uuid",
    nullable: true,
    comment:
      "Proto category ID for emails in Other that have a proto category suggestion",
  })
  protoCategoryId: string | null;

  @ManyToOne(() => ProtoCategory, { nullable: true })
  @JoinColumn({ name: "protoCategoryId" })
  protoCategory: ProtoCategory | null;

  @Column({
    type: "uuid",
    nullable: true,
    name: "categoryId",
    comment:
      "UUID of the UserContext (EMAIL_CATEGORY) that owns this thread. " +
      "Single source of truth for thread categorization (fixes #1293). " +
      "NULL means 'Other' (uncategorized).",
  })
  categoryId: string | null;

  @Column({
    type: "timestamp",
    nullable: true,
    comment:
      "Last time a thread summary was successfully generated by the LLM. " +
      "Used for staleness detection — when a new email arrives after this timestamp, " +
      "the thread summary should be regenerated.",
  })
  lastSummarizedAt: Date | null;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /**
   * The org member this thread is assigned to for triage/response.
   * NULL means unassigned. Set NULL on delete to prevent data loss if the
   * assignee leaves the platform.
   *
   * Part of Batch B — team thread assignment (#1112).
   */
  @Column({
    type: "uuid",
    nullable: true,
    comment: "Assigned team member user ID (null = unassigned)",
  })
  assigneeId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assigneeId" })
  assignee: User | null;

  @OneToMany(() => Email, (email) => email.thread)
  emails: Email[];
}
