import { Injectable, Logger } from "@nestjs/common";

import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  type ConsolidationResult,
  type PrunedCategory,
  type PruneResult,
} from "./category-consolidation.service";
import { ContextAnalysisFinalizerService } from "./context-analysis-finalizer.service";
import { ContextAnalysisHelpersService } from "./context-analysis-helpers.service";
import { ContextAnalysisOrchestratorService } from "./context-analysis-orchestrator.service";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";
import { ContextAnalysisQueryService } from "./context-analysis-query.service";
import { ContextCategoryService } from "./context-category.service";
import { ContextCompressionService } from "./context-compression.service";
import {
  ContextCrudService,
  CreateContextOptions,
} from "./context-crud.service";

/**
 * Facade service for context operations.
 * Delegates to focused sub-services extracted as part of Phase A refactor (issue #70).
 */
@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    private crudService: ContextCrudService,
    private categoryService: ContextCategoryService,
    private progressService: ContextAnalysisProgressService,
    private queryService: ContextAnalysisQueryService,
    private orchestratorService: ContextAnalysisOrchestratorService,
    private finalizerService: ContextAnalysisFinalizerService,
    private contextCompressionService: ContextCompressionService,
    private analysisHelpersService: ContextAnalysisHelpersService,
  ) {}

  /** Starts a fresh analysis run; see ContextAnalysisProgressService.startAnalysis. */
  async startAnalysis(userId: string): Promise<{ analysisId: string }> {
    return this.progressService.startAnalysis(userId);
  }

  async getUserContext(userId: string): Promise<UserContext[]> {
    return this.crudService.getUserContext(userId);
  }

  async getAnalysisProgress(
    userId: string,
    analysisId?: string,
  ): Promise<{
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
  }> {
    return this.queryService.getAnalysisProgress(userId, analysisId);
  }

  async analyzeAndLearnFromEmails(
    userId: string,
    analysisId?: string,
  ): Promise<void> {
    return this.orchestratorService.analyzeAndLearnFromEmails(
      userId,
      analysisId,
    );
  }

  async createOrUpdateContext(
    userId: string,
    contextKey: ContextKey,
    contextValue: string,
    source: Source,
    options: CreateContextOptions = {},
  ): Promise<UserContext> {
    return this.crudService.createOrUpdateContext(
      userId,
      contextKey,
      contextValue,
      source,
      options,
    );
  }

  async updateContext(
    contextId: string,
    userId: string,
    updates: Partial<UserContext>,
  ): Promise<UserContext | null> {
    return this.crudService.updateContext(contextId, userId, updates);
  }

  async deleteContext(contextId: string, userId: string): Promise<void> {
    return this.crudService.deleteContext(contextId, userId);
  }

  async approveQA(
    contextId: string,
    userId: string,
  ): Promise<UserContext | null> {
    return this.crudService.approveQA(contextId, userId);
  }

  async rejectQA(contextId: string, userId: string): Promise<boolean> {
    return this.crudService.rejectQA(contextId, userId);
  }

  async approveAllQA(userId: string): Promise<number> {
    return this.crudService.approveAllQA(userId);
  }

  async getAnalysisRecordById(
    analysisRecordId: string,
  ): Promise<ContextAnalysis | null> {
    return this.analysisHelpersService.getAnalysisRecordById(analysisRecordId);
  }

  async getCompletedBatchCount(analysisRecordId: string): Promise<number> {
    return this.analysisHelpersService.getCompletedBatchCount(analysisRecordId);
  }

  async markAnalysisAsFailed(
    analysisRecordId: string,
    errorMessage: string,
  ): Promise<void> {
    return this.analysisHelpersService.markAnalysisAsFailed(
      analysisRecordId,
      errorMessage,
    );
  }

  async checkAndSyncJobs(userId: string, analysisId?: string): Promise<void> {
    return this.progressService.checkAndSyncJobs(userId, analysisId);
  }

  async checkBatchesComplete(
    analysisRecordId: string,
    totalBatches: number,
  ): Promise<boolean> {
    return this.progressService.checkBatchesComplete(
      analysisRecordId,
      totalBatches,
    );
  }

  async finalizeContextAnalysis(options: {
    userId: string;
    analysisRecordId: string;
    totalBatches: number;
    totalThreads: number;
    sentEmailsCount: number;
    analysisStats: {
      totalThreads: number;
      outboundEmails: number;
      threadsNeverOpened: number;
      threadsReadButNotReplied: number;
      vipContactsEvaluated: number;
    };
    trueVipContacts?: Array<{
      emailKey: string;
      from: string;
      fromName?: string;
      threadCount: number;
    }>;
  }): Promise<void> {
    return this.finalizerService.finalizeContextAnalysis(options);
  }

  async consolidateExistingCategories(
    userId: string,
  ): Promise<ConsolidationResult> {
    return this.contextCompressionService.consolidateExistingCategories(userId);
  }

  async listUnusedCategories(userId: string): Promise<PrunedCategory[]> {
    return this.contextCompressionService.listUnusedCategories(userId);
  }

  async pruneUnusedCategories(userId: string): Promise<PruneResult> {
    return this.contextCompressionService.pruneUnusedCategories(userId);
  }

  async generateCategoriesFromOther(userId: string): Promise<{
    newCategoriesCount: number;
    totalCategoriesCount: number;
    newCategories: Array<{ name: string; description: string }>;
    reclassifyJobsQueued: number;
  }> {
    return this.contextCompressionService.generateCategoriesFromOther(userId);
  }

  async enqueueContextCompressionIfNeeded(userId: string): Promise<boolean> {
    return this.contextCompressionService.enqueueContextCompressionIfNeeded(
      userId,
    );
  }

  async compressUserContext(
    userId: string,
    force = false,
  ): Promise<{
    originalCount: number;
    compressedCount: number;
    changed: boolean;
    notes?: string;
  }> {
    return this.contextCompressionService.compressUserContext(userId, force);
  }
}
