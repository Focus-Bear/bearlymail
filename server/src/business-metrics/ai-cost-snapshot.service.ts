import { Injectable } from "@nestjs/common";

import { MILLISECONDS } from "../constants/time-constants";
import { TokenUsageService } from "../llm/token-usage.service";
import { utcDateOf } from "./business-metrics.constants";

/** Sub-cent precision: a quiet day's AI spend can be fractions of a cent. */
const COST_DECIMAL_PLACES = 4;

/**
 * Builds the daily `ai_cost_snapshot` properties: estimated AI (LLM) spend for
 * one UTC day from token_usage, priced by LLM_MODEL_PRICING.
 */
@Injectable()
export class AiCostSnapshotService {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  /** AI costs for the UTC day starting at `dayStart`. */
  async buildSnapshot(dayStart: Date): Promise<Record<string, unknown>> {
    const usage = await this.tokenUsageService.getUsageSummary({
      startDate: dayStart,
      // getUsageSummary's range is inclusive at both ends.
      endDate: new Date(dayStart.getTime() + MILLISECONDS.DAY - 1),
    });
    return {
      cost_date: utcDateOf(dayStart),
      ai_cost_usd: Number(
        usage.totalEstimatedCostUsd.toFixed(COST_DECIMAL_PLACES),
      ),
      ai_unpriced_call_count: usage.unpricedCallCount,
      ai_call_count: usage.totalCalls,
      ai_total_tokens: usage.totalTokens,
    };
  }
}
