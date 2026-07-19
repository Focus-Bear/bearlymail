import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { parseCategoryValue } from "../utils/category-name.util";
import { writeAnalysisLog } from "./context-analysis-logger";
import { ContextCompressionService } from "./context-compression.service";
import { ContextCrudService } from "./context-crud.service";
import { mapContextItemKey } from "./context-key-mapper";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";

type VipContactEntry = {
  emailKey: string;
  from: string;
  fromName?: string;
  threadCount: number;
};

type BatchPayloadThread = {
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead?: boolean;
  isArchived?: boolean;
  timeToReply?: number | null;
  starCount?: number;
};

type ContextItemWithThreads = {
  key: string;
  value: string;
  source?: string;
  sourceThreadIds?: string[];
};

type WritingStyle = {
  tone: string;
  style: string;
  commonPhrases: string[];
  emailExamples?: string[];
};

type BatchResult = {
  context?: Array<{ key: string; value: string; source: string }>;
  writingStyle?: WritingStyle | null;
  threadIds?: string[];
  error?: string;
  completedAt?: string;
  failedAt?: string;
};

type AnalysisStatsInput = {
  totalThreads: number;
  outboundEmails: number;
  threadsNeverOpened: number;
  threadsReadButNotReplied: number;
  vipContactsEvaluated: number;
};

const NOT_REPLY_INDICATORS = [
  "does not reply to any emails",
  "doesn't reply to any",
  "never replies",
  "no emails show evidence of reply",
  "deprioritize direct email replies overall",
  "strong preference for asynchronous, non-email",
];

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
    trueVipContacts?: VipContactEntry[];
  }): Promise<void> {
    const {
      userId,
      analysisRecordId,
      totalBatches,
      totalThreads,
      sentEmailsCount,
      analysisStats,
      trueVipContacts = [],
    } = options;
    this.logger.log(
      `[CONTEXT-ANALYSIS] Starting finalization for analysis ${analysisRecordId}`,
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

    const finalStats = analysisRecord.stats;
    const effectiveVipContacts = this.resolveVipContacts(
      trueVipContacts,
      finalStats,
    );
    const analysis = this.buildAnalysisFromBatches(finalStats, totalBatches);

    await this.runFinalizationSteps(userId, analysis, effectiveVipContacts);
    await this.persistFinalAnalysisRecord({
      analysisRecord,
      analysisStats,
      totalThreads,
      sentEmailsCount,
      vipContactsEvaluated: effectiveVipContacts.length,
      finalStats,
    });

    await this.usersService.update(userId, {
      scanProgress: 100,
      scanTotal: 100,
    });
    writeAnalysisLog(`[FINALIZATION] COMPLETE for user ${userId}`, "log");
    this.logger.log(
      `[Context Analysis] Completed email analysis for user ${userId}. Analyzed ${totalThreads} threads.`,
    );

    await this.compressionService.enqueueContextCompressionIfNeeded(userId);
    setTimeout(async () => {
      await this.usersService.update(userId, {
        scanProgress: null,
        scanTotal: null,
      });
    }, 5 * MS_PER_SECOND);
  }

  private resolveVipContacts(
    trueVipContacts: VipContactEntry[],
    finalStats: Record<string, unknown>,
  ): VipContactEntry[] {
    const computedVipContacts = this.computeVipContactsFromPayloads(finalStats);
    const effectiveVipContacts =
      trueVipContacts.length > 0 ? trueVipContacts : computedVipContacts;
    this.logger.log(
      `[CONTEXT-ANALYSIS] VIP contacts: ${trueVipContacts.length} passed, ${computedVipContacts.length} computed, using ${effectiveVipContacts.length}`,
    );
    return effectiveVipContacts;
  }

  private buildAnalysisFromBatches(
    finalStats: Record<string, unknown>,
    totalBatches: number,
  ): { context: ContextItemWithThreads[]; writingStyle: WritingStyle } {
    const finalBatchResults =
      (finalStats.batchResults as Record<string, BatchResult>) || {};
    const { allContextItems, combinedWritingStyle } = this.combineBatchResults(
      finalBatchResults,
      totalBatches,
    );
    return {
      context: allContextItems,
      writingStyle: combinedWritingStyle || {
        tone: "Professional",
        style: "Concise",
        commonPhrases: [],
      },
    };
  }

  private async runFinalizationSteps(
    userId: string,
    analysis: { context: ContextItemWithThreads[]; writingStyle: WritingStyle },
    effectiveVipContacts: VipContactEntry[],
  ): Promise<void> {
    await this.usersService.update(userId, {
      scanProgress: 70,
      scanTotal: 100,
    });

    if (analysis.context) {
      writeAnalysisLog(
        `[FINALIZATION] Step 2/6: Deduplicating ${analysis.context.length} context items...`,
        "log",
      );
      analysis.context = await this.deduplicateLlmOutput(analysis.context);
      analysis.context = await this.consolidateEmailCategories(
        userId,
        analysis.context,
      );
    }

    await this.usersService.update(userId, {
      scanProgress: 80,
      scanTotal: 100,
    });
    writeAnalysisLog(
      `[FINALIZATION] Step 4/6: Deduplicating existing context...`,
      "log",
    );
    await this.usersService.update(userId, {
      scanProgress: 81,
      scanTotal: 100,
    });
    await this.crudService.deduplicateExistingContext(userId);

    writeAnalysisLog(
      `[FINALIZATION] Step 5/6: Saving ${effectiveVipContacts.length} VIP contacts...`,
      "log",
    );
    await this.saveVipContacts(userId, effectiveVipContacts);

    writeAnalysisLog(
      `[FINALIZATION] Step 6/6: Processing ${analysis.context?.length ?? 0} context items...`,
      "log",
    );
    if (analysis.context) {
      await this.processContextItems(userId, analysis.context);
      await this.usersService.update(userId, {
        scanProgress: 85,
        scanTotal: 100,
      });
    }

    await this.saveWritingStyle(userId, analysis.writingStyle);
  }

  private async persistFinalAnalysisRecord(options: {
    analysisRecord: ContextAnalysis;
    analysisStats: AnalysisStatsInput;
    totalThreads: number;
    sentEmailsCount: number;
    vipContactsEvaluated: number;
    finalStats: Record<string, unknown>;
  }): Promise<void> {
    const {
      analysisRecord,
      analysisStats,
      totalThreads,
      sentEmailsCount,
      vipContactsEvaluated,
      finalStats,
    } = options;
    const { threadsNeverOpened, threadsReadButNotReplied } =
      this.computeThreadStats(finalStats);

    analysisRecord.stats = {
      totalThreads: analysisStats.totalThreads || totalThreads,
      outboundEmails: analysisStats.outboundEmails || sentEmailsCount,
      threadsNeverOpened,
      threadsReadButNotReplied,
      vipContactsEvaluated:
        vipContactsEvaluated || analysisStats.vipContactsEvaluated || 0,
    };
    await this.contextAnalysisRepository.save(analysisRecord);

    analysisRecord.status = "completed";
    analysisRecord.progress = 100;
    analysisRecord.total = 100;
    const actualThreadCount = analysisRecord.analyzedCount || totalThreads;
    analysisRecord.threadCount = actualThreadCount;
    analysisRecord.analyzedCount = actualThreadCount;
    await this.contextAnalysisRepository.save(analysisRecord);
  }

  private computeVipContactsFromPayloads(
    finalStats: Record<string, unknown>,
  ): VipContactEntry[] {
    const batchPayloads =
      (finalStats.batchPayloadsForRetry as Record<
        number,
        BatchPayloadThread[]
      >) || {};

    const vipMap = new Map<
      string,
      {
        emailKey: string;
        from: string;
        fromName?: string;
        threadCount: number;
        starCount: number;
        quickReplyCount: number;
      }
    >();

    for (const batchPayload of Object.values(batchPayloads)) {
      for (const thread of batchPayload) {
        this.accumulateVipEntry(vipMap, thread);
      }
    }

    return Array.from(vipMap.values())
      .filter(
        (vip) =>
          vip.starCount >= 3 ||
          vip.quickReplyCount >= 2 ||
          vip.threadCount >= 3,
      )
      .map((vip) => ({
        emailKey: vip.emailKey,
        from: vip.from,
        fromName: vip.fromName,
        threadCount: vip.threadCount,
      }));
  }

  private accumulateVipEntry(
    vipMap: Map<
      string,
      {
        emailKey: string;
        from: string;
        fromName?: string;
        threadCount: number;
        starCount: number;
        quickReplyCount: number;
      }
    >,
    thread: BatchPayloadThread,
  ): void {
    const emailKey = thread.from.toLowerCase();
    const isStarred = thread.starCount && thread.starCount > 0;
    const isQuickReply =
      thread.timeToReply !== null &&
      thread.timeToReply !== undefined &&
      thread.timeToReply < CONTEXT_ANALYSIS.HOUR_MS;

    if (!isStarred && !isQuickReply) return;

    const existing = vipMap.get(emailKey);
    if (existing) {
      existing.threadCount++;
      existing.starCount += thread.starCount || 0;
      if (isQuickReply) existing.quickReplyCount++;
    } else {
      vipMap.set(emailKey, {
        emailKey,
        from: thread.from,
        fromName: thread.fromName,
        threadCount: 1,
        starCount: thread.starCount || 0,
        quickReplyCount: isQuickReply ? 1 : 0,
      });
    }
  }

  private combineBatchResults(
    batchResults: Record<string, BatchResult>,
    totalBatches: number,
  ): {
    allContextItems: ContextItemWithThreads[];
    combinedWritingStyle: WritingStyle | null;
  } {
    const allContextItems: ContextItemWithThreads[] = [];
    let combinedWritingStyle: WritingStyle | null = null;

    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const batchResult = batchResults[String(batchNum)];
      if (!batchResult) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Batch ${batchNum} result not found`,
        );
        continue;
      }
      if (batchResult.error) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Batch ${batchNum} failed: ${batchResult.error}`,
        );
        continue;
      }
      if (batchResult.context) {
        const batchThreadIds = (batchResult.threadIds as string[]) || [];
        allContextItems.push(
          ...batchResult.context.map((item) => ({
            ...item,
            sourceThreadIds: batchThreadIds,
          })),
        );
      }
      combinedWritingStyle = this.mergeWritingStyle(
        combinedWritingStyle,
        batchResult.writingStyle ?? null,
      );
    }

    return { allContextItems, combinedWritingStyle };
  }

  private mergeWritingStyle(
    existing: WritingStyle | null,
    incoming: WritingStyle | null,
  ): WritingStyle | null {
    if (!incoming) return existing;
    if (!existing) return incoming;
    existing.commonPhrases = [
      ...existing.commonPhrases,
      ...incoming.commonPhrases,
    ];
    if (incoming.emailExamples?.length) {
      existing.emailExamples = [
        ...(existing.emailExamples || []),
        ...incoming.emailExamples,
      ].slice(0, 3);
    }
    return existing;
  }

  private async deduplicateLlmOutput(
    contextItems: ContextItemWithThreads[],
  ): Promise<ContextItemWithThreads[]> {
    const deduplicated: ContextItemWithThreads[] = [];

    for (const item of contextItems) {
      if (!item?.key || !item.value) continue;

      const valueStr = String(item.value).trim();
      const keyStr = String(item.key).toUpperCase();
      const lowerValue = valueStr.toLowerCase();

      if (
        NOT_REPLY_INDICATORS.some((indicator) => lowerValue.includes(indicator))
      )
        continue;

      if (!this.isDuplicate(valueStr, keyStr, deduplicated)) {
        deduplicated.push(item);
      }
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] Deduped LLM output: ${deduplicated.length} unique (from ${contextItems.length})`,
    );
    return deduplicated;
  }

  private isDuplicate(
    valueStr: string,
    keyStr: string,
    deduplicated: ContextItemWithThreads[],
  ): boolean {
    for (const existing of deduplicated) {
      try {
        if (
          existing.key.toUpperCase() === keyStr &&
          this.piiRedactionService.areContextValuesSimilar(
            valueStr,
            existing.value,
          )
        ) {
          return true;
        }
      } catch (err) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Error checking similarity: ${getErrorMessage(err)}`,
        );
      }
    }
    return false;
  }

  private async consolidateEmailCategories(
    userId: string,
    contextItems: ContextItemWithThreads[],
  ): Promise<ContextItemWithThreads[]> {
    const emailCategories = contextItems.filter(
      (item) => item.key.toUpperCase() === ContextKey.EMAIL_CATEGORY,
    );
    if (emailCategories.length === 0) return contextItems;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Consolidating ${emailCategories.length} email categories...`,
    );

    const autoGeneratedCategories = emailCategories.map((item) => {
      const { name, description } = parseCategoryValue(item.value);
      return { name, description: description ?? "" };
    });

    const existingUserCategories = await this.contextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
        source: Source.USER_EDITED,
      },
    });
    const userAddedCategories = existingUserCategories.map((ctx) => {
      const { name, description } = parseCategoryValue(ctx.contextValue);
      return { name, description: description ?? "" };
    });

    try {
      const consolidated = await this.llmService.consolidateEmailCategories(
        autoGeneratedCategories,
        userAddedCategories,
        undefined,
        userId,
      );
      const nonCategoryItems = contextItems.filter(
        (item) => item.key.toUpperCase() !== ContextKey.EMAIL_CATEGORY,
      );
      const consolidatedCategoryItems = consolidated
        .filter((cat) => !cat.isUserAdded)
        .map((cat) => ({
          key: ContextKey.EMAIL_CATEGORY,
          value: `${cat.name} - ${cat.description}`,
          source: "email_analysis",
        }));
      return [...nonCategoryItems, ...consolidatedCategoryItems];
    } catch (consolidateError) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Category consolidation failed, keeping original: ${getErrorMessage(consolidateError)}`,
      );
      return contextItems;
    }
  }

  private async saveVipContacts(
    userId: string,
    vipContacts: VipContactEntry[],
  ): Promise<void> {
    const existingVipContacts = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.VIP_CONTACT },
    });
    const addedThisRun: string[] = [];
    let added = 0;
    let skipped = 0;

    for (const contact of vipContacts) {
      const displayName = contact.fromName || contact.from;
      const shouldSkip = await this.shouldSkipVipContact(
        displayName,
        existingVipContacts,
        addedThisRun,
      );
      if (shouldSkip) {
        skipped++;
        continue;
      }

      const explanation = `vipContactStarredExplanation:${contact.threadCount}`;
      await this.crudService.createOrUpdateContext(
        userId,
        ContextKey.VIP_CONTACT,
        displayName,
        Source.AUTOGENERATED,
        { explanation },
      );
      addedThisRun.push(displayName);
      added++;
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] VIP contacts: ${added} added, ${skipped} skipped`,
    );
    writeAnalysisLog(`VIP contacts: ${added} added, ${skipped} skipped`, "log");
  }

  private async shouldSkipVipContact(
    displayName: string,
    existingContacts: UserContext[],
    addedThisRun: string[],
  ): Promise<boolean> {
    const exactMatch = existingContacts.find(
      (existing) =>
        existing.contextValue.toLowerCase() === displayName.toLowerCase(),
    );
    if (exactMatch) return true;

    for (const existing of existingContacts) {
      try {
        if (
          this.piiRedactionService.areContextValuesSimilar(
            displayName,
            existing.contextValue,
          )
        ) {
          return true;
        }
      } catch (err) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] VIP similarity error: ${getErrorMessage(err)}`,
        );
      }
    }

    for (const addedName of addedThisRun) {
      try {
        if (
          this.piiRedactionService.areContextValuesSimilar(
            displayName,
            addedName,
          )
        ) {
          return true;
        }
      } catch (err) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] VIP run similarity error: ${getErrorMessage(err)}`,
        );
      }
    }

    return false;
  }

  private async processContextItems(
    userId: string,
    contextItems: ContextItemWithThreads[],
  ): Promise<void> {
    for (const item of contextItems) {
      if (!item?.key || !item.value) continue;
      const trimmedValue = String(item.value).trim();
      if (!trimmedValue) continue;
      await this.processSingleContextItem(userId, item, trimmedValue);
    }
  }

  private async processSingleContextItem(
    userId: string,
    item: ContextItemWithThreads,
    trimmedValue: string,
  ): Promise<void> {
    const keyStr = String(item.key);
    const keyUpper = keyStr.toUpperCase();
    const keyLower = keyStr.toLowerCase();
    const valueLower = trimmedValue.toLowerCase();

    if (
      keyUpper === "VIP_CONTACT" ||
      keyUpper === "VIP" ||
      keyLower.includes("vip") ||
      keyLower.includes("important contact")
    ) {
      return;
    }

    const { key, priority } = mapContextItemKey(keyUpper, keyLower, valueLower);

    const exactMatch = await this.contextRepository
      .createQueryBuilder("context")
      .where("context.userId = :userId", { userId })
      .andWhere("context.contextKey = :key", { key })
      .andWhere("LOWER(TRIM(context.contextValue)) = LOWER(TRIM(:value))", {
        value: trimmedValue,
      })
      .getOne();
    if (exactMatch) return;

    const existingContexts = await this.contextRepository.find({
      where: { userId },
    });
    for (const existing of existingContexts) {
      try {
        if (
          this.piiRedactionService.areContextValuesSimilar(
            trimmedValue,
            existing.contextValue,
          )
        ) {
          return;
        }
      } catch (err) {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Similarity error: ${getErrorMessage(err)}`,
        );
      }
    }

    const explanationStr = item.source ? String(item.source) : undefined;
    await this.crudService.createOrUpdateContext(
      userId,
      key,
      trimmedValue,
      Source.AUTOGENERATED,
      {
        priority,
        explanation: explanationStr,
        sourceThreadIds: item.sourceThreadIds,
      },
    );
  }

  private async saveWritingStyle(
    userId: string,
    writingStyle: WritingStyle | null,
  ): Promise<void> {
    if (!writingStyle) return;

    const writingStyleRules: string[] = [];
    if (writingStyle.tone?.trim())
      writingStyleRules.push(`Tone: ${writingStyle.tone}`);
    if (writingStyle.style?.trim())
      writingStyleRules.push(`Style: ${writingStyle.style}`);
    for (const phrase of writingStyle.commonPhrases || []) {
      if (phrase?.trim()) writingStyleRules.push(`Common phrase: "${phrase}"`);
    }

    const emailExamples =
      (writingStyle as { emailExamples?: string[] }).emailExamples || [];
    for (const example of emailExamples) {
      if (example?.trim()) {
        const redacted = await this.llmService.redactNamesWithLLM(example);
        writingStyleRules.push(`Example: ${redacted}`);
      }
    }

    if (writingStyleRules.length === 0) return;

    const user = await this.usersService.findOne(userId);
    const existingRules = user?.toneSettings?.rules || [];
    const isEmailExample = (rule: string) =>
      !rule.startsWith("Tone:") &&
      !rule.startsWith("Style:") &&
      !rule.startsWith("Common phrase:");

    const existingExampleCount = existingRules.filter((rule: string) =>
      isEmailExample(rule),
    ).length;
    const newRules = writingStyleRules.filter(
      (rule) => !existingRules.some((existing: string) => existing === rule),
    );
    const newExamples = newRules.filter((rule) => isEmailExample(rule));
    const newNonExamples = newRules.filter((rule) => !isEmailExample(rule));
    const maxNewExamples = Math.max(
      0,
      CONTEXT_ANALYSIS.BATCH_ITEMS - existingExampleCount,
    );
    const mergedRules = [
      ...existingRules,
      ...newNonExamples,
      ...newExamples.slice(0, maxNewExamples),
    ];

    await this.usersService.update(userId, {
      toneSettings: { rules: mergedRules },
    });
    this.logger.log(
      `[CONTEXT-ANALYSIS] Saved ${newRules.length} new writing style rules (total: ${mergedRules.length})`,
    );
  }

  private computeThreadStats(finalStats: Record<string, unknown>): {
    threadsNeverOpened: number;
    threadsReadButNotReplied: number;
  } {
    const batchPayloads =
      (finalStats.batchPayloadsForRetry as Record<
        number,
        Array<{ isRead?: boolean; timeToReply?: number | null }>
      >) || {};

    let threadsNeverOpened = 0;
    let threadsReadButNotReplied = 0;

    for (const batchPayload of Object.values(batchPayloads)) {
      for (const thread of batchPayload) {
        if (thread.isRead === false) {
          threadsNeverOpened++;
        } else if (thread.isRead === true && thread.timeToReply == null) {
          threadsReadButNotReplied++;
        }
      }
    }

    return { threadsNeverOpened, threadsReadButNotReplied };
  }
}
