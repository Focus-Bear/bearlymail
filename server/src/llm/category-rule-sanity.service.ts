import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BOOLEAN_STRING_VALUES } from "../constants/domain-types";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { LLM_OP_SANITY_CHECK_CATEGORY_RULE } from "./llm-operations";
import {
  buildSanityPromptVariables,
  parseRuleSanityResponse,
  RULE_SANITY_RESPONSE_SCHEMA,
  RuleSanityCheckParams,
  RuleSanityCheckResult,
} from "./llm-rule-sanity";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";
import { resolveStrongGeminiModel } from "./strong-gemini-model.helper";

/** Set to "false" to skip the strong-model review of auto-generated rules. Default on. */
export const CATEGORY_RULE_SANITY_CHECK_ENABLED_ENV_VAR =
  "CATEGORY_RULE_SANITY_CHECK_ENABLED";

const LOG_PREFIX = "[SANITY-CHECK-CATEGORY-RULE]";

/**
 * Strong-model reviewer for AUTO-generated composite category rules. Runs once
 * per candidate (low volume — only after the cheap match/value-add gates pass)
 * and decides whether the rule should be created, rejected, or revised.
 * Rules a person authors in the settings UI never go through this service.
 *
 * Returns `null` when no verdict could be obtained (feature disabled, prompt
 * missing, LLM error, unparseable output after a no-thinking retry) so the
 * caller can decide how to fail — a missing verdict is not a rejection.
 */
@Injectable()
export class CategoryRuleSanityService {
  private readonly logger = new Logger(CategoryRuleSanityService.name);

  constructor(
    private readonly llmCoreService: LLMCoreService,
    private readonly configService: ConfigService,
  ) {}

  get isEnabled(): boolean {
    return (
      this.configService.get<string>(
        CATEGORY_RULE_SANITY_CHECK_ENABLED_ENV_VAR,
      ) !== BOOLEAN_STRING_VALUES.FALSE
    );
  }

  /** The model that produced the verdict, recorded alongside it on the rule. */
  get model(): string {
    return resolveStrongGeminiModel(this.configService);
  }

  async checkRule(
    params: RuleSanityCheckParams,
  ): Promise<RuleSanityCheckResult | null> {
    if (!this.isEnabled) {
      return null;
    }
    const promptConfig = getPrompt(
      UTILITY_PROMPT_IDS.SANITY_CHECK_CATEGORY_RULE,
    );
    if (!promptConfig) {
      this.logger.error(
        `${LOG_PREFIX} ERROR: sanity_check_category_rule prompt not found`,
      );
      return null;
    }
    const prompt = renderPrompt(
      promptConfig.prompt || "",
      buildSanityPromptVariables(params),
    );
    const systemPrompt = promptConfig.systemPrompt || "";

    // Thinking gives the best judgement, but can exhaust the token budget before
    // the JSON body is emitted; retry once without thinking so a budget overrun
    // never silently drops the verdict (same pattern as proto-category dedup).
    let result = parseRuleSanityResponse(
      await this.generate(prompt, systemPrompt, params, true),
    );
    if (!result) {
      this.logger.warn(
        `${LOG_PREFIX} No verdict from thinking pass for category="${params.categoryName}" — retrying without thinking`,
      );
      result = parseRuleSanityResponse(
        await this.generate(prompt, systemPrompt, params, false),
      );
    }
    if (!result) {
      this.logger.error(
        `${LOG_PREFIX} No parseable verdict for category="${params.categoryName}" even after a no-thinking retry`,
      );
      return null;
    }
    this.logger.log(
      `${LOG_PREFIX} verdict=${result.verdict} confidence=${result.confidence.toFixed(2)} category="${params.categoryName}"${
        result.betterCategoryName
          ? ` betterCategory="${result.betterCategoryName}"`
          : ""
      } reason="${result.reason}"`,
    );
    return result;
  }

  private async generate(
    prompt: string,
    systemPrompt: string,
    params: RuleSanityCheckParams,
    thinking: boolean,
  ): Promise<string | null> {
    try {
      return await this.llmCoreService.generateText(
        {
          prompt,
          systemPrompt,
          temperature: 0,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
          jsonMode: true,
          responseSchema: RULE_SANITY_RESPONSE_SCHEMA,
          operation: LLM_OP_SANITY_CHECK_CATEGORY_RULE,
          model: this.model,
          thinking,
          userId: params.userId,
        },
        LLMProvider.GEMINI,
        params.userId,
      );
    } catch (error) {
      this.logger.warn(
        `${LOG_PREFIX} LLM call failed for category="${params.categoryName}"${
          thinking ? "" : " (no-thinking retry)"
        }: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }
}
