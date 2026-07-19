import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

import { User } from "./user.entity";

/**
 * Tracks Lambda-dispatched email priority analysis runs.
 *
 * When USE_LAMBDA_PRIORITISATION=true, LLMPriorityBatchService creates one
 * record per REFINE_PRIORITY_BATCH job. The Lambda increments completed_batches
 * as each SQS batch finishes. PriorityAnalysisFinalizerService polls for stalled
 * runs and unlocks any threads that got stuck in isProcessingPriority=true.
 */
@Entity("priority_analysis_runs")
@Index(["userId", "status"])
@Index(["userId", "createdAt"])
export class PriorityAnalysisRun {
  /** Matches the analysisId embedded in the SQS payload. */
  @PrimaryColumn({ type: "uuid" })
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: ["running", "completed", "failed"],
    default: "running",
  })
  status: "running" | "completed" | "failed";

  @Column({ type: "integer" })
  totalBatches: number;

  @Column({ type: "integer", default: 0 })
  completedBatches: number;

  /**
   * EmailThread IDs whose isProcessingPriority flag was set for this run.
   * Used by the finalizer to unlock stuck threads if the Lambda never completes.
   */
  @Column({ type: "simple-json", nullable: true })
  threadIds: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
