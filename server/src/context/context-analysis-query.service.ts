import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { CONTEXT_ANALYSIS_STATUS } from "../constants/domain-statuses";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";

export interface AnalysisProgressResult {
  threadCount?: number;
  analyzedCount?: number;
  stats?: Record<string, unknown>;
  errorMessage?: string;
  completedBatches?: number;
  totalBatches?: number;
  status?: "pending" | "running" | "completed" | "failed";
  insights?: Array<{ type: string; message: string }>;
  fetchingStatus?: string;
  fetchedGeneral?: number;
  fetchedSent?: number;
}

/**
 * Service for querying context analysis progress.
 * Extracted from ContextService to reduce file size (Phase A).
 */
@Injectable()
export class ContextAnalysisQueryService {
  private readonly logger = new Logger(ContextAnalysisQueryService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
  ) {}

  async getAnalysisProgress(
    userId: string,
    analysisId?: string,
  ): Promise<AnalysisProgressResult> {
    const analysis = await this.findActiveAnalysis(userId, analysisId);

    if (!analysis) {
      return this.buildFallbackResult(userId);
    }

    const { completedBatches, totalBatches } =
      this.extractBatchProgress(analysis);
    const recentInsights = this.buildUniqueInsights(
      this.extractInsightsFromAnalysis(analysis),
    );

    return {
      threadCount: analysis.threadCount ?? undefined,
      analyzedCount: analysis.analyzedCount ?? undefined,
      stats: analysis.stats ?? undefined,
      errorMessage:
        analysis.status === CONTEXT_ANALYSIS_STATUS.FAILED
          ? (analysis.errorMessage ?? undefined)
          : undefined,
      completedBatches,
      totalBatches,
      status: analysis.status,
      insights: recentInsights.length > 0 ? recentInsights : undefined,
      fetchingStatus: analysis.fetchingStatus ?? undefined,
      fetchedGeneral: analysis.fetchedGeneralCount ?? undefined,
      fetchedSent: analysis.fetchedSentCount ?? undefined,
    };
  }

  private async findActiveAnalysis(
    userId: string,
    analysisId?: string,
  ): Promise<ContextAnalysis | null> {
    if (analysisId) {
      const record = await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });
      if (!record) {
        this.logger.debug(
          `[CONTEXT-ANALYSIS] Analysis ${analysisId} not found for user ${userId}`,
        );
      }
      return record ?? null;
    }

    const oneHourAgo = new Date(Date.now() - MILLISECONDS.HOUR);
    const recent = await this.contextAnalysisRepository.findOne({
      where: [
        { userId, status: "running", createdAt: MoreThan(oneHourAgo) },
        { userId, status: "pending", createdAt: MoreThan(oneHourAgo) },
      ],
      order: { createdAt: "DESC" },
    });
    if (recent) return recent;

    return this.contextAnalysisRepository.findOne({
      where: [
        { userId, status: "running" },
        { userId, status: "pending" },
      ],
      order: { createdAt: "DESC" },
    });
  }

  private async buildFallbackResult(
    userId: string,
  ): Promise<AnalysisProgressResult> {
    const recentCompleted = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "completed" },
      order: { createdAt: "DESC" },
    });
    if (recentCompleted?.updatedAt) {
      const completedAgo = Date.now() - recentCompleted.updatedAt.getTime();
      if (completedAgo < 5 * MILLISECONDS.MINUTE) {
        return this.buildCompletedProgressResult(recentCompleted);
      }
    }

    const recentFailed = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "failed" },
      order: { createdAt: "DESC" },
    });
    if (recentFailed?.updatedAt) {
      const failedAgo = Date.now() - recentFailed.updatedAt.getTime();
      if (failedAgo < 5 * MILLISECONDS.MINUTE) {
        return {
          threadCount: recentFailed.threadCount ?? undefined,
          analyzedCount: recentFailed.analyzedCount ?? undefined,
          stats: recentFailed.stats ?? undefined,
          errorMessage: recentFailed.errorMessage ?? undefined,
          status: "failed",
        };
      }
    }

    this.logger.debug(
      `[CONTEXT-ANALYSIS] No active or recent analysis found for user ${userId}`,
    );
    return {};
  }

  private extractBatchProgress(analysis: ContextAnalysis): {
    completedBatches: number | undefined;
    totalBatches: number | undefined;
  } {
    if (!analysis.stats) {
      this.logger.warn(`[PROGRESS-CALC] Analysis ${analysis.id} has no stats!`);
      return { completedBatches: undefined, totalBatches: undefined };
    }

    const batchResults =
      (analysis.stats.batchResults as Record<string, unknown>) || {};
    const completedBatches = Object.keys(batchResults).length;
    const totalBatches = analysis.stats.totalBatches
      ? (analysis.stats.totalBatches as number)
      : undefined;

    this.logger.log(
      `[PROGRESS-CALC] Analysis ${analysis.id}: completedBatches=${completedBatches}, totalBatches=${totalBatches}`,
    );

    if (totalBatches !== undefined) {
      const pct = Math.floor((completedBatches / totalBatches) * 100);
      this.logger.log(`[PROGRESS-CALC] Calculated percent: ${pct}%`);
      return { completedBatches, totalBatches };
    }

    return { completedBatches, totalBatches };
  }

  private buildUniqueInsights(
    insights: Array<{ type: string; message: string }>,
  ): Array<{ type: string; message: string }> {
    const seenMessages = new Set<string>();
    const unique = insights.filter((insight) => {
      if (seenMessages.has(insight.message)) return false;
      seenMessages.add(insight.message);
      return true;
    });
    return unique.slice(-DISPLAY_CONSTANTS.MAX_DISPLAY_ITEMS).reverse();
  }

  private buildCompletedProgressResult(
    completedAnalysis: ContextAnalysis,
  ): AnalysisProgressResult {
    let completedBatches: number | undefined;
    let totalBatches: number | undefined;
    if (completedAnalysis.stats) {
      const batchResults =
        (completedAnalysis.stats.batchResults as Record<string, unknown>) || {};
      completedBatches = Object.keys(batchResults).length;

      if (completedAnalysis.stats.totalBatches) {
        totalBatches = completedAnalysis.stats.totalBatches as number;
      }
    }

    if (totalBatches !== undefined) {
      completedBatches = completedBatches !== undefined ? completedBatches : 0;
    }

    const completedInsights =
      this.extractInsightsFromBatchResults(completedAnalysis);

    const seenCompletedMessages = new Set<string>();
    const uniqueCompletedInsights = completedInsights.filter((insight) => {
      if (seenCompletedMessages.has(insight.message)) {
        return false;
      }
      seenCompletedMessages.add(insight.message);
      return true;
    });

    return {
      threadCount: completedAnalysis.threadCount ?? undefined,
      analyzedCount: completedAnalysis.analyzedCount ?? undefined,
      stats: completedAnalysis.stats ?? undefined,
      errorMessage: undefined,
      completedBatches,
      totalBatches,
      status: "completed",
      insights:
        uniqueCompletedInsights
          .slice(-DISPLAY_CONSTANTS.MAX_DISPLAY_ITEMS)
          .reverse().length > 0
          ? uniqueCompletedInsights
              .slice(-DISPLAY_CONSTANTS.MAX_DISPLAY_ITEMS)
              .reverse()
          : undefined,
    };
  }

  private extractInsightsFromAnalysis(
    analysis: ContextAnalysis,
  ): Array<{ type: string; message: string }> {
    const insights: Array<{ type: string; message: string }> = [];

    if (!analysis.stats?.batchResults) {
      return insights;
    }

    const batchResults = analysis.stats.batchResults as Record<
      string,
      {
        context?: Array<{ key: string; value: string; source?: string }>;
        writingStyle?: {
          tone?: string;
          style?: string;
          commonPhrases?: string[];
        };
        completedAt?: string;
      }
    >;

    Object.entries(batchResults).forEach(([, result]) => {
      if (result.context) {
        result.context.forEach((ctx) => {
          const keyLower = ctx.key.toLowerCase();
          const valueLower = ctx.value.toLowerCase();

          const nonImportantIndicators = [
            "archived unread",
            "without replies",
            "deprioritization",
            "low priority",
            "not replied",
            "ignored",
            "unopened",
            "not important",
          ];
          const isActuallyImportant = !nonImportantIndicators.some(
            (indicator) => valueLower.includes(indicator),
          );

          if (
            (keyLower.includes("vip") ||
              keyLower.includes("contact") ||
              keyLower.includes("important")) &&
            isActuallyImportant
          ) {
            insights.push({
              type: "vip",
              message: `Analyzed importance of contact: ${ctx.value}`,
            });
          } else if (keyLower.includes("style") || keyLower.includes("tone")) {
            insights.push({
              type: "style",
              message: `Your communication style: ${ctx.value}`,
            });
          } else if (
            keyLower.includes("working") ||
            keyLower.includes("project") ||
            keyLower.includes("team")
          ) {
            insights.push({
              type: "project",
              message: `Current focus: ${ctx.value}`,
            });
          }
        });
      }

      if (result.writingStyle) {
        this.extractWritingStyleInsights(result.writingStyle, insights);
      }
    });

    return insights;
  }

  private extractInsightsFromBatchResults(
    analysis: ContextAnalysis,
  ): Array<{ type: string; message: string }> {
    const insights: Array<{ type: string; message: string }> = [];

    if (!analysis.stats?.batchResults) {
      return insights;
    }

    const batchResults = analysis.stats.batchResults as Record<
      string,
      {
        context?: Array<{
          key: string;
          value: string;
          source?: string;
        }>;
        writingStyle?: {
          tone?: string;
          style?: string;
          commonPhrases?: string[];
        };
      }
    >;

    Object.entries(batchResults).forEach(([, result]) => {
      if (result.context) {
        result.context.forEach((ctx) => {
          const keyLower = ctx.key.toLowerCase();
          if (
            keyLower.includes("vip") ||
            keyLower.includes("contact") ||
            keyLower.includes("important")
          ) {
            insights.push({
              type: "vip",
              message: `Found important contact: ${ctx.value}`,
            });
          } else if (keyLower.includes("style") || keyLower.includes("tone")) {
            insights.push({
              type: "style",
              message: `Your communication style: ${ctx.value}`,
            });
          } else if (
            keyLower.includes("working") ||
            keyLower.includes("project") ||
            keyLower.includes("team")
          ) {
            insights.push({
              type: "project",
              message: `Current focus: ${ctx.value}`,
            });
          } else {
            insights.push({
              type: "pattern",
              message: `${ctx.key}: ${ctx.value}`,
            });
          }
        });
      }
      if (result.writingStyle) {
        this.extractWritingStyleInsights(result.writingStyle, insights);
      }
    });

    return insights;
  }

  private extractWritingStyleInsights(
    writingStyle: { tone?: string; style?: string; commonPhrases?: string[] },
    insights: Array<{ type: string; message: string }>,
  ): void {
    const styleText =
      `${writingStyle.tone || ""} ${writingStyle.style || ""}`.trim();
    const styleLower = styleText.toLowerCase();

    const isNAPattern =
      styleText === "n/a" ||
      styleText === "n/a n/a" ||
      styleLower.startsWith("n/a") ||
      styleLower.startsWith("n/a -") ||
      styleLower.match(/^n\/a\s*-?\s*(no|unable|not available|absence)/i);

    const isBatchSpecificError =
      styleLower.includes("no sent emails") ||
      styleLower.includes("no user sent emails") ||
      styleLower.includes("unable to analyze") ||
      styleLower.includes("not available") ||
      styleLower.includes("absence of sent email") ||
      styleLower.includes("not analyzable") ||
      isNAPattern ||
      styleText === "";

    if (styleText && !isBatchSpecificError) {
      insights.push({
        type: "style",
        message: `Writing style: ${styleText}`,
      });
    }

    if (writingStyle.commonPhrases && writingStyle.commonPhrases.length > 0) {
      const phrases = writingStyle.commonPhrases.filter((phrase) => {
        const phraseLower = phrase.toLowerCase();
        return (
          !phraseLower.includes("no sent emails") &&
          !phraseLower.includes("no user sent emails") &&
          !phraseLower.includes("unable to analyze") &&
          !phraseLower.includes("not available") &&
          !phraseLower.includes("not analyzable") &&
          phraseLower !== "n/a" &&
          phrase.trim() !== ""
        );
      });

      if (phrases.length > 0) {
        insights.push({
          type: "phrases",
          message: `Common phrases: ${phrases.slice(0, 3).join(", ")}`,
        });
      }
    }
  }
}
