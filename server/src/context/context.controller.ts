import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CONTEXT_ANALYSIS_STATUS } from "../constants/domain-statuses";
import { ANALYSIS_PROGRESS_STAGES } from "../constants/domain-types";
import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { PERCENTAGES } from "../constants/percentages";
import { MINUTES_PER_HOUR } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { User } from "../database/entities/user.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { CategoryConsolidationRunService } from "./category-consolidation-run.service";
import { ContextService } from "./context.service";

type ProgressStage =
  | "starting"
  | "fetching"
  | "analyzing"
  | "summarizing"
  | "complete";

interface ProgressInfo {
  status?: string;
  errorMessage?: string;
  completedBatches?: number;
  totalBatches?: number;
  fetchedGeneral?: number;
  fetchedSent?: number;
  threadCount?: number;
  analyzedCount?: number;
  stats?: Record<string, unknown>;
  insights?: unknown;
}

@Controller("context")
@UseGuards(JwtAuthGuard)
export class ContextController {
  private readonly logger = new Logger(ContextController.name);

  constructor(
    private readonly contextService: ContextService,
    private readonly usersService: UsersService,
    private readonly consolidationRunService: CategoryConsolidationRunService,
    @InjectRepository(ContextAnalysis)
    private readonly contextAnalysisRepository: Repository<ContextAnalysis>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  async getContext(@Request() req) {
    return this.contextService.getUserContext(req.user.userId);
  }

  @Get("analyze-progress")
  @SkipThrottle({ default: true, feedback: true })
  @Throttle({ polling: {} })
  async getAnalyzeProgress(
    @Request() req,
    @Query("analysisId") analysisId?: string,
  ) {
    const user = await this.usersService.findOne(req.user.userId);
    if (!user) {
      return { progress: null, error: null };
    }

    // Get progress info - filter by analysis ID if provided
    const progressInfo = await this.contextService.getAnalysisProgress(
      req.user.userId,
      // Pass analysis ID to filter
      analysisId,
    );

    // Check and sync jobs between DB and PgBoss for active analyses
    if (
      progressInfo.status === CONTEXT_ANALYSIS_STATUS.RUNNING ||
      progressInfo.status === CONTEXT_ANALYSIS_STATUS.PENDING
    ) {
      await this.contextService.checkAndSyncJobs(req.user.userId, analysisId);
    }

    // If no active analysis, return null (not complete, just no analysis running)
    if (!progressInfo.status) {
      return { progress: null, error: null };
    }

    // Check if analysis failed
    if (progressInfo.status === CONTEXT_ANALYSIS_STATUS.FAILED) {
      return {
        progress: null,
        error:
          progressInfo.errorMessage || "Analysis failed. Please try again.",
      };
    }

    const { percent, stage } = this.calculateProgressPercent(
      progressInfo,
      user,
    );

    const {
      threadCount,
      analyzedCount,
      stats,
      completedBatches,
      totalBatches,
      insights,
    } = progressInfo;

    // Debug logging
    if (percent >= PERCENTAGES.TWENTY_FIVE && percent < PERCENTAGES.SEVENTY) {
      this.logger.log(
        `[PROGRESS-DEBUG] userId=${req.user.userId}, percent=${percent}, threadCount=${threadCount}, analyzedCount=${analyzedCount}, completedBatches=${completedBatches}, totalBatches=${totalBatches}`,
      );
    }

    const { messageKey, messageValues } = this.buildProgressMessage(
      stage,
      progressInfo,
    );

    // Always include stats if available (not just at 100%)
    // This ensures the frontend can display the summary even if isComplete check fails
    const finalStats = stats || progressInfo.stats;

    // Log for debugging
    const isActuallyComplete =
      progressInfo.status === CONTEXT_ANALYSIS_STATUS.COMPLETED;
    if (percent >= 100) {
      this.logger.log(
        `[PROGRESS-DEBUG] Completion check: userId=${req.user.userId}, percent=${percent}, status=${progressInfo.status}, isActuallyComplete=${isActuallyComplete}, stats=${finalStats ? "YES" : "NO"}, threadCount=${threadCount}, analyzedCount=${analyzedCount}`,
      );
    }

    // Include findings in response if available
    const findings = (finalStats?.findings as string[]) || undefined;

    return {
      progress: {
        // Use calculated percent, not user.scanProgress
        current: percent,
        // Total is always 100 for percentage
        total: 100,
        messageKey,
        messageValues,
        threadCount,
        analyzedCount,
        batchStatus:
          totalBatches !== undefined && completedBatches !== undefined
            ? {
                completedBatches,
                totalBatches,
              }
            : undefined,
        // Always include stats when available
        stats: finalStats,
        // Include findings for display
        findings,
        // Include insights for display
        insights,
      },
      error: null,
    };
  }

  /**
   * Calculate the displayed progress percentage and stage label from the current analysis state.
   *
   * Expected flow:
   * - Starting/Fetching: 0-10%  (before batches are created)
   * - Analyzing:        10-70%  (during batch processing)
   * - Summarizing:      70-99%  (after all batches complete, during finalization)
   * - Complete:         100%    (status == "completed")
   */
  private calculateProgressPercent(
    progressInfo: ProgressInfo,
    user: { scanProgress?: number | null; scanTotal?: number | null },
  ): { percent: number; stage: ProgressStage } {
    if (progressInfo.status === CONTEXT_ANALYSIS_STATUS.COMPLETED) {
      return { percent: 100, stage: "complete" };
    }

    const isStillRunning =
      progressInfo.status === CONTEXT_ANALYSIS_STATUS.RUNNING ||
      progressInfo.status === CONTEXT_ANALYSIS_STATUS.PENDING;

    if (isStillRunning) {
      return this.calcRunningPercent(progressInfo);
    }

    if (
      user.scanProgress !== null &&
      user.scanProgress !== undefined &&
      user.scanTotal !== null &&
      user.scanTotal !== undefined
    ) {
      // For completed/failed analyses that slipped through, use user.scanProgress
      const percent = Math.floor((user.scanProgress / user.scanTotal) * 100);
      return { percent, stage: percent >= 100 ? "complete" : "summarizing" };
    }

    return { percent: 0, stage: "starting" };
  }

  /**
   * Calculate percent/stage when the analysis is currently running or pending.
   * Covers the fetching (0-10%), analyzing (10-70%), and summarizing (70-99%) sub-stages.
   */
  private calcRunningPercent(progressInfo: ProgressInfo): {
    percent: number;
    stage: ProgressStage;
  } {
    const { completedBatches, totalBatches, fetchedGeneral, fetchedSent } =
      progressInfo;
    const hasCompletedBatches =
      completedBatches !== undefined && completedBatches > 0;

    if (
      (totalBatches === undefined || totalBatches === 0) &&
      !hasCompletedBatches
    ) {
      return this.calcFetchingPercent(fetchedGeneral, fetchedSent);
    }

    if (
      totalBatches !== undefined &&
      totalBatches > 0 &&
      completedBatches !== undefined &&
      completedBatches >= totalBatches &&
      completedBatches > 0
    ) {
      // All batches complete but analysis not finished - summarizing stage (70-99%)
      return {
        percent: CONTEXT_ANALYSIS.PROGRESS_THRESHOLD,
        stage: "summarizing",
      };
    }

    // Batches are processing - analyzing stage (10-70%)
    const completed = completedBatches !== undefined ? completedBatches : 0;
    const batchPercent =
      totalBatches !== undefined && totalBatches > 0
        ? completed / totalBatches
        : 0;
    // Map batch completion (0-100%) to displayed range (10-70%)
    const percent = Math.floor(10 + batchPercent * MINUTES_PER_HOUR);

    this.logger.log(
      `[PROGRESS-CALC] Stage: analyzing, percent: ${percent}%, batches: ${completedBatches || 0}/${totalBatches || "unknown"}, fetched: general=${fetchedGeneral || 0}, sent=${fetchedSent || 0}, status=${progressInfo.status}`,
    );

    return { percent, stage: "analyzing" };
  }

  /**
   * Calculate percent for the fetching sub-stage (0-10%), based on how many emails have been fetched.
   */
  private calcFetchingPercent(
    fetchedGeneral: number | undefined,
    fetchedSent: number | undefined,
  ): { percent: number; stage: ProgressStage } {
    if (fetchedGeneral !== undefined || fetchedSent !== undefined) {
      const totalFetched = (fetchedGeneral || 0) + (fetchedSent || 0);
      // 0-10% range
      const fetchPercent = Math.min(
        (totalFetched / CONTEXT_ANALYSIS.CONTEXT_TIMEOUT_SECONDS) * 10,
        10,
      );
      // Minimum 1% to show progress, never 0%
      return {
        percent: Math.max(1, Math.floor(fetchPercent)),
        stage: "fetching",
      };
    }
    // Minimum 1% while starting (not 0% or 5%)
    return { percent: 1, stage: "fetching" };
  }

  /**
   * Build the i18n message key and interpolation values for the given progress stage.
   */
  private buildProgressMessage(
    stage: ProgressStage,
    progressInfo: ProgressInfo,
  ): { messageKey: string; messageValues: Record<string, unknown> } {
    const {
      completedBatches,
      totalBatches,
      fetchedGeneral,
      fetchedSent,
      threadCount,
      analyzedCount,
      stats,
    } = progressInfo;

    switch (stage) {
      case ANALYSIS_PROGRESS_STAGES.STARTING:
        return {
          messageKey: "settings.analysis.progress.starting",
          messageValues: {},
        };

      case ANALYSIS_PROGRESS_STAGES.FETCHING:
        return {
          messageKey: "settings.analysis.progress.fetching",
          messageValues: {
            generalCount: fetchedGeneral || 0,
            sentCount: fetchedSent || 0,
          },
        };

      case ANALYSIS_PROGRESS_STAGES.ANALYZING:
        return {
          messageKey: "settings.analysis.progress.analyzing",
          messageValues: {
            analyzed: analyzedCount || 0,
            total: threadCount || 0,
            completedBatches: completedBatches || 0,
            totalBatches: totalBatches || 0,
          },
        };

      case ANALYSIS_PROGRESS_STAGES.SUMMARIZING:
        return {
          messageKey: "settings.analysis.progress.finalizing",
          messageValues: {},
        };

      case ANALYSIS_PROGRESS_STAGES.COMPLETE:
        if (stats) {
          const vipCount = (stats.vipContactsEvaluated as number) || 0;
          return {
            messageKey: "settings.analysis.progress.complete",
            messageValues: {
              threads: (stats.totalThreads as number) || threadCount || 0,
              outbound: (stats.outboundEmails as number) || 0,
              unopened: (stats.threadsNeverOpened as number) || 0,
              readNotReplied: (stats.threadsReadButNotReplied as number) || 0,
              vipCount,
            },
          };
        }
        return {
          messageKey: "settings.analysis.progress.completeSimple",
          messageValues: { count: threadCount || 0 },
        };

      default:
        // Fallback - shouldn't happen
        return {
          messageKey: "settings.analysis.progress.starting",
          messageValues: {},
        };
    }
  }

  @Post("analyze")
  @UseGuards(AiCapacityGuard)
  async analyzeEmails(
    @Request() req: { user: { userId: string } },
    @Body() _body: Record<string, unknown> = {},
  ) {
    const { userId } = req.user;
    this.logger.log(`POST /context/analyze received for user ${userId}`);
    const { analysisId } = await this.contextService.startAnalysis(userId);
    return { message: "Analysis started", analysisId };
  }

  @Post()
  async addContext(
    @Request() req,
    @Body()
    body: {
      // Accept both naming conventions (key/value or contextKey/contextValue)
      key?: ContextKey;
      value?: string;
      contextKey?: ContextKey;
      contextValue?: string;
      source?: Source;
      priority?: number;
      explanation?: string;
    },
  ) {
    // Support both naming conventions from frontend
    const contextKey = body.key || body.contextKey;
    const contextValue = body.value || body.contextValue;

    if (!contextKey) {
      throw new Error("Context key is required (use 'key' or 'contextKey')");
    }
    if (!contextValue) {
      throw new Error(
        "Context value is required (use 'value' or 'contextValue')",
      );
    }

    return this.contextService.createOrUpdateContext(
      req.user.userId,
      contextKey,
      contextValue,
      body.source || Source.AUTOGENERATED,
      { priority: body.priority, explanation: body.explanation },
    );
  }

  @Put(":id")
  async updateContext(
    @Param("id") id: string,
    @Request() req,
    @Body()
    body: {
      value: string;
      priority?: number;
      explanation?: string;
    },
  ) {
    const updates: Partial<UserContext> = {
      contextValue: body.value,
      // Mark as user-edited when updated
      source: Source.USER_EDITED,
    };
    if (body.priority !== undefined) {
      updates.priority = body.priority;
    }
    if (body.explanation !== undefined) {
      updates.explanation = body.explanation;
    }
    return this.contextService.updateContext(id, req.user.userId, updates);
  }

  @Delete(":id")
  async deleteContext(@Param("id") id: string, @Request() req) {
    return this.contextService.deleteContext(id, req.user.userId);
  }

  @Patch(":id/approve")
  async approveQA(@Param("id") id: string, @Request() req) {
    const result = await this.contextService.approveQA(id, req.user.userId);
    if (!result) {
      throw new NotFoundException("Q&A item not found or not pending approval");
    }
    return result;
  }

  @Patch(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectQA(@Param("id") id: string, @Request() req) {
    const deleted = await this.contextService.rejectQA(id, req.user.userId);
    if (!deleted) {
      throw new NotFoundException("Q&A item not found or not pending approval");
    }
  }

  @Patch("approve-all-qa")
  async approveAllQA(@Request() req) {
    const count = await this.contextService.approveAllQA(req.user.userId);
    return { approved: count };
  }

  @Post("compress")
  @UseGuards(AiCapacityGuard)
  async compressContext(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/compress received for user ${userId}`,
    );

    const result = await this.contextService.compressUserContext(userId, true);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Compression complete for user ${userId}: ${result.originalCount} -> ${result.compressedCount} items (changed=${result.changed})`,
    );

    return result;
  }

  @Post("consolidate-categories")
  @UseGuards(AiCapacityGuard)
  async consolidateCategories(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/consolidate-categories received for user ${userId}`,
    );

    // Heavy (LLM + thread/rule re-pointing): run in the worker, poll for result.
    const { runId, status } =
      await this.consolidationRunService.enqueue(userId);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Enqueued consolidation run ${runId} for user ${userId}`,
    );

    return { runId, status };
  }

  @Get("consolidation-runs/:runId")
  async getConsolidationRun(
    @Request() req: { user: { userId: string } },
    @Param("runId") runId: string,
  ) {
    const { userId } = req.user;
    const run = await this.consolidationRunService.getRun(userId, runId);
    if (!run) {
      throw new NotFoundException("Consolidation run not found");
    }
    return {
      runId: run.id,
      status: run.status,
      result: run.result,
      error: run.error,
    };
  }

  @Get("unused-categories")
  async getUnusedCategories(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    return this.contextService.listUnusedCategories(userId);
  }

  @Post("prune-unused-categories")
  async pruneUnusedCategories(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/prune-unused-categories received for user ${userId}`,
    );

    const result = await this.contextService.pruneUnusedCategories(userId);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Pruned ${result.prunedCount} unused categories for user ${userId} (${result.remainingCount} remain)`,
    );

    return result;
  }

  @Post("generate-categories-from-other")
  @UseGuards(AiCapacityGuard)
  async generateCategoriesFromOther(
    @Request() req: { user: { userId: string } },
  ) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/generate-categories-from-other received for user ${userId}`,
    );

    const result =
      await this.contextService.generateCategoriesFromOther(userId);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Category generation complete for user ${userId}: ${result.newCategoriesCount} new categories added (total: ${result.totalCategoriesCount})`,
    );

    return result;
  }

  private static readonly DEFAULT_ADMIN_ANALYSES_LIMIT = 50;
  private static readonly FAILURE_VIEW_LIMIT_MULTIPLIER = 5;
  private static readonly MIN_FAILURE_VIEW_QUERY_LIMIT = 250;
  /** Upper bound on queryLimit to prevent over-fetching for large limit inputs */
  private static readonly MAX_FAILURE_VIEW_QUERY_LIMIT = 1000;
  private static readonly ANALYSIS_STATUS_FAILED = "failed";

  @Get("admin/analyses")
  @UseGuards(AdminGuard)
  async getAdminAnalyses(
    @Query("limit") limitStr?: string,
    @Query("status") status?: string,
  ) {
    const parsedLimit = limitStr ? parseInt(limitStr, 10) : 0;
    const limit =
      parsedLimit > 0
        ? parsedLimit
        : ContextController.DEFAULT_ADMIN_ANALYSES_LIMIT;
    const normalizedStatus = status?.toLowerCase();
    const isFailureView =
      normalizedStatus === ContextController.ANALYSIS_STATUS_FAILED;
    const queryLimit = isFailureView
      ? Math.min(
          Math.max(
            limit * ContextController.FAILURE_VIEW_LIMIT_MULTIPLIER,
            ContextController.MIN_FAILURE_VIEW_QUERY_LIMIT,
          ),
          ContextController.MAX_FAILURE_VIEW_QUERY_LIMIT,
        )
      : limit;
    const queryBuilder = this.contextAnalysisRepository
      .createQueryBuilder("analysis")
      .orderBy("analysis.createdAt", "DESC")
      .take(queryLimit);

    if (normalizedStatus && !isFailureView) {
      queryBuilder.where("analysis.status = :status", {
        status: normalizedStatus,
      });
    }

    const analyses = await queryBuilder.getMany();

    const userIds = [...new Set(analyses.map((itemA) => itemA.userId))];
    const users = userIds.length
      ? await this.userRepository.find({
          where: { id: In(userIds) },
          select: {
            id: true,
            email: true,
          },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user.email]));

    const analysesWithDetails = this.mapAnalysesWithDetails(analyses, userMap);

    const filteredAnalyses = isFailureView
      ? analysesWithDetails.filter(
          (analysis) =>
            analysis.status === ContextController.ANALYSIS_STATUS_FAILED ||
            analysis.failedBatches > 0 ||
            Boolean(analysis.errorMessage),
        )
      : analysesWithDetails;

    return {
      analyses: filteredAnalyses.slice(0, limit),
      timestamp: new Date().toISOString(),
    };
  }

  private mapAnalysesWithDetails(
    analyses: ContextAnalysis[],
    userMap: Map<string, string>,
  ) {
    return analyses.map((analysis) => {
      const stats = analysis.stats || {};
      const batchResults =
        (stats.batchResults as Record<string, unknown>) || {};
      const failedBatchSet = new Set<number>(
        ((stats.failedBatches as number[]) || []).filter((batchIndex) =>
          Number.isInteger(batchIndex),
        ),
      );

      Object.entries(batchResults).forEach(([indexKey, result]) => {
        const batchResult = result as { error?: string } | undefined;
        const parsedIndex = parseInt(indexKey, 10);
        if (batchResult?.error && Number.isInteger(parsedIndex)) {
          failedBatchSet.add(parsedIndex);
        }
      });

      const failedBatches = Array.from(failedBatchSet).sort(
        (itemA, itemB) => itemA - itemB,
      );
      const totalBatches = (stats.totalBatches as number) || 0;
      const completedBatches = Object.keys(batchResults).filter(
        (key) => !failedBatchSet.has(parseInt(key, 10)),
      ).length;

      const failureDetails = failedBatches.map((batchIndex) => {
        const batchResult = batchResults[String(batchIndex)] as
          | {
              error?: string;
              failedAt?: string;
              correlationId?: string;
              errorType?: string;
            }
          | undefined;
        return {
          batchIndex,
          error: batchResult?.error || "Unknown error",
          failedAt: batchResult?.failedAt || null,
          correlationId: batchResult?.correlationId || null,
          errorType: batchResult?.errorType || "unknown",
        };
      });

      return {
        id: analysis.id,
        correlationId: analysis.correlationId,
        userId: analysis.userId,
        userEmail: userMap.get(analysis.userId) || "Unknown",
        status: analysis.status,
        errorMessage: analysis.errorMessage,
        progress: analysis.progress,
        threadCount: analysis.threadCount,
        analyzedCount: analysis.analyzedCount,
        totalBatches,
        completedBatches,
        failedBatches: failedBatches.length,
        failureDetails,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
      };
    });
  }
}
