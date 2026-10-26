import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import {
  type BatchEmailInput,
  PriorityAnalyzer,
} from "../shared/email-intelligence/priority-analyzer";
import { CategoryShortlistService } from "./category-shortlist.service";
import { LLMCoreService } from "./llm-core.service";
import type {
  BatchPriorityResult,
  CategoryConfidence,
  CategoryInstrumentation,
  PriorityResult,
} from "./priority-analysis.types";

// Re-exported so existing imports from this service keep working.
export type {
  BatchPriorityResult,
  CategoryConfidence,
  CategoryInstrumentation,
  PriorityResult,
};

/**
 * NestJS adapter over the framework-free PriorityAnalyzer
 * (shared/email-intelligence), which the prioritisation Lambda runs too.
 */
@Injectable()
export class PriorityAnalysisService {
  private readonly logger = new Logger(PriorityAnalysisService.name);
  private readonly analyzer: PriorityAnalyzer;

  constructor(
    llmCoreService: LLMCoreService,
    errorTrackingService: ErrorTrackingService,
    categoryShortlistService: CategoryShortlistService,
    configService: ConfigService,
  ) {
    this.analyzer = new PriorityAnalyzer({
      llm: llmCoreService,
      categoryShortlist: categoryShortlistService,
      logger: this.logger,
      errorReporter: errorTrackingService,
      getConfig: (key) => configService.get<string>(key),
    });
  }

  analyzePriority(
    options: Parameters<PriorityAnalyzer["analyzePriority"]>[0],
  ): Promise<PriorityResult> {
    return this.analyzer.analyzePriority(options);
  }

  analyzePriorityBatch(
    ...args: Parameters<PriorityAnalyzer["analyzePriorityBatch"]>
  ): Promise<Map<string, BatchPriorityResult>> {
    return this.analyzer.analyzePriorityBatch(...args);
  }
}

export type { BatchEmailInput };
