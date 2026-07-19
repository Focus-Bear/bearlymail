import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AutoResponderConfig } from "../auto-responder/types/auto-responder.types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import {
  CategoryRule,
  CategoryRuleKind,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import {
  decryptBlockedKeywordEntityForApi,
  decryptBlockedSenderEntityForApi,
  decryptSummarizationRuleEntityForApi,
  decryptUserContextEntityForApi,
  decryptUserEntityForApi,
} from "../encryption/entity-api-decrypt.util";

function mapBlockedSender(sender: BlockedSender) {
  return {
    email: sender.email,
    senderName: sender.senderName || undefined,
    reason: sender.reason || undefined,
    blockedAt: sender.blockedAt.toISOString(),
  };
}

function mapBlockedKeyword(keyword: BlockedKeyword) {
  return {
    keyword: keyword.keyword,
    exactMatch: keyword.exactMatch,
    reason: keyword.reason || undefined,
    blockedAt: keyword.blockedAt.toISOString(),
  };
}

function mapContext(context: UserContext) {
  return {
    contextKey: context.contextKey,
    contextValue: context.contextValue,
    priority: context.priority || undefined,
    source: context.source,
    explanation: context.explanation || undefined,
  };
}

function mapCategoryRule(rule: CategoryRule) {
  return {
    categoryName: rule.categoryName,
    ruleKind: rule.ruleKind,
    compositeSpec: rule.compositeSpec,
    isEnabled: rule.isEnabled,
    createdAt: rule.createdAt.toISOString(),
  };
}

export interface ExportedUserData {
  exportedAt: string;
  version: string;
  profile: {
    displayName?: string;
    jobTitle?: string;
  };
  batchSchedule: {
    deliveryDays: number[];
    deliveryTimes: string[];
    timezone: string;
    isEnabled: boolean;
    urgentBypassSchedule: boolean;
  } | null;
  blockedSenders: Array<{
    email: string;
    senderName?: string;
    reason?: string;
    blockedAt: string;
  }>;
  blockedKeywords: Array<{
    keyword: string;
    exactMatch: boolean;
    reason?: string;
    blockedAt: string;
  }>;
  contexts: Array<{
    contextKey: string;
    contextValue: string;
    priority?: number;
    source: string;
    explanation?: string;
  }>;
  toneRules: string[];
  summarizationRules: Array<{
    whenToUse: string;
    howToSummarize: string;
  }>;
  autoResponderSettings: AutoResponderConfig | null;
  integrations: {
    hasOpenAiApiKey: boolean;
    hasGithubToken: boolean;
  };
  categoryRules: Array<{
    categoryName: string;
    ruleKind: CategoryRuleKind;
    compositeSpec: CompositeCategoryRuleSpec | null;
    isEnabled: boolean;
    createdAt: string;
  }>;
}

@Injectable()
export class DataExportService {
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
    @InjectRepository(CategoryRule)
    private categoryRuleRepository: Repository<CategoryRule>,
  ) {}

  async exportUserData(userId: string): Promise<ExportedUserData> {
    const [
      user,
      batchSchedule,
      blockedSenders,
      blockedKeywords,
      contexts,
      summarizationRules,
      categoryRules,
    ] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.batchScheduleRepository.findOne({ where: { userId } }),
      this.blockedSenderRepository.find({
        where: { userId },
        order: { blockedAt: "DESC" },
      }),
      this.blockedKeywordRepository.find({
        where: { userId },
        order: { blockedAt: "DESC" },
      }),
      this.userContextRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      }),
      this.summarizationRuleRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      }),
      this.categoryRuleRepository.find({
        where: { userId },
        order: { createdAt: "DESC" },
      }),
    ]);

    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }
    for (const sender of blockedSenders) {
      decryptBlockedSenderEntityForApi(sender);
    }
    for (const kw of blockedKeywords) {
      decryptBlockedKeywordEntityForApi(kw);
    }
    for (const rule of summarizationRules) {
      decryptSummarizationRuleEntityForApi(rule);
    }

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    decryptUserEntityForApi(user);

    return {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      profile: {
        displayName: user.displayName || undefined,
        jobTitle: user.jobTitle || undefined,
      },
      batchSchedule: batchSchedule
        ? {
            deliveryDays: batchSchedule.deliveryDays,
            deliveryTimes: batchSchedule.deliveryTimes,
            timezone: batchSchedule.timezone,
            isEnabled: batchSchedule.isEnabled,
            urgentBypassSchedule: batchSchedule.urgentBypassSchedule,
          }
        : null,
      blockedSenders: blockedSenders.map(mapBlockedSender),
      blockedKeywords: blockedKeywords.map(mapBlockedKeyword),
      contexts: contexts.map(mapContext),
      toneRules: user.toneSettings?.rules || [],
      summarizationRules: summarizationRules.map((rule) => ({
        whenToUse: rule.whenToUse,
        howToSummarize: rule.howToSummarize,
      })),
      autoResponderSettings: user.autoResponderSettings || null,
      integrations: {
        hasOpenAiApiKey: !!user.openAiApiKey,
        hasGithubToken: !!user.githubToken,
      },
      categoryRules: categoryRules.map(mapCategoryRule),
    };
  }
}
