import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";

/**
 * The summary a finished consolidation run hands back to the UI: how many
 * categories were merged/pruned and which. Mirrors the service's
 * `ConsolidationResult`, minus the (potentially large) full category list.
 */
export interface ConsolidationRunResult {
  originalCount: number;
  consolidatedCount: number;
  mergedCount: number;
  prunedCount: number;
  mergedGroups: Array<{
    survivor: string;
    merged: string[];
    family: string;
    method: "exact-name" | "semantic";
  }>;
  prunedCategories: Array<{
    name: string;
    reason: "never-used" | "rarely-used";
  }>;
}

/**
 * Tracks a single background "Consolidate Categories" run so the web request can
 * return immediately and the UI can poll for completion. The heavy work (LLM
 * dedup, thread/rule re-pointing) runs in the worker, avoiding any gateway
 * timeout for users with many categories.
 */
@Entity("category_consolidation_runs")
@Index(["userId", "createdAt"])
export class CategoryConsolidationRun {
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

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer(
      "category_consolidation_runs.result",
    ),
  })
  result: ConsolidationRunResult | null;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
