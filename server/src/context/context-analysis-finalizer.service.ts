import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  type DiscoveredCategory,
  type DiscoveredProject,
  type DiscoveredVipContact,
  normalizeProjectName,
} from "../llm/llm-discover-user-context";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { writeAnalysisLog } from "./context-analysis-logger";
import { ContextCompressionService } from "./context-compression.service";
import {
  ContextCrudService,
  type CreateContextOptions,
} from "./context-crud.service";
import {
  DiscoveryBatchResult,
  isDiscoveryBatchFailure,
  StoredBatchResult,
} from "./context-discovery.types";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { OnboardingCategorySortService } from "./onboarding-category-sort.service";

type AnalysisStatsInput = {
  totalThreads: number;
  outboundEmails: number;
  threadsNeverOpened: number;
  threadsReadButNotReplied: number;
  vipContactsEvaluated: number;
};

/** Everything the batches discovered, merged and de-duplicated. */
export interface MergedDiscovery {
  categories: DiscoveredCategory[];
  vipContacts: DiscoveredVipContact[];
  projects: DiscoveredProject[];
  urgentHints: string[];
  notUrgentHints: string[];
}

const DISCOVERY_SOURCE_EXPLANATION = "email_analysis";
/** Medium (1 = top, 3 = low) — the same default as a project added by hand. */
const DISCOVERED_PROJECT_PRIORITY = 2;
const PROGRESS_FINALIZING = 70;
const PROGRESS_CATEGORIES_SAVED = 80;
const PROGRESS_CONTEXT_SAVED = 85;
const PROGRESS_COMPLETE = 100;
const CLEAR_PROGRESS_DELAY_MS = 5 * MS_PER_SECOND;

/**
 * Flattens per-batch lists, keeping the first item for each non-empty key
 * (so a near-duplicate from a later batch is dropped), up to `limit` items.
 */
function mergeUnique<T>(
  lists: T[][],
  keyOf: (item: T) => string,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const seenKeys = new Set<string>();
  const merged: T[] = [];
  for (const item of lists.flat()) {
    const key = keyOf(item);
    if (!key || seenKeys.has(key)) continue;
    if (merged.length >= limit) break;
    seenKeys.add(key);
    merged.push(item);
  }
  return merged;
}

/**
 * Merges the per-batch discovery results and persists categories, VIP
 * contacts, current projects and urgency hints into user_contexts. The
 * category set comes from the single category-proposal batch (the first 100
 * threads) as-is: the old LLM consolidation pass capped it at 10 and merged
 * every support-like bucket into one "Customer Support", undoing the granular
 * proposal.
 */
@Injectable()
export class ContextAnalysisFinalizerService {
  private readonly logger = new Logger(ContextAnalysisFinalizerService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    private usersService: UsersService,
    private crudService: ContextCrudService,
    private compressionService: ContextCompressionService,
    private piiRedactionService: ContextPiiRedactionService,
    private onboardingCategorySortService: OnboardingCategorySortService,
  ) {}

  async finalizeContextAnalysis(options: {
    userId: string;
    analysisRecordId: string;
    totalBatches: number;
    totalThreads: number;
    sentEmailsCount: number;
    analysisStats: AnalysisStatsInput;
  }): Promise<void> {
    const { userId, analysisRecordId, totalBatches, totalThreads } = options;
    this.logger.log(
      `[CONTEXT-DISCOVERY] Starting finalization for analysis ${analysisRecordId}`,
    );
    writeAnalysisLog(
      `Starting finalization for analysis ${analysisRecordId}`,
      "log",
    );

    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
    if (!analysisRecord?.stats) {
      throw new Error(`Analysis record ${analysisRecordId} or stats not found`);
    }

    const merged = this.mergeBatchResults(
      (analysisRecord.stats.batchResults ?? {}) as Record<
        string,
        StoredBatchResult
      >,
      totalBatches,
    );
    await this.usersService.update(userId, {
      scanProgress: PROGRESS_FINALIZING,
      scanTotal: 100,
    });

    const { categories } = merged;
    await this.saveCategories(userId, categories);
    await this.usersService.update(userId, {
      scanProgress: PROGRESS_CATEGORIES_SAVED,
      scanTotal: 100,
    });

    await this.saveVipContacts(userId, merged.vipContacts);
    await this.saveProjects(userId, merged.projects);
    await this.saveHints(userId, ContextKey.URGENT, merged.urgentHints);
    await this.saveHints(
      userId,
      ContextKey.NOT_IMPORTANT,
      merged.notUrgentHints,
    );
    await this.crudService.deduplicateExistingContext(userId);
    await this.usersService.update(userId, {
      scanProgress: PROGRESS_CONTEXT_SAVED,
      scanTotal: 100,
    });

    await this.persistFinalAnalysisRecord(
      analysisRecord,
      options,
      merged.vipContacts.length,
    );
    await this.usersService.update(userId, {
      scanProgress: PROGRESS_COMPLETE,
      scanTotal: 100,
    });
    writeAnalysisLog(`[FINALIZATION] COMPLETE for user ${userId}`, "log");
    this.logger.log(
      `[CONTEXT-DISCOVERY] Completed for user ${userId}: ${categories.length} categories, ${merged.vipContacts.length} VIPs, ${merged.projects.length} projects from ${totalThreads} threads`,
    );

    if (categories.length > 0) {
      // Threads the first sync triaged before these categories existed sit in
      // "Other"; sort them now so step 3 hands over an organised inbox.
      await this.onboardingCategorySortService.sortOnboardingThreadsIntoCategories(
        userId,
      );
    }

    await this.compressionService.enqueueContextCompressionIfNeeded(userId);
    setTimeout(async () => {
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }, CLEAR_PROGRESS_DELAY_MS);
  }

  /**
   * Combine batch outputs, skipping failed batches. Categories come from the
   * first completed batch — the category-proposal batch over the most recent
   * threads — never a union of slices; VIPs and projects that differ only by
   * emoji/punctuation/case are collapsed.
   */
  mergeBatchResults(
    batchResults: Record<string, StoredBatchResult>,
    totalBatches: number,
  ): MergedDiscovery {
    const completed = this.collectCompletedBatches(batchResults, totalBatches);
    return {
      categories: completed[0]?.categories ?? [],
      vipContacts: mergeUnique(
        completed.map((result) => result.vipContacts ?? []),
        (contact) => (contact.email || contact.name).toLowerCase(),
      ),
      projects: mergeUnique(
        completed.map((result) => result.projects ?? []),
        (project) => normalizeProjectName(project.name),
        QUERY_LIMITS.DISCOVERY_MAX_PROJECTS,
      ),
      urgentHints: completed.flatMap((result) => result.urgentHints ?? []),
      notUrgentHints: completed.flatMap(
        (result) => result.notUrgentHints ?? [],
      ),
    };
  }

  /** Successful batch results in batch order; missing and failed ones are logged and skipped. */
  private collectCompletedBatches(
    batchResults: Record<string, StoredBatchResult>,
    totalBatches: number,
  ): DiscoveryBatchResult[] {
    const completed: DiscoveryBatchResult[] = [];
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const result = batchResults[String(batchNum)];
      if (!result) {
        this.logger.warn(
          `[CONTEXT-DISCOVERY] Batch ${batchNum} missing — skipped in finalization`,
        );
        continue;
      }
      if (isDiscoveryBatchFailure(result)) {
        this.logger.warn(
          `[CONTEXT-DISCOVERY] Batch ${batchNum} failed: ${result.error} — skipped in finalization`,
        );
        continue;
      }
      completed.push(result);
    }
    return completed;
  }

  private async saveCategories(
    userId: string,
    categories: DiscoveredCategory[],
  ): Promise<void> {
    let added = 0;
    for (const category of categories) {
      const value = category.description
        ? `${category.name} - ${category.description}`
        : category.name;
      const saved = await this.saveContextValueIfNew(
        userId,
        ContextKey.EMAIL_CATEGORY,
        value,
        { sourceThreadIds: category.sourceThreadIds ?? [] },
      );
      if (saved) added++;
    }
    this.logger.log(
      `[CONTEXT-DISCOVERY] Categories: ${added} added, ${categories.length - added} already present`,
    );
  }

  private async saveVipContacts(
    userId: string,
    vipContacts: DiscoveredVipContact[],
  ): Promise<void> {
    let added = 0;
    for (const contact of vipContacts) {
      const saved = await this.saveContextValueIfNew(
        userId,
        ContextKey.VIP_CONTACT,
        contact.name,
        { explanation: contact.reason || undefined },
      );
      if (saved) added++;
    }
    this.logger.log(
      `[CONTEXT-DISCOVERY] VIP contacts: ${added} added, ${vipContacts.length - added} skipped`,
    );
    writeAnalysisLog(
      `VIP contacts: ${added} added, ${vipContacts.length - added} skipped`,
      "log",
    );
  }

  private async saveProjects(
    userId: string,
    projects: DiscoveredProject[],
  ): Promise<void> {
    let added = 0;
    for (const project of projects) {
      const saved = await this.saveContextValueIfNew(
        userId,
        ContextKey.WORKING_ON,
        project.name,
        {
          explanation: project.reason,
          priority: DISCOVERED_PROJECT_PRIORITY,
        },
      );
      if (saved) added++;
    }
    this.logger.log(
      `[CONTEXT-DISCOVERY] Projects: ${added} added, ${projects.length - added} skipped`,
    );
  }

  private async saveHints(
    userId: string,
    key: ContextKey,
    hints: string[],
  ): Promise<void> {
    for (const hint of hints) {
      await this.saveContextValueIfNew(userId, key, hint, {});
    }
  }

  /**
   * Persist a context value unless an exact or near-duplicate already exists
   * for the user under that key. Returns true when a row was written.
   */
  private async saveContextValueIfNew(
    userId: string,
    key: ContextKey,
    rawValue: string,
    options: CreateContextOptions,
  ): Promise<boolean> {
    const value = rawValue.trim();
    if (!value) return false;

    const existing = await this.contextRepository.find({
      where: { userId, contextKey: key },
    });
    const isDuplicate = existing.some((ctx) => {
      if (ctx.contextValue.trim().toLowerCase() === value.toLowerCase()) {
        return true;
      }
      try {
        return this.piiRedactionService.areContextValuesSimilar(
          value,
          ctx.contextValue,
        );
      } catch (err) {
        this.logger.warn(
          `[CONTEXT-DISCOVERY] Similarity check error: ${getErrorMessage(err)}`,
        );
        return false;
      }
    });
    if (isDuplicate) return false;

    await this.crudService.createOrUpdateContext(
      userId,
      key,
      value,
      Source.AUTOGENERATED,
      {
        ...options,
        explanation: options.explanation ?? DISCOVERY_SOURCE_EXPLANATION,
      },
    );
    return true;
  }

  private async persistFinalAnalysisRecord(
    analysisRecord: ContextAnalysis,
    options: {
      analysisStats: AnalysisStatsInput;
      totalThreads: number;
      sentEmailsCount: number;
    },
    vipContactsEvaluated: number,
  ): Promise<void> {
    const { analysisStats, totalThreads, sentEmailsCount } = options;
    analysisRecord.stats = {
      ...analysisRecord.stats,
      totalThreads: analysisStats.totalThreads || totalThreads,
      outboundEmails: analysisStats.outboundEmails || sentEmailsCount,
      threadsNeverOpened: analysisStats.threadsNeverOpened,
      threadsReadButNotReplied: analysisStats.threadsReadButNotReplied,
      vipContactsEvaluated,
      // Stubs were only kept so lost batches could be re-queued.
      batchPayloadsForRetry: undefined,
    };
    analysisRecord.status = "completed";
    analysisRecord.progress = PROGRESS_COMPLETE;
    analysisRecord.total = 100;
    const actualThreadCount = analysisRecord.analyzedCount || totalThreads;
    analysisRecord.threadCount = actualThreadCount;
    analysisRecord.analyzedCount = actualThreadCount;
    await this.contextAnalysisRepository.save(analysisRecord);
  }
}
