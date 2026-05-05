import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { User } from "../database/entities/user.entity";
import { LLM_OP_UNKNOWN, LLMOperation } from "./llm-operations";
import { SUMMARY_PROMPT_IDS } from "./prompts";

const SYSTEM_PROMPT_PREVIEW_LENGTH = 5000;

export interface TokenUsageLogData {
  userId?: string | null;
  operation: LLMOperation;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  // Optional: full prompt text for example capture
  promptText?: string;
  systemPromptText?: string;
  // Whether the input prompt contained HTML (auto-detected if promptText provided)
  containsHtml?: boolean;
  // Email IDs processed in this LLM call (for tracking duplicate summarizations)
  emailIds?: string[];
}

/**
 * Represents a captured example of the longest prompt for an operation
 */
export interface PromptExample {
  operation: string;
  promptTokens: number;
  promptText: string;
  systemPromptText?: string;
  containsHtml: boolean;
  capturedAt: Date;
  provider: string;
  model: string;
}

export interface UsageByOperation {
  operation: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
  htmlCallCount: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

export interface DailyUsage {
  date: string;
  callCount: number;
  totalTokens: number;
}

export interface UsageByUser {
  userId: string;
  userEmail: string | null;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export interface UsageQueryOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  provider?: string;
}

@Injectable()
export class TokenUsageService implements OnModuleInit {
  private readonly logger = new Logger(TokenUsageService.name);

  private promptExamples: Map<string, PromptExample> = new Map();

  private readonly MAX_PROMPT_LENGTH = 50000;

  constructor(
    @InjectRepository(TokenUsage)
    private tokenUsageRepository: Repository<TokenUsage>,
    @InjectRepository(PromptExampleEntity)
    private promptExampleRepository: Repository<PromptExampleEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadExamplesFromDb();
  }

  private async loadExamplesFromDb(): Promise<void> {
    try {
      const dbExamples = await this.promptExampleRepository.find();
      for (const row of dbExamples) {
        this.promptExamples.set(row.operation, {
          operation: row.operation,
          promptTokens: row.promptTokens,
          promptText: row.promptText,
          systemPromptText: row.systemPromptText || undefined,
          containsHtml: row.containsHtml,
          capturedAt: row.capturedAt,
          provider: row.provider,
          model: row.model,
        });
      }
      this.logger.log(
        `Loaded ${dbExamples.length} prompt examples from database`,
      );
    } catch (error) {
      this.logger.warn("Failed to load prompt examples from database", error);
    }
  }

  /**
   * Detect if text contains HTML content
   */
  private detectHtml(text: string): boolean {
    if (!text) return false;

    // Common HTML patterns to detect
    const htmlPatterns = [
      // HTML tags
      /<\/?[a-z][\s\S]*>/i,
      // Common HTML elements
      /<(?:html|head|body|div|span|p|table|tr|td|th|ul|ol|li|a|img|script|style|link|meta|form|input|button|header|footer|nav|section|article|aside|main)\b/i,
      // HTML entities
      /&(?:nbsp|lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/i,
      // DOCTYPE
      /<!DOCTYPE\s+html/i,
      // HTML comments
      /<!--[\s\S]*?-->/,
      // Inline styles
      /style\s*=\s*["'][^"']*["']/i,
      // Class attributes
      /class\s*=\s*["'][^"']*["']/i,
    ];

    return htmlPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Capture a prompt example if it's longer than the current stored example
   */
  private captureExample(usageData: TokenUsageLogData): void {
    const {
      operation,
      promptTokens,
      promptText,
      systemPromptText,
      provider,
      model,
    } = usageData;

    if (!promptText) return;

    const existingExample = this.promptExamples.get(operation);

    // Only capture if this prompt is longer (more tokens) than the existing one
    if (!existingExample || promptTokens > existingExample.promptTokens) {
      const fullPromptText = systemPromptText
        ? `[System Prompt]\n${systemPromptText}\n\n[User Prompt]\n${promptText}`
        : promptText;

      const truncatedPrompt =
        fullPromptText.length > this.MAX_PROMPT_LENGTH
          ? `${fullPromptText.substring(
              0,
              this.MAX_PROMPT_LENGTH,
            )}\n... [TRUNCATED]`
          : fullPromptText;

      const example: PromptExample = {
        operation,
        promptTokens,
        promptText: truncatedPrompt,
        systemPromptText: systemPromptText?.substring(
          0,
          SYSTEM_PROMPT_PREVIEW_LENGTH,
        ),
        containsHtml: this.detectHtml(fullPromptText),
        capturedAt: new Date(),
        provider,
        model,
      };

      this.promptExamples.set(operation, example);
      this.logger.debug(
        `Captured new longest prompt example for ${operation}: ${promptTokens} tokens, containsHtml: ${example.containsHtml}`,
      );

      this.persistExample(example).catch((err) =>
        this.logger.warn(
          `Failed to persist prompt example for ${operation}`,
          err,
        ),
      );
    }
  }

  private async persistExample(example: PromptExample): Promise<void> {
    await this.promptExampleRepository.save({
      operation: example.operation,
      promptTokens: example.promptTokens,
      promptText: example.promptText,
      systemPromptText: example.systemPromptText || null,
      containsHtml: example.containsHtml,
      provider: example.provider,
      model: example.model,
    });
  }

  /**
   * Get all captured prompt examples
   */
  getPromptExamples(): PromptExample[] {
    return Array.from(this.promptExamples.values()).sort(
      (itemA, itemB) => itemB.promptTokens - itemA.promptTokens,
    );
  }

  /**
   * Reset all captured prompt examples
   */
  async resetPromptExamples(): Promise<void> {
    const count = this.promptExamples.size;
    this.promptExamples.clear();
    try {
      await this.promptExampleRepository.clear();
    } catch (error) {
      this.logger.warn("Failed to clear prompt examples from database", error);
    }
    this.logger.log(`Reset ${count} prompt examples`);
  }

  /**
   * Log token usage for an LLM API call
   */
  async logUsage(usageData: TokenUsageLogData): Promise<TokenUsage> {
    try {
      // Capture prompt example if prompt text is provided
      if (usageData.promptText) {
        this.captureExample(usageData);
      }

      // Detect HTML in prompt if not explicitly provided
      let containsHtml = usageData.containsHtml ?? false;
      if (usageData.promptText && usageData.containsHtml === undefined) {
        const fullPromptText = usageData.systemPromptText
          ? `${usageData.systemPromptText}\n${usageData.promptText}`
          : usageData.promptText;
        containsHtml = this.detectHtml(fullPromptText);
      }

      const usage = this.tokenUsageRepository.create({
        userId: usageData.userId || null,
        operation: usageData.operation || LLM_OP_UNKNOWN,
        provider: usageData.provider,
        model: usageData.model,
        promptTokens: usageData.promptTokens || 0,
        completionTokens: usageData.completionTokens || 0,
        totalTokens: usageData.totalTokens || 0,
        durationMs: usageData.durationMs || null,
        containsHtml,
        emailIds: usageData.emailIds?.length ? usageData.emailIds : null,
      });

      const saved = await this.tokenUsageRepository.save(usage);
      this.logger.debug(
        `Logged token usage: ${usageData.operation} - ${usageData.totalTokens} tokens (${usageData.provider}/${usageData.model}), containsHtml: ${containsHtml}`,
      );
      return saved;
    } catch (error) {
      // Don't throw - token logging should not break the main flow
      this.logger.error("Failed to log token usage", error);
      return null as unknown as TokenUsage;
    }
  }

  /**
   * Get aggregated usage by operation
   */
  async getUsageByOperation(
    options: UsageQueryOptions = {},
  ): Promise<UsageByOperation[]> {
    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder("tu")
      .select("tu.operation", "operation")
      .addSelect("COUNT(*)::int", "callCount")
      .addSelect("SUM(tu.promptTokens)::int", "totalPromptTokens")
      .addSelect("SUM(tu.completionTokens)::int", "totalCompletionTokens")
      .addSelect("SUM(tu.totalTokens)::int", "totalTokens")
      .addSelect("AVG(tu.durationMs)::int", "avgDurationMs")
      .addSelect(
        "SUM(CASE WHEN tu.containsHtml = true THEN 1 ELSE 0 END)::int",
        "htmlCallCount",
      )
      .groupBy("tu.operation")
      .orderBy("SUM(tu.totalTokens)", "DESC");

    if (options.startDate && options.endDate) {
      queryBuilder.where("tu.createdAt BETWEEN :startDate AND :endDate", {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    } else if (options.startDate) {
      queryBuilder.where("tu.createdAt >= :startDate", {
        startDate: options.startDate,
      });
    }

    if (options.userId) {
      queryBuilder.andWhere("tu.userId = :userId", { userId: options.userId });
    }

    if (options.provider) {
      queryBuilder.andWhere("tu.provider = :provider", {
        provider: options.provider,
      });
    }

    return queryBuilder.getRawMany();
  }

  /**
   * Get total usage summary
   */
  async getUsageSummary(
    options: UsageQueryOptions = {},
  ): Promise<UsageSummary> {
    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder("tu")
      .select("COUNT(*)::int", "totalCalls")
      .addSelect("COALESCE(SUM(tu.promptTokens), 0)::int", "totalPromptTokens")
      .addSelect(
        "COALESCE(SUM(tu.completionTokens), 0)::int",
        "totalCompletionTokens",
      )
      .addSelect("COALESCE(SUM(tu.totalTokens), 0)::int", "totalTokens")
      .addSelect("AVG(tu.durationMs)::int", "avgDurationMs");

    if (options.startDate && options.endDate) {
      queryBuilder.where("tu.createdAt BETWEEN :startDate AND :endDate", {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    } else if (options.startDate) {
      queryBuilder.where("tu.createdAt >= :startDate", {
        startDate: options.startDate,
      });
    }

    if (options.userId) {
      queryBuilder.andWhere("tu.userId = :userId", { userId: options.userId });
    }

    if (options.provider) {
      queryBuilder.andWhere("tu.provider = :provider", {
        provider: options.provider,
      });
    }

    const result = await queryBuilder.getRawOne();
    return {
      totalCalls: parseInt(result.totalCalls, 10) || 0,
      totalPromptTokens: parseInt(result.totalPromptTokens, 10) || 0,
      totalCompletionTokens: parseInt(result.totalCompletionTokens, 10) || 0,
      totalTokens: parseInt(result.totalTokens, 10) || 0,
      avgDurationMs: result.avgDurationMs
        ? parseInt(result.avgDurationMs, 10)
        : null,
    };
  }

  /**
   * Get daily usage breakdown
   */
  async getDailyUsage(options: UsageQueryOptions = {}): Promise<DailyUsage[]> {
    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder("tu")
      .select("DATE(tu.createdAt)", "date")
      .addSelect("COUNT(*)::int", "callCount")
      .addSelect("SUM(tu.totalTokens)::int", "totalTokens")
      .groupBy("DATE(tu.createdAt)")
      .orderBy("DATE(tu.createdAt)", "DESC")
      // Last 30 days
      .limit(CONTEXT_ANALYSIS.TOKEN_USAGE_DAYS);

    if (options.startDate && options.endDate) {
      queryBuilder.where("tu.createdAt BETWEEN :startDate AND :endDate", {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    } else if (options.startDate) {
      queryBuilder.where("tu.createdAt >= :startDate", {
        startDate: options.startDate,
      });
    }

    if (options.userId) {
      queryBuilder.andWhere("tu.userId = :userId", { userId: options.userId });
    }

    if (options.provider) {
      queryBuilder.andWhere("tu.provider = :provider", {
        provider: options.provider,
      });
    }

    return queryBuilder.getRawMany();
  }

  /**
   * Report on duplicate email summarizations.
   * Returns emails that have been processed multiple times for summarization.
   */
  async getDuplicateSummarizationReport(
    options: UsageQueryOptions = {},
  ): Promise<{
    duplicateEmails: Array<{
      emailId: string;
      processCount: number;
      totalTokensUsed: number;
      firstProcessed: Date;
      lastProcessed: Date;
    }>;
    summary: {
      totalDuplicateEmails: number;
      totalWastedCalls: number;
      totalWastedTokens: number;
    };
  }> {
    // Query to find emails that appear multiple times in emailIds
    // We need to unnest the JSON array and count occurrences
    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder("tu")
      .select("email_id.value", "emailId")
      .addSelect("COUNT(*)::int", "processCount")
      .addSelect("SUM(tu.totalTokens)::int", "totalTokensUsed")
      .addSelect("MIN(tu.createdAt)", "firstProcessed")
      .addSelect("MAX(tu.createdAt)", "lastProcessed")
      .innerJoin("jsonb_array_elements_text(tu.emailIds)", "email_id", "true")
      .where("tu.operation = :operation", {
        operation: SUMMARY_PROMPT_IDS.BATCH,
      })
      .orWhere("tu.operation = :singleOp", { singleOp: "summarize_email" })
      .groupBy("email_id.value")
      .having("COUNT(*) > 1")
      .orderBy("COUNT(*)", "DESC");

    if (options.startDate && options.endDate) {
      queryBuilder.andWhere("tu.createdAt BETWEEN :startDate AND :endDate", {
        startDate: options.startDate,
        endDate: options.endDate,
      });
    } else if (options.startDate) {
      queryBuilder.andWhere("tu.createdAt >= :startDate", {
        startDate: options.startDate,
      });
    }

    if (options.userId) {
      queryBuilder.andWhere("tu.userId = :userId", { userId: options.userId });
    }

    try {
      const duplicates = await queryBuilder.getRawMany();

      // Calculate summary
      const totalDuplicateEmails = duplicates.length;
      const totalWastedCalls = duplicates.reduce(
        (sum, duplicate) => sum + (duplicate.processCount - 1),
        0,
      );
      // Estimate wasted tokens (approximate - divide tokens by process count for each email)
      const totalWastedTokens = duplicates.reduce((sum, duplicate) => {
        const tokensPerCall =
          duplicate.totalTokensUsed / duplicate.processCount;
        const wastedCalls = duplicate.processCount - 1;
        return sum + Math.round(tokensPerCall * wastedCalls);
      }, 0);

      return {
        duplicateEmails: duplicates.map((duplicate) => ({
          emailId: duplicate.emailId,
          processCount: parseInt(duplicate.processCount, 10),
          totalTokensUsed: parseInt(duplicate.totalTokensUsed, 10),
          firstProcessed: duplicate.firstProcessed,
          lastProcessed: duplicate.lastProcessed,
        })),
        summary: {
          totalDuplicateEmails,
          totalWastedCalls,
          totalWastedTokens,
        },
      };
    } catch (error) {
      this.logger.error("Failed to get duplicate summarization report", error);
      return {
        duplicateEmails: [],
        summary: {
          totalDuplicateEmails: 0,
          totalWastedCalls: 0,
          totalWastedTokens: 0,
        },
      };
    }
  }

  /**
   * Get top 10 users by total token consumption.
   * Fetches aggregated usage by userId then resolves emails from the users table.
   */
  async getUsageByUser(
    options: UsageQueryOptions = {},
  ): Promise<UsageByUser[]> {
    const TOP_USER_LIMIT = 10;

    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder("tu")
      .select("tu.userId", "userId")
      .addSelect("COUNT(*)::int", "callCount")
      .addSelect("SUM(tu.promptTokens)::int", "totalPromptTokens")
      .addSelect("SUM(tu.completionTokens)::int", "totalCompletionTokens")
      .addSelect("SUM(tu.totalTokens)::int", "totalTokens")
      .where("tu.userId IS NOT NULL")
      .groupBy("tu.userId")
      .orderBy("SUM(tu.totalTokens)", "DESC")
      .limit(TOP_USER_LIMIT);

    if (options.startDate) {
      queryBuilder.andWhere("tu.createdAt >= :startDate", {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      queryBuilder.andWhere("tu.createdAt <= :endDate", {
        endDate: options.endDate,
      });
    }

    if (options.provider) {
      queryBuilder.andWhere("tu.provider = :provider", {
        provider: options.provider,
      });
    }

    const rows: Array<{
      userId: string;
      callCount: number;
      totalPromptTokens: number;
      totalCompletionTokens: number;
      totalTokens: number;
    }> = await queryBuilder.getRawMany();

    if (rows.length === 0) {
      return [];
    }

    // Fetch user records so we get decrypted emails via TypeORM transformers
    const userIds = rows.map((row) => row.userId);
    const users = await this.userRepository
      .createQueryBuilder("u")
      .select(["u.id", "u.email"])
      .whereInIds(userIds)
      .getMany();

    const emailById = new Map(users.map((user) => [user.id, user.email]));

    return rows.map((row) => ({
      userId: row.userId,
      userEmail: emailById.get(row.userId) ?? null,
      callCount: row.callCount,
      totalPromptTokens: row.totalPromptTokens,
      totalCompletionTokens: row.totalCompletionTokens,
      totalTokens: row.totalTokens,
    }));
  }
}
