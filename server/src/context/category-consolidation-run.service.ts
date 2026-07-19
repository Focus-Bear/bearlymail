import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { In, Not, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import {
  CategoryConsolidationRun,
  ConsolidationRunResult,
} from "../database/entities/category-consolidation-run.entity";
import { getJobPriority } from "../queue/job-priorities";
import {
  CategoryConsolidationService,
  ConsolidationResult,
} from "./category-consolidation.service";

/**
 * Owns the lifecycle of a background "Consolidate Categories" run: enqueues the
 * job, executes it in the worker, and records the outcome on a
 * {@link CategoryConsolidationRun} row the UI polls. Kept separate from
 * {@link CategoryConsolidationService} so the consolidation logic stays free of
 * queue/persistence concerns.
 */
@Injectable()
export class CategoryConsolidationRunService {
  private readonly logger = new Logger(CategoryConsolidationRunService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(CategoryConsolidationRun)
    private readonly runRepository: Repository<CategoryConsolidationRun>,
    private readonly consolidationService: CategoryConsolidationService,
  ) {}

  /**
   * Creates a pending run and enqueues the background job. Returns the run id
   * the client polls. A per-user singleton key collapses rapid double-clicks
   * into a single in-flight run.
   */
  async enqueue(
    userId: string,
  ): Promise<{ runId: string; status: CategoryConsolidationRun["status"] }> {
    const run = await this.runRepository.save(
      this.runRepository.create({ userId, status: "pending" }),
    );

    const jobId = await this.boss.send(
      JOB_NAMES.CONSOLIDATE_CATEGORIES,
      { userId, runId: run.id },
      {
        priority: getJobPriority(JOB_NAMES.CONSOLIDATE_CATEGORIES, true),
        singletonKey: `consolidate-categories-${userId}`,
        singletonSeconds: SECONDS.MINUTE,
      },
    );

    // A null id means a run is already in flight for this user (singleton).
    // Drop the orphan we just created and point the client at the live run so
    // it never polls a row no worker will ever process.
    if (!jobId) {
      const inflight = await this.runRepository.findOne({
        where: { userId, id: Not(run.id), status: In(["pending", "running"]) },
        order: { createdAt: "DESC" },
      });
      await this.runRepository.delete(run.id);
      if (inflight) {
        this.logger.log(
          `[CATEGORY-CONSOLIDATION] Reused in-flight run ${inflight.id} for user ${userId}`,
        );
        return { runId: inflight.id, status: inflight.status };
      }

      // The job was deduped but the original in-flight run finished (and was
      // cleaned up) between the send and this lookup. We just deleted our
      // orphan, so there is no valid run to return. Signal a retry rather than
      // hand back a dangling id the client would poll into 404s.
      throw new ConflictException(
        "Another consolidation just finished. Please try again shortly.",
      );
    }

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Enqueued run ${run.id} for user ${userId} (job ${jobId ?? "deduped"})`,
    );
    return { runId: run.id, status: run.status };
  }

  /** Returns the run if it belongs to the user, else null. */
  async getRun(
    userId: string,
    runId: string,
  ): Promise<CategoryConsolidationRun | null> {
    return this.runRepository.findOne({ where: { id: runId, userId } });
  }

  /**
   * Worker entry point: runs the consolidation and records the outcome on the
   * run row. Never re-throws for an "expected" empty result — only genuine
   * failures mark the run failed (and re-throw so PgBoss retries).
   */
  async execute(runId: string, userId: string): Promise<void> {
    await this.runRepository.update(runId, { status: "running" });
    try {
      const result = await this.consolidationService.consolidate(userId);
      await this.runRepository.update(runId, {
        status: "completed",
        result: this.toRunResult(result),
        error: null,
      });
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Run ${runId} completed for user ${userId}: ` +
          `${result.originalCount} -> ${result.consolidatedCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.runRepository.update(runId, {
        status: "failed",
        error: message,
      });
      this.logger.error(
        `[CATEGORY-CONSOLIDATION] Run ${runId} failed for user ${userId}: ${message}`,
      );
      throw error;
    }
  }

  private toRunResult(result: ConsolidationResult): ConsolidationRunResult {
    return {
      originalCount: result.originalCount,
      consolidatedCount: result.consolidatedCount,
      mergedCount: result.mergedGroups.reduce(
        (sum, group) => sum + group.merged.length,
        0,
      ),
      prunedCount: result.prunedCategories.length,
      mergedGroups: result.mergedGroups.map((group) => ({
        survivor: group.survivor,
        merged: group.merged,
        family: group.family,
        method: group.method,
      })),
      prunedCategories: result.prunedCategories,
    };
  }
}
