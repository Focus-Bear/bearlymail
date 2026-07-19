import { Injectable } from "@nestjs/common";

import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";

/**
 * Thin helper service exposing analysis record lookup methods.
 * Extracted from ContextService as part of Phase 6 incremental split (issue #939).
 */
@Injectable()
export class ContextAnalysisHelpersService {
  constructor(
    private readonly progressService: ContextAnalysisProgressService,
  ) {}

  /**
   * Get an analysis record by ID
   */
  async getAnalysisRecordById(
    analysisRecordId: string,
  ): Promise<ContextAnalysis | null> {
    return this.progressService.getAnalysisRecordById(analysisRecordId);
  }

  /**
   * Check if all batches are complete for an analysis
   */
  async getCompletedBatchCount(analysisRecordId: string): Promise<number> {
    return this.progressService.getCompletedBatchCount(analysisRecordId);
  }

  /**
   * Mark an analysis record as failed with an optional error message.
   * Used by processors that detect unrecoverable failure conditions.
   */
  async markAnalysisAsFailed(
    analysisRecordId: string,
    errorMessage: string,
  ): Promise<void> {
    return this.progressService.updateAnalysisStatus(
      analysisRecordId,
      "failed",
      errorMessage,
    );
  }
}
