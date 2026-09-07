import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import type {
  DiscoveredCategory,
  DiscoveredVipContact,
} from "../llm/llm-discover-user-context";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import {
  normalizeCategoryNameForDedup,
  parseCategoryValue,
} from "../utils/category-name.util";
import { writeAnalysisLog } from "./context-analysis-logger";
import { ContextCompressionService } from "./context-compression.service";
import { ContextCrudService } from "./context-crud.service";
import {
  isDiscoveryBatchFailure,
  StoredBatchResult,
} from "./context-discovery.types";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";

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
  urgentHints: string[];
  notUrgentHints: string[];
  threadIds: string[];
}

const DISCOVERY_SOURCE_EXPLANATION = "email_analysis";
const PROGRESS_FINALIZING = 70;
const PROGRESS_CATEGORIES_SAVED = 80;
const PROGRESS_CONTEXT_SAVED = 85;
const PROGRESS_COMPLETE = 100;
const CLEAR_PROGRESS_DELAY_MS = 5 * MS_PER_SECOND;

/**
 * Merges the per-batch discovery results, runs the existing category
 * consolidation step, and persists categories, VIP contacts and urgency hints
 * into user_contexts. Pure-string dedup happens here; the semantic merge is the
 * consolidation LLM call that has always closed out an analysis.
 */
@Injectable()
export class ContextAnalysisFinalizerService {
  private readonly logger = new Logger(ContextAnalysisFinalizerService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    private llmService: LLMService,
    private usersService: UsersService,
    private crudService: ContextCrudService,
    private compressionService: ContextCompressionService,
    private piiRedactionService: ContextPiiRedactionService,
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

    const categories = await this.consolidateCategories(
      userId,
      merged.categories,
    );
    await this.saveCategories(userId, categories, merged.threadIds);
    await this.usersService.update(userId, {
      scanProgress: PROGRESS_CATEGORIES_SAVED,
      scanTotal: 100,
    });

    await this.saveVipContacts(userId, merged.vipContacts);
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
      `[CONTEXT-DISCOVERY] Completed for user ${userId}: ${categories.length} categories, ${merged.vipContacts.length} VIPs from ${totalThreads} threads`,
    );

    await this.compressionService.enqueueContextCompressionIfNeeded(userId);
    setTimeout(async () => {
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }, CLEAR_PROGRESS_DELAY_MS);
  }

  /**
   * Combine batch outputs, skipping failed batches and collapsing categories
   * and VIPs that differ only by emoji/punctuation/case.
   */
  mergeBatchResults(
    batchResults: Record<string, StoredBatchResult>,
    totalBatches: number,
  ): MergedDiscovery {
    const merged: MergedDiscovery = {
      categories: [],
      vipContacts: [],
      urgentHints: [],
      notUrgentHints: [],
      threadIds: [],
    };
    const categoryKeys = new Set<string>();
    const vipKeys = new Set<string>();

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
      for (const category of result.categories ?? []) {
        const key = normalizeCategoryNameForDedup(category.name);
        if (!key || categoryKeys.has(key)) continue;
        categoryKeys.add(key);
        merged.categories.push(category);
      }
      for (const contact of result.vipContacts ?? []) {
        const key = (contact.email || contact.name).toLowerCase();
        if (vipKeys.has(key)) continue;
        vipKeys.add(key);
        merged.vipContacts.push(contact);
      }
      merged.urgentHints.push(...(result.urgentHints ?? []));
      merged.notUrgentHints.push(...(result.notUrgentHints ?? []));
      merged.threadIds.push(...(result.threadIds ?? []));
    }
    return merged;
  }

  /**
   * The existing semantic consolidation pass (LLM): merges overlapping
   * auto-generated categories and preserves user-added ones. Falls back to the
   * raw list when the call fails so a flaky LLM never drops the whole set.
   */
  private async consolidateCategories(
    userId: string,
    discovered: DiscoveredCategory[],
  ): Promise<DiscoveredCategory[]> {
    if (discovered.length === 0) return discovered;

    const userAddedCategories = (
      await this.contextRepository.find({
        where: {
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
          source: Source.USER_EDITED,
        },
      })
    ).map((ctx) => {
      const { name, description } = parseCategoryValue(ctx.contextValue);
      return { name, description: description ?? "" };
    });

    try {
      const consolidated = await this.llmService.consolidateEmailCategories(
        discovered,
        userAddedCategories,
        undefined,
        userId,
      );
      return consolidated
        .filter((category) => !category.isUserAdded)
        .map((category) => ({
          name: category.name,
          description: category.description,
        }));
    } catch (consolidateError) {
      this.logger.warn(
        `[CONTEXT-DISCOVERY] Category consolidation failed, keeping discovered list: ${getErrorMessage(consolidateError)}`,
      );
      return discovered;
    }
  }

  private async saveCategories(
    userId: string,
    categories: DiscoveredCategory[],
    sourceThreadIds: string[],
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
        { sourceThreadIds },
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
    options: { explanation?: string; sourceThreadIds?: string[] },
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
        explanation: options.explanation ?? DISCOVERY_SOURCE_EXPLANATION,
        sourceThreadIds: options.sourceThreadIds,
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
