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

@Controller("context")
@UseGuards(JwtAuthGuard)
export class ContextController {
  private readonly logger = new Logger(ContextController.name);
  
  constructor(
    private readonly contextService: ContextService,
    private readonly usersService: UsersService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
  ) {}

  @Get()
  async getContext(@Request() req) {
    return this.contextService.getUserContext(req.user.userId);
  }

  @Get("analyze-progress")
  async getAnalyzeProgress(@Request() req) {
    const user = await this.usersService.findOne(req.user.userId);
    if (!user) {
      return { progress: null, error: null };
    }

    // Reuse scanProgress/scanTotal fields for context analysis progress
    if (user.scanProgress !== null && user.scanTotal !== null) {
      // Check for error state: scanProgress = -1 indicates error
      if (user.scanProgress === -1) {
        return {
          progress: null,
          error: "Analysis failed. Please try again.",
        };
      }

      const percent = Math.floor((user.scanProgress / user.scanTotal) * 100);
      let message = "";
      
      // Get progress info from context service (thread count, analyzed count, stats)
      const progressInfo = await this.contextService.getAnalysisProgress(req.user.userId);
      const threadCount = progressInfo.threadCount;
      const analyzedCount = progressInfo.analyzedCount;
      const stats = progressInfo.stats;
      
      // Debug logging
      if (percent >= 25 && percent < 70) {
        this.logger.log(
          `[PROGRESS-DEBUG] userId=${req.user.userId}, percent=${percent}, threadCount=${threadCount}, analyzedCount=${analyzedCount}`,
        );
      }
      
      if (percent < 5) {
        message = "Starting analysis...";
      } else if (percent < 15) {
        const fetched = Math.floor((percent / 15) * (threadCount || 200));
        message = threadCount 
          ? `Fetching threads from Gmail (${fetched}/${threadCount})...`
          : "Fetching threads from Gmail...";
      } else if (percent < 25) {
        message = threadCount
          ? `Identifying VIP contacts from ${threadCount} threads...`
          : "Identifying VIP contacts from replied threads...";
      } else if (percent >= 25 && percent < 70) {
        // Show "X/200 threads analyzed" during LLM processing
        // analyzedCount will be set before each batch starts, so it should be available
        if (threadCount && analyzedCount !== undefined && analyzedCount >= 0) {
          message = `Analyzing email patterns with AI (${analyzedCount}/${threadCount} threads analyzed)...`;
        } else if (threadCount) {
          message = `Analyzing email patterns with AI (analyzing ${threadCount} threads, this may take 30-60 seconds)...`;
        } else {
          message = "Analyzing email patterns with AI (this may take 30-60 seconds)...";
        }
      } else if (percent < 80) {
        message = "Processing analysis results...";
      } else if (percent < 95) {
        message = "Saving insights to your context...";
      } else if (percent < 100) {
        message = "Finalizing analysis...";
      } else {
        // Get final statistics for summary
        if (stats) {
          const vipCount = stats.vipContactsEvaluated || 0;
          message = `Analysis complete! Analyzed ${stats.totalThreads || threadCount || 0} threads, ${stats.outboundEmails || 0} outbound emails. Found ${stats.threadsNeverOpened || 0} unopened threads, ${stats.threadsReadButNotReplied || 0} read but not replied, ${vipCount} contacts evaluated.`;
        } else {
          message = threadCount
            ? `Analysis complete! Analyzed ${threadCount} threads.`
            : "Analysis complete!";
        }
      }

      // Always include stats if available (not just at 100%)
      // This ensures the frontend can display the summary even if isComplete check fails
      const finalStats = stats || progressInfo.stats;
      
      // Log for debugging
      if (percent >= 100) {
        this.logger.log(
          `[PROGRESS-DEBUG] Completion: userId=${req.user.userId}, percent=${percent}, stats=${finalStats ? 'YES' : 'NO'}, threadCount=${threadCount}, analyzedCount=${analyzedCount}`,
        );
      }
      
      return {
        progress: {
          current: user.scanProgress,
          total: user.scanTotal,
          message,
          threadCount,
          analyzedCount,
          stats: finalStats, // Always include stats when available
        },
        error: null,
      };
    }

    return { progress: null, error: null };
  }

  @Post("analyze")
  async analyzeEmails(@Request() req: any) {
    const userId = req.user.userId;
    const priority = getJobPriority("analyze-context");
    await this.boss.send("analyze-context", { userId }, { priority });
    return { message: "Analysis started" };
  }

  @Post()
  async addContext(
    @Request() req,
    @Body()
    body: {
      key: ContextKey;
      value: string;
      source?: Source;
      priority?: number;
      explanation?: string;
    },
  ) {
    return this.contextService.createOrUpdateContext(
      req.user.userId,
      body.key,
      body.value,
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
}
