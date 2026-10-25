import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { MILLISECONDS } from "../constants/time-constants";
import { TokenUsageService } from "../llm/token-usage.service";
import {
  AVERAGE_DAYS_PER_MONTH,
  COST_CATEGORY_PATTERN,
  COST_CURRENCY,
  COST_SNAPSHOT_ENV,
  utcDateOf,
} from "./business-metrics.constants";

/** Sub-cent precision: a quiet day's LLM spend can be fractions of a cent. */
const COST_DECIMAL_PLACES = 4;

const roundUsd = (value: number): number =>
  Number(value.toFixed(COST_DECIMAL_PLACES));

/**
 * Builds the daily `cost_snapshot` properties: estimated LLM spend for the day
 * from token_usage (priced by LLM_MODEL_PRICING) plus configured fixed monthly
 * costs spread evenly per day. It makes no cloud billing API calls, so it
 * needs no extra IAM; AWS spend comes in through the fixed-cost config.
 */
@Injectable()
export class CostSnapshotService {
  private readonly logger = new Logger(CostSnapshotService.name);
  private readonly isEnabled: boolean;
  private readonly fixedMonthlyUsd: Record<string, number>;

  constructor(
    private readonly tokenUsageService: TokenUsageService,
    configService: ConfigService,
  ) {
    this.isEnabled =
      configService.get<string>(COST_SNAPSHOT_ENV.ENABLED) ===
      BOOLEAN_STRING_VALUES.TRUE;
    this.fixedMonthlyUsd = this.parseFixedMonthlyCosts(
      configService.get<string>(COST_SNAPSHOT_ENV.FIXED_MONTHLY_USD),
    );
  }

  enabled(): boolean {
    return this.isEnabled;
  }

  /** Costs for the UTC day starting at `dayStart`. */
  async buildSnapshot(dayStart: Date): Promise<Record<string, unknown>> {
    const llmUsage = await this.tokenUsageService.getUsageSummary({
      startDate: dayStart,
      // getUsageSummary's range is inclusive at both ends.
      endDate: new Date(dayStart.getTime() + MILLISECONDS.DAY - 1),
    });
    const fixedCosts = this.dailyFixedCosts();
    const fixedTotalUsd = Object.values(fixedCosts).reduce(
      (total, cost) => total + cost,
      0,
    );
    return {
      cost_date: utcDateOf(dayStart),
      currency: COST_CURRENCY,
      llm_estimated_cost_usd: roundUsd(llmUsage.totalEstimatedCostUsd),
      llm_unpriced_call_count: llmUsage.unpricedCallCount,
      llm_call_count: llmUsage.totalCalls,
      llm_total_tokens: llmUsage.totalTokens,
      ...fixedCosts,
      fixed_costs_total_usd: roundUsd(fixedTotalUsd),
      total_cost_usd: roundUsd(llmUsage.totalEstimatedCostUsd + fixedTotalUsd),
    };
  }

  private dailyFixedCosts(): Record<string, number> {
    return Object.fromEntries(
      Object.entries(this.fixedMonthlyUsd).map(([category, monthlyUsd]) => [
        `fixed_cost_${category}_usd`,
        roundUsd(monthlyUsd / AVERAGE_DAYS_PER_MONTH),
      ]),
    );
  }

  /** Invalid entries are skipped (and logged) so one typo can't stop the snapshot. */
  private parseFixedMonthlyCosts(
    raw: string | undefined,
  ): Record<string, number> {
    if (!raw) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(
        `${COST_SNAPSHOT_ENV.FIXED_MONTHLY_USD} is not valid JSON — fixed costs omitted`,
      );
      return {};
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this.logger.warn(
        `${COST_SNAPSHOT_ENV.FIXED_MONTHLY_USD} must be a JSON object — fixed costs omitted`,
      );
      return {};
    }
    const costs: Record<string, number> = {};
    for (const [category, value] of Object.entries(parsed)) {
      const isValid =
        COST_CATEGORY_PATTERN.test(category) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0;
      if (isValid) {
        costs[category] = value;
      } else {
        this.logger.warn(`Skipping invalid fixed cost entry '${category}'`);
      }
    }
    return costs;
  }
}
