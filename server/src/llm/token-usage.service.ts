import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { LLMOperation, LLM_OP_UNKNOWN } from "./llm-operations";

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

export interface UsageQueryOptions {
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  provider?: string;
}

@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);

  // In-memory storage for prompt examples (longest prompt per operation)
  private promptExamples: Map<string, PromptExample> = new Map();

  // Maximum length of prompt text to store (to prevent memory issues)
  private readonly MAX_PROMPT_LENGTH = 50000;

  constructor(
    @InjectRepository(TokenUsage)
    private tokenUsageRepository: Repository<TokenUsage>,
  ) {}

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
  private captureExample(data: TokenUsageLogData): void {
    const {
      operation,
      promptTokens,
      promptText,
      systemPromptText,
      provider,
      model,
    } = data;

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
        systemPromptText: systemPromptText?.substring(0, 5000),
        containsHtml: this.detectHtml(fullPromptText),
        capturedAt: new Date(),
        provider,
        model,
      };

      this.promptExamples.set(operation, example);
      this.logger.debug(
        `Captured new longest prompt example for ${operation}: ${promptTokens} tokens, containsHtml: ${example.containsHtml}`,
      );
    }
  }

  /**
   * Get all captured prompt examples
   */
  getPromptExamples(): PromptExample[] {
    return Array.from(this.promptExamples.values()).sort(
      (a, b) => b.promptTokens - a.promptTokens,
    );
  }

  /**
   * Reset all captured prompt examples
   */
  resetPromptExamples(): void {
    const count = this.promptExamples.size;
    this.promptExamples.clear();
    this.logger.log(`Reset ${count} prompt examples`);
  }

  /**
   * Log token usage for an LLM API call
   */
  async logUsage(data: TokenUsageLogData): Promise<TokenUsage> {
    try {
      // Capture prompt example if prompt text is provided
      if (data.promptText) {
        this.captureExample(data);
      }

      // Detect HTML in prompt if not explicitly provided
      let containsHtml = data.containsHtml ?? false;
      if (data.promptText && data.containsHtml === undefined) {
        const fullPromptText = data.systemPromptText
          ? `${data.systemPromptText}\n${data.promptText}`
          : data.promptText;
        containsHtml = this.detectHtml(fullPromptText);
      }

      const usage = this.tokenUsageRepository.create({
        userId: data.userId || null,
        operation: data.operation || LLM_OP_UNKNOWN,
        provider: data.provider,
        model: data.model,
        promptTokens: data.promptTokens || 0,
        completionTokens: data.completionTokens || 0,
        totalTokens: data.totalTokens || 0,
        durationMs: data.durationMs || null,
        containsHtml,
      });

      const saved = await this.tokenUsageRepository.save(usage);
      this.logger.debug(
        `Logged token usage: ${data.operation} - ${data.totalTokens} tokens (${data.provider}/${data.model}), containsHtml: ${containsHtml}`,
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
      .limit(30); // Last 30 days

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
}
