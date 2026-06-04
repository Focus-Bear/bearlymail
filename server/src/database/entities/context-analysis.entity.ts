import { randomUUID } from "crypto";
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/**
 * Tracks context analysis runs for users.
 * Each analysis run processes email threads and generates context insights.
 * This table allows multiple server instances to track progress independently.
 */
@Entity("context_analyses")
// For querying active analyses
@Index(["userId", "status"])
// For querying recent analyses
@Index(["userId", "createdAt"])
export class ContextAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: ["pending", "running", "completed", "failed"],
    default: "pending",
  })
  status: "pending" | "running" | "completed" | "failed";

  @Column({ nullable: true })
  progress: number;
  // 0-100

  @Column({ nullable: true })
  total: number;
  // Total steps (usually 100)

  @Column({ nullable: true })
  threadCount: number;
  // Total threads being analyzed

  @Column({ nullable: true })
  analyzedCount: number;
  // How many threads analyzed so far

  // Separate columns for fetching progress to avoid race conditions with batch processors
  @Column({ type: "varchar", nullable: true })
  fetchingStatus: string | null;

  @Column({ type: "integer", default: 0 })
  fetchedGeneralCount: number;

  @Column({ type: "integer", default: 0 })
  fetchedSentCount: number;

  @Column({
    type: "jsonb",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("context_analyses.stats"),
  })
  stats: {
    // Core statistics (set during finalization)
    totalThreads?: number;
    outboundEmails?: number;
    threadsNeverOpened?: number;
    threadsReadButNotReplied?: number;
    vipContactsEvaluated?: number;
    // Batch processing properties
    batchResults?: Record<string, unknown>;
    failedBatches?: number[];
    batchJobIds?: Record<number, string>;
    batchPayloadsForRetry?: Record<number, unknown>;
    totalBatches?: number;
    uniqueThreads?: number;
    // Allow additional properties
    [key: string]: unknown;
  } | null;

  @Column("text", { nullable: true })
  errorMessage: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  @Index()
  correlationId: string | null;

  @BeforeInsert()
  generateCorrelationId() {
    if (!this.correlationId) {
      this.correlationId = randomUUID();
    }
  }

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
