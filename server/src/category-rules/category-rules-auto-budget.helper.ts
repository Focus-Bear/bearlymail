import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { LLM_OP_SUGGEST_CATEGORY_RULES } from "../llm/llm-operations";
import { TokenUsageService } from "../llm/token-usage.service";

/**
 * True once the user has spent their rolling-24h auto rule-generation LLM
 * budget (see AUTO_GENERATE_MAX_LLM_ATTEMPTS_PER_DAY). Counts the
 * `suggest_category_rules` calls already logged — the first LLM call on the
 * auto path — so a skipped attempt costs nothing.
 */
export async function hasExhaustedAutoGenerationBudget(
  tokenUsageService: Pick<TokenUsageService, "countUserCallsSince">,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - MILLISECONDS.DAY);
  const attempts = await tokenUsageService.countUserCallsSince(
    userId,
    LLM_OP_SUGGEST_CATEGORY_RULES,
    since,
  );
  return (
    attempts >= CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MAX_LLM_ATTEMPTS_PER_DAY
  );
}
