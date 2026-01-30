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
import { ContextService } from "./context.service";
import {
  UserContext,
  ContextKey,
  Source,
} from "../database/entities/user-context.entity";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "../users/users.service";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../queue/job-priorities";
import { PERCENTAGES } from "../constants/percentages";
import { writeAnalysisLog } from "./context-analysis-logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";

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
  ) {}

  @Get()
  async getContext(@Request() req) {
    return this.contextService.getUserContext(req.user.userId);
  }

  @Get("analyze-progress")
  // eslint-disable-next-line complexity, max-statements
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
      analysisId, // Pass analysis ID to filter
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

    // Calculate displayed progress percentage based on analysis STAGE (not just batch completion)
    // Expected flow:
    // - Starting/Fetching: 0-10% (before batches are created)
    // - Analyzing: 10-70% (during batch processing)
    // - Summarizing/Creating: 70-99% (after all batches complete, during finalization)
    // - Complete: 100% (status == completed)

    let percent = 0;
    let stage:
      | "starting"
      | "fetching"
      | "analyzing"
      | "summarizing"
      | "complete" = "starting";
    const isStillRunning =
      progressInfo.status === "running" || progressInfo.status === "pending";

    if (progressInfo.status === "completed") {
      // Analysis is fully complete
      percent = 100;
      stage = "complete";
    } else if (isStillRunning) {
      const { completedBatches, totalBatches, fetchedGeneral, fetchedSent } =
        progressInfo;

      // Check if any batches have completed - if so, we're in analyzing stage
      const hasCompletedBatches =
        completedBatches !== undefined && completedBatches > 0;

      if (
        (totalBatches === undefined || totalBatches === 0) &&
        !hasCompletedBatches
      ) {
        // Batches not created yet AND none completed - still in fetching stage (0-10%)
        // Calculate fetch progress based on fetched thread counts
        if (fetchedGeneral !== undefined || fetchedSent !== undefined) {
          // Show progress based on what's been fetched (target: 300 general + 150 sent = 450 threads)
          const totalFetched = (fetchedGeneral || 0) + (fetchedSent || 0);
          const fetchPercent = Math.min((totalFetched / 450) * 10, 10); // 0-10% range
          percent = Math.max(1, Math.floor(fetchPercent)); // Minimum 1% to show progress, never 0%
        } else {
          percent = 1; // Minimum 1% while starting (not 0% or 5%)
        }
        stage = "fetching";
      } else if (
        totalBatches > 0 &&
        completedBatches !== undefined &&
        completedBatches >= totalBatches &&
        completedBatches > 0
      ) {
        // All batches complete but analysis not finished - summarizing stage (70-99%)
        percent = 85; // Show 85% while finalizing
        stage = "summarizing";
      } else {
        // Batches are processing - analyzing stage (10-70%)
        const completed = completedBatches !== undefined ? completedBatches : 0;
        const batchPercent = totalBatches > 0 ? completed / totalBatches : 0;
        // Map batch completion (0-100%) to displayed range (10-70%)
        percent = Math.floor(10 + batchPercent * 60);
        stage = "analyzing";
      }

      this.logger.log(
        `[PROGRESS-CALC] Stage: ${stage}, percent: ${percent}%, batches: ${progressInfo.completedBatches || 0}/${progressInfo.totalBatches || "unknown"}, fetched: general=${fetchedGeneral || 0}, sent=${fetchedSent || 0}, status=${progressInfo.status}`,
      );
    } else if (user.scanProgress !== null && user.scanTotal !== null) {
      // For completed/failed analyses that slipped through, use user.scanProgress
      percent = Math.floor((user.scanProgress / user.scanTotal) * 100);
      stage = percent >= 100 ? "complete" : "summarizing";
    }

    // Only show complete if status is actually "completed"
    const isActuallyComplete = progressInfo.status === "completed";

    let messageKey = "";
    let messageValues: Record<string, unknown> = {};

    const { threadCount } = progressInfo;
    const { analyzedCount } = progressInfo;
    const { stats } = progressInfo;
    const { completedBatches, totalBatches, fetchedGeneral, fetchedSent } =
      progressInfo;
    const { insights } = progressInfo;

    // Debug logging
    if (percent >= PERCENTAGES.TWENTY_FIVE && percent < PERCENTAGES.SEVENTY) {
      this.logger.log(
        `[PROGRESS-DEBUG] userId=${req.user.userId}, percent=${percent}, threadCount=${threadCount}, analyzedCount=${analyzedCount}, completedBatches=${completedBatches}, totalBatches=${totalBatches}`,
      );
    }

    // Determine message based on the analysis stage (calculated above)
    // This is much simpler and follows the expected flow
    switch (stage) {
      case "starting":
        messageKey = "settings.analysis.progress.starting";
        break;

      case "fetching":
        messageKey = "settings.analysis.progress.fetching";
        messageValues = {
          generalCount: fetchedGeneral || 0,
          sentCount: fetchedSent || 0,
        };
        break;

      case "analyzing":
        messageKey = "settings.analysis.progress.analyzing";
        messageValues = {
          analyzed: analyzedCount || 0,
          total: threadCount || 0,
          completedBatches: completedBatches || 0,
          totalBatches: totalBatches || 0,
        };
        break;

      case "summarizing":
        messageKey = "settings.analysis.progress.finalizing";
        break;

      case "complete":
        if (stats) {
          const vipCount = (stats.vipContactsEvaluated as number) || 0;
          messageKey = "settings.analysis.progress.complete";
          messageValues = {
            threads: (stats.totalThreads as number) || threadCount || 0,
            outbound: (stats.outboundEmails as number) || 0,
            unopened: (stats.threadsNeverOpened as number) || 0,
            readNotReplied: (stats.threadsReadButNotReplied as number) || 0,
            vipCount,
          };
        } else {
          messageKey = "settings.analysis.progress.completeSimple";
          messageValues = { count: threadCount || 0 };
        }
        break;

      default:
        // Fallback - shouldn't happen
        messageKey = "settings.analysis.progress.starting";
    }

    // Always include stats if available (not just at 100%)
    // This ensures the frontend can display the summary even if isComplete check fails
    const finalStats = stats || progressInfo.stats;

    // Log for debugging
    if (percent >= 100) {
      this.logger.log(
        `[PROGRESS-DEBUG] Completion check: userId=${req.user.userId}, percent=${percent}, status=${progressInfo.status}, isActuallyComplete=${isActuallyComplete}, stats=${finalStats ? "YES" : "NO"}, threadCount=${threadCount}, analyzedCount=${analyzedCount}`,
      );
    }

    // Include findings in response if available
    const findings = (finalStats?.findings as string[]) || undefined;

    return {
      progress: {
        current: percent, // Use calculated percent, not user.scanProgress
        total: 100, // Total is always 100 for percentage
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
    console.log(
      `[CONTEXT-CONTROLLER] POST /context/analyze received for user ${userId}`,
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
        batchResults: {}, // Explicitly empty - no insights from previous runs
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
    console.log(
      `[CONTEXT-CONTROLLER] Sending job to queue with priority ${priority}`,
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
    console.log(
      `[CONTEXT-CONTROLLER] Job sent successfully for user ${userId} with analysis ID ${analysisRecord.id}`,
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
      body.priority,
      body.explanation,
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
      source: Source.USER_EDITED, // Mark as user-edited when updated
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
}
