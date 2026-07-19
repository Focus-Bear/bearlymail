import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AutoResponderConfig } from "../auto-responder/types/auto-responder.types";
import { DATA_IMPORT_MERGE_MODES } from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { User } from "../database/entities/user.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { ExportedUserData } from "./data-export.service";

export interface ImportOptions {
  /** Whether to replace existing data or merge with it */
  mergeMode: "replace" | "merge";
  /** Which sections to import */
  sections: {
    profile?: boolean;
    batchSchedule?: boolean;
    blockedSenders?: boolean;
    blockedKeywords?: boolean;
    contexts?: boolean;
    toneRules?: boolean;
    summarizationRules?: boolean;
    autoResponderSettings?: boolean;
  };
}

export interface ImportResult {
  success: boolean;
  imported: {
    profile: boolean;
    batchSchedule: boolean;
    blockedSenders: number;
    blockedKeywords: number;
    contexts: number;
    toneRules: number;
    summarizationRules: number;
    autoResponderSettings: boolean;
  };
  skipped: {
    blockedSenders: number;
    blockedKeywords: number;
    contexts: number;
  };
  errors: string[];
}

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  mergeMode: "merge",
  sections: {
    profile: true,
    batchSchedule: true,
    blockedSenders: true,
    blockedKeywords: true,
    contexts: true,
    toneRules: true,
    summarizationRules: true,
    autoResponderSettings: true,
  },
};

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(BatchSchedule)
    private batchScheduleRepository: Repository<BatchSchedule>,
    @InjectRepository(BlockedSender)
    private blockedSenderRepository: Repository<BlockedSender>,
    @InjectRepository(BlockedKeyword)
    private blockedKeywordRepository: Repository<BlockedKeyword>,
    @InjectRepository(SummarizationRule)
    private summarizationRuleRepository: Repository<SummarizationRule>,
  ) {}

  /**
   * Validate the imported data structure
   */
  private validateImportData(rawInput: unknown): ExportedUserData {
    if (!rawInput || typeof rawInput !== "object") {
      throw new BadRequestException(
        "Invalid import data: must be a JSON object",
      );
    }

    const importData = rawInput as Record<string, unknown>;

    // Check required fields
    if (!importData.version) {
      throw new BadRequestException(
        "Invalid import data: missing version field",
      );
    }

    if (!importData.exportedAt) {
      throw new BadRequestException(
        "Invalid import data: missing exportedAt field",
      );
    }

    // Validate version compatibility
    const version = importData.version as string;
    if (!version.startsWith("1.")) {
      throw new BadRequestException(
        `Incompatible import version: ${version}. Expected version 1.x`,
      );
    }

    return importData as unknown as ExportedUserData;
  }

  /**
   * Import user data from a JSON export
   */
  async importUserData(
    userId: string,
    rawInput: unknown,
    options: Partial<ImportOptions> = {},
  ): Promise<ImportResult> {
    const mergedOptions: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      ...options,
      sections: {
        ...DEFAULT_IMPORT_OPTIONS.sections,
        ...options.sections,
      },
    };

    const importData = this.validateImportData(rawInput);
    const result: ImportResult = {
      success: true,
      imported: {
        profile: false,
        batchSchedule: false,
        blockedSenders: 0,
        blockedKeywords: 0,
        contexts: 0,
        toneRules: 0,
        summarizationRules: 0,
        autoResponderSettings: false,
      },
      skipped: { blockedSenders: 0, blockedKeywords: 0, contexts: 0 },
      errors: [],
    };

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    try {
      await this.doImportSections(userId, importData, mergedOptions, result);
      this.logger.log(
        `Successfully imported data for user ${userId}: ${JSON.stringify(result.imported)}`,
      );
    } catch (error) {
      this.logger.error(`Error importing data for user ${userId}:`, error);
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : "Unknown error during import",
      );
    }

    return result;
  }

  private async doImportSections(
    userId: string,
    importData: ExportedUserData,
    mergedOptions: ImportOptions,
    result: ImportResult,
  ): Promise<void> {
    if (mergedOptions.sections.profile && importData.profile) {
      await this.importProfile(userId, importData.profile);
      result.imported.profile = true;
    }

    if (mergedOptions.sections.batchSchedule && importData.batchSchedule) {
      await this.importBatchSchedule(
        userId,
        importData.batchSchedule,
        mergedOptions.mergeMode,
      );
      result.imported.batchSchedule = true;
    }

    if (mergedOptions.sections.blockedSenders && importData.blockedSenders) {
      const { imported, skipped } = await this.importBlockedSenders(
        userId,
        importData.blockedSenders,
        mergedOptions.mergeMode,
      );
      result.imported.blockedSenders = imported;
      result.skipped.blockedSenders = skipped;
    }

    if (mergedOptions.sections.blockedKeywords && importData.blockedKeywords) {
      const { imported, skipped } = await this.importBlockedKeywords(
        userId,
        importData.blockedKeywords,
        mergedOptions.mergeMode,
      );
      result.imported.blockedKeywords = imported;
      result.skipped.blockedKeywords = skipped;
    }

    if (mergedOptions.sections.contexts && importData.contexts) {
      const { imported, skipped } = await this.importContexts(
        userId,
        importData.contexts,
        mergedOptions.mergeMode,
      );
      result.imported.contexts = imported;
      result.skipped.contexts = skipped;
    }

    if (mergedOptions.sections.toneRules && importData.toneRules) {
      await this.importToneRules(
        userId,
        importData.toneRules,
        mergedOptions.mergeMode,
      );
      result.imported.toneRules = importData.toneRules.length;
    }

    if (
      mergedOptions.sections.summarizationRules &&
      importData.summarizationRules
    ) {
      const imported = await this.importSummarizationRules(
        userId,
        importData.summarizationRules,
        mergedOptions.mergeMode,
      );
      result.imported.summarizationRules = imported;
    }

    if (
      mergedOptions.sections.autoResponderSettings &&
      importData.autoResponderSettings
    ) {
      await this.importAutoResponderSettings(
        userId,
        importData.autoResponderSettings,
      );
      result.imported.autoResponderSettings = true;
    }
  }

  private async importProfile(
    userId: string,
    profile: ExportedUserData["profile"],
  ): Promise<void> {
    const updates: Partial<User> = {};

    if (profile.displayName !== undefined) {
      updates.displayName = profile.displayName;
    }
    if (profile.jobTitle !== undefined) {
      updates.jobTitle = profile.jobTitle;
    }

    if (Object.keys(updates).length > 0) {
      await this.userRepository.update(userId, updates);
    }
  }

  private async importBatchSchedule(
    userId: string,
    schedule: NonNullable<ExportedUserData["batchSchedule"]>,
    mergeMode: "replace" | "merge",
  ): Promise<void> {
    const existing = await this.batchScheduleRepository.findOne({
      where: { userId },
    });

    if (existing) {
      if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
        await this.batchScheduleRepository.update(existing.id, {
          deliveryDays: schedule.deliveryDays,
          deliveryTimes: schedule.deliveryTimes,
          timezone: schedule.timezone,
          isEnabled: schedule.isEnabled,
          urgentBypassSchedule: schedule.urgentBypassSchedule,
        });
      } else {
        // In merge mode, only update fields that have meaningful values
        await this.batchScheduleRepository.update(existing.id, {
          deliveryDays: schedule.deliveryDays,
          deliveryTimes: schedule.deliveryTimes,
          timezone: schedule.timezone,
          isEnabled: schedule.isEnabled,
          urgentBypassSchedule: schedule.urgentBypassSchedule,
        });
      }
    } else {
      await this.batchScheduleRepository.save({
        userId,
        deliveryDays: schedule.deliveryDays,
        deliveryTimes: schedule.deliveryTimes,
        timezone: schedule.timezone,
        isEnabled: schedule.isEnabled,
        urgentBypassSchedule: schedule.urgentBypassSchedule,
      });
    }
  }

  private async importBlockedSenders(
    userId: string,
    senders: ExportedUserData["blockedSenders"],
    mergeMode: "replace" | "merge",
  ): Promise<{ imported: number; skipped: number }> {
    if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
      await this.blockedSenderRepository.delete({ userId });
    }

    let imported = 0;
    let skipped = 0;

    for (const sender of senders) {
      const emailHash = EncryptionHelper.hashEmail(sender.email);

      // Check if already exists
      const existing = await this.blockedSenderRepository.findOne({
        where: { userId, emailHash },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Extract domain hash if email contains @
      let domainHash: string | undefined;
      if (sender.email.includes("@")) {
        const domain = sender.email.split("@")[1];
        if (domain) {
          domainHash = EncryptionHelper.hashEmail(domain);
        }
      }

      await this.blockedSenderRepository.save({
        userId,
        email: sender.email,
        emailHash,
        domainHash,
        senderName: sender.senderName,
        reason: sender.reason,
        blockedAt: new Date(sender.blockedAt),
      });

      imported++;
    }

    return { imported, skipped };
  }

  private async importBlockedKeywords(
    userId: string,
    keywords: ExportedUserData["blockedKeywords"],
    mergeMode: "replace" | "merge",
  ): Promise<{ imported: number; skipped: number }> {
    if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
      await this.blockedKeywordRepository.delete({ userId });
    }

    let imported = 0;
    let skipped = 0;

    for (const keyword of keywords) {
      const keywordHash = EncryptionHelper.hashEmail(
        keyword.keyword.toLowerCase(),
      );

      // Check if already exists
      const existing = await this.blockedKeywordRepository.findOne({
        where: { userId, keywordHash },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await this.blockedKeywordRepository.save({
        userId,
        keyword: keyword.keyword,
        keywordHash,
        exactMatch: keyword.exactMatch,
        reason: keyword.reason,
        blockedAt: new Date(keyword.blockedAt),
      });

      imported++;
    }

    return { imported, skipped };
  }

  private async importContexts(
    userId: string,
    contexts: ExportedUserData["contexts"],
    mergeMode: "replace" | "merge",
  ): Promise<{ imported: number; skipped: number }> {
    if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
      await this.userContextRepository.delete({ userId });
    }

    let imported = 0;
    let skipped = 0;

    for (const context of contexts) {
      // Validate context key is a valid enum value
      if (
        !Object.values(ContextKey).includes(context.contextKey as ContextKey)
      ) {
        this.logger.warn(`Skipping invalid context key: ${context.contextKey}`);
        skipped++;
        continue;
      }

      // Check for duplicate in merge mode
      if (mergeMode === DATA_IMPORT_MERGE_MODES.MERGE) {
        const existing = await this.userContextRepository.findOne({
          where: {
            userId,
            contextKey: context.contextKey as ContextKey,
            contextValue: context.contextValue,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }
      }

      // Validate source is a valid enum value
      const source =
        context.source === "USER_EDITED"
          ? Source.USER_EDITED
          : Source.AUTOGENERATED;

      await this.userContextRepository.save({
        userId,
        contextKey: context.contextKey as ContextKey,
        contextValue: context.contextValue,
        priority: context.priority,
        source,
        explanation: context.explanation,
      });

      imported++;
    }

    return { imported, skipped };
  }

  private async importToneRules(
    userId: string,
    toneRules: string[],
    mergeMode: "replace" | "merge",
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
      await this.userRepository.update(userId, {
        toneSettings: { rules: toneRules },
      });
    } else {
      // Merge: combine existing rules with new ones, avoiding duplicates
      const existingRules = user.toneSettings?.rules || [];
      const mergedRules = [...new Set([...existingRules, ...toneRules])];
      await this.userRepository.update(userId, {
        toneSettings: { rules: mergedRules },
      });
    }
  }

  private async importSummarizationRules(
    userId: string,
    rules: ExportedUserData["summarizationRules"],
    mergeMode: "replace" | "merge",
  ): Promise<number> {
    if (mergeMode === DATA_IMPORT_MERGE_MODES.REPLACE) {
      await this.summarizationRuleRepository.delete({ userId });
    }

    let imported = 0;

    for (const rule of rules) {
      // Check for duplicate in merge mode
      if (mergeMode === DATA_IMPORT_MERGE_MODES.MERGE) {
        const existing = await this.summarizationRuleRepository.findOne({
          where: {
            userId,
            whenToUse: rule.whenToUse,
            howToSummarize: rule.howToSummarize,
          },
        });

        if (existing) {
          continue;
        }
      }

      await this.summarizationRuleRepository.save({
        userId,
        whenToUse: rule.whenToUse,
        howToSummarize: rule.howToSummarize,
      });

      imported++;
    }

    return imported;
  }

  private async importAutoResponderSettings(
    userId: string,
    settings: AutoResponderConfig,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      autoResponderSettings: settings,
    });
  }
}
