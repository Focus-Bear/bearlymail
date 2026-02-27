import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Inject,
  Logger,
  Query,
} from "@nestjs/common";
import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { MINUTES_PER_HOUR } from "../constants/time-constants";
import { ContextService } from "./context.service";
import {
  UserContext,
  ContextKey,
  Source,
} from "../database/entities/user-context.entity";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { UsersService } from "../users/users.service";
import PgBoss from "pg-boss";
import { getJobPriority } from "../queue/job-priorities";
import { PERCENTAGES } from "../constants/percentages";
import { writeAnalysisLog } from "./context-analysis-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { User } from "../database/entities/user.entity";

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
    @Inject("PG_BOSS") private readonly boss: PgBoss,
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
      progressInfo.status === "running" ||
      progressInfo.status === "pending"
    ) {
      await this.contextService.checkAndSyncJobs(req.user.userId, analysisId);
    }

    // If no active analysis, return null (not complete, just no analysis running)
    if (!progressInfo.status) {
      return { progress: null, error: null };
    }

    // Check if analysis failed
    if (progressInfo.status === "failed") {
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
    const isActuallyComplete = progressInfo.status === "completed";
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
    if (progressInfo.status === "completed") {
      return { percent: 100, stage: "complete" };
    }

    const isStillRunning =
      progressInfo.status === "running" || progressInfo.status === "pending";

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
      case "starting":
        return {
          messageKey: "settings.analysis.progress.starting",
          messageValues: {},
        };

      case "fetching":
        return {
          messageKey: "settings.analysis.progress.fetching",
          messageValues: {
            generalCount: fetchedGeneral || 0,
            sentCount: fetchedSent || 0,
          },
        };

      case "analyzing":
        return {
          messageKey: "settings.analysis.progress.analyzing",
          messageValues: {
            analyzed: analyzedCount || 0,
            total: threadCount || 0,
            completedBatches: completedBatches || 0,
            totalBatches: totalBatches || 0,
          },
        };

      case "summarizing":
        return {
          messageKey: "settings.analysis.progress.finalizing",
          messageValues: {},
        };

      case "complete":
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
  async analyzeEmails(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/analyze received for user ${userId}`,
    );
    writeAnalysisLog(
      `[CONTROLLER] POST /context/analyze received for user ${userId}`,
      "log",
    );

    // Mark any existing "running" analysis as failed before starting new one
    // This prevents insights from previous analyses from being shown
    await this.contextAnalysisRepository.update(
      { userId, status: "running" },
      { status: "failed", errorMessage: "Superseded by new analysis" },
    );

    // Create analysis record first with EMPTY stats (no batchResults from previous runs)
    const analysisRecord = this.contextAnalysisRepository.create({
      userId,
      status: "running",
      progress: 0,
      total: 100,
      analyzedCount: 0,
      stats: {
        totalThreads: 0,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
        // Explicitly empty - no insights from previous runs
        batchResults: {},
        batchJobIds: {},
        batchPayloadsForRetry: {},
      },
    });
    await this.contextAnalysisRepository.save(analysisRecord);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Created analysis record ${analysisRecord.id} for user ${userId}`,
    );
    writeAnalysisLog(
      `[CONTROLLER] Created analysis record ${analysisRecord.id} for user ${userId}`,
      "log",
    );

    const priority = getJobPriority("analyze-context");
    this.logger.log(
      `[CONTEXT-CONTROLLER] Sending job to queue with priority ${priority}`,
    );
    writeAnalysisLog(
      `[CONTROLLER] Sending job to queue with priority ${priority}`,
      "debug",
    );

    // Send job to queue with analysis ID
    await this.boss.send(
      "analyze-context",
      { userId, analysisId: analysisRecord.id },
      { priority },
    );

    this.logger.log(
      `[CONTEXT-CONTROLLER] Job sent successfully for user ${userId} with analysis ID ${analysisRecord.id}`,
    );
    writeAnalysisLog(
      `[CONTROLLER] Job sent successfully for user ${userId} with analysis ID ${analysisRecord.id}`,
      "log",
    );

    // Return analysis ID so frontend can track it
    return { message: "Analysis started", analysisId: analysisRecord.id };
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

  @Post("consolidate-categories")
  async consolidateCategories(@Request() req: { user: { userId: string } }) {
    const { userId } = req.user;
    this.logger.log(
      `[CONTEXT-CONTROLLER] POST /context/consolidate-categories received for user ${userId}`,
    );

    const result =
      await this.contextService.consolidateExistingCategories(userId);

    this.logger.log(
      `[CONTEXT-CONTROLLER] Consolidation complete for user ${userId}: ${result.originalCount} -> ${result.consolidatedCount} categories`,
    );

    return result;
  }

  @Post("generate-categories-from-other")
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

    const queryBuilder = this.contextAnalysisRepository
      .createQueryBuilder("analysis")
      .orderBy("analysis.createdAt", "DESC")
      .take(limit);

    if (status) {
      queryBuilder.where("analysis.status = :status", { status });
    }

    const analyses = await queryBuilder.getMany();

    const userIds = [...new Set(analyses.map((a) => a.userId))];
    const users = userIds.length
      ? await this.userRepository.find({
          where: { id: In(userIds) },
          select: ["id", "email"],
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.email]));

    return {
      analyses: analyses.map((analysis) => {
        const stats = analysis.stats || {};
        const batchResults =
          (stats.batchResults as Record<string, unknown>) || {};
        const failedBatches = (stats.failedBatches as number[]) || [];
        const totalBatches = (stats.totalBatches as number) || 0;
        const completedBatches = Object.keys(batchResults).filter(
          (key) => !failedBatches.includes(parseInt(key, 10)),
        ).length;

        const failureDetails = failedBatches.map((batchIndex) => {
          const batchResult = batchResults[String(batchIndex)] as
            | {
                error?: string;
                failedAt?: string;
              }
            | undefined;
          return {
            batchIndex,
            error: batchResult?.error || "Unknown error",
            failedAt: batchResult?.failedAt || null,
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
      }),
      timestamp: new Date().toISOString(),
    };
  }
}
