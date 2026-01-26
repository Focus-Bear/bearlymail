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
}

export interface UsageByOperation {
  operation: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
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

  constructor(
    @InjectRepository(TokenUsage)
    private tokenUsageRepository: Repository<TokenUsage>,
  ) {}

  /**
   * Log token usage for an LLM API call
   */
  async logUsage(data: TokenUsageLogData): Promise<TokenUsage> {
    try {
      const usage = this.tokenUsageRepository.create({
        userId: data.userId || null,
        operation: data.operation || LLM_OP_UNKNOWN,
        provider: data.provider,
        model: data.model,
        promptTokens: data.promptTokens || 0,
        completionTokens: data.completionTokens || 0,
        totalTokens: data.totalTokens || 0,
        durationMs: data.durationMs || null,
      });

      const saved = await this.tokenUsageRepository.save(usage);
      this.logger.debug(
        `Logged token usage: ${data.operation} - ${data.totalTokens} tokens (${data.provider}/${data.model})`,
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
