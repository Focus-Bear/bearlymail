import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { CONTEXT_ANALYSIS_STATUS } from "../constants/domain-statuses";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import {
  isDiscoveryBatchFailure,
  StoredBatchResult,
} from "./context-discovery.types";

/** Insight `type` values the client progress panel understands. */
const INSIGHT_TYPES = {
  CATEGORY: "category",
  VIP: "vip",
  PATTERN: "pattern",
} as const;

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

  /**
   * Insights shown live in the onboarding progress panel, read straight from
   * the per-batch discovery results as they land.
   */
  private extractInsightsFromAnalysis(
    analysis: ContextAnalysis,
  ): Array<{ type: string; message: string }> {
    const insights: Array<{ type: string; message: string }> = [];
    if (!analysis.stats?.batchResults) {
      return insights;
    }
    const batchResults = analysis.stats.batchResults as Record<
      string,
      StoredBatchResult
    >;
    for (const result of Object.values(batchResults)) {
      if (isDiscoveryBatchFailure(result)) continue;
      for (const category of result.categories ?? []) {
        insights.push({
          type: INSIGHT_TYPES.CATEGORY,
          message: `Found category: ${category.name}`,
        });
      }
      for (const contact of result.vipContacts ?? []) {
        insights.push({
          type: INSIGHT_TYPES.VIP,
          message: `Found important contact: ${contact.name}`,
        });
      }
      for (const hint of result.urgentHints ?? []) {
        insights.push({
          type: INSIGHT_TYPES.PATTERN,
          message: `Time-critical: ${hint}`,
        });
      }
    }
    return insights;
  }

  private extractInsightsFromBatchResults(
    analysis: ContextAnalysis,
  ): Array<{ type: string; message: string }> {
    return this.extractInsightsFromAnalysis(analysis);
  }
}
