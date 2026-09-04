/**
 * LLM helpers for drafting composite category rules, extracted from
 * LLMCategoriesService to keep that file within the max-lines limit:
 *  - `suggestRulesFromEmailSamples`: positive subject/body phrases + sender
 *    pattern for a category (issue #1714).
 *  - `deriveExclusionPhrasesFromFalsePositives`: NOT-contains phrases that
 *    separate a draft rule's false positives from its true positives
 *    (issue #1789 follow-up).
 * Exclusion derivation runs on Nova Micro first and escalates to Gemini via
 * `runWithNovaEscalation` when Nova finds nothing; suggestion stays on
 * Gemini (see `SUGGEST_RULES_PROVIDER`).
 */
import type { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import {
  type DeriveExclusionsResult,
  type ExclusionDerivationSample,
  formatExclusionSamples,
  parseDeriveExclusionsResponse,
} from "./derive-exclusions-parser";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import {
  type ProviderRoutedGenerateText,
  runWithNovaEscalation,
} from "./llm-nova-escalation";
import {
  buildSuggestRulesResult,
  type SuggestRulesResult,
} from "./llm-rule-value";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

const SUGGEST_LOG_PREFIX = "[SUGGEST-CATEGORY-RULES]";
/**
 * Suggestion is NOT routed through Nova: promptfoo on Nova Micro passed only
 * 3–4 of 5 cases across three runs (it keeps picking shared sender
 * boilerplate such as "left a comment" as a positive phrase), and a too-broad
 * positive set is not detectable from the response, so there is nothing to
 * escalate on. Flip this constant once the prompt is tuned for Nova.
 */
const SUGGEST_RULES_PROVIDER = LLMProvider.GEMINI;
const DERIVE_LOG_PREFIX = "[DERIVE-RULE-EXCLUSIONS]";

const EMPTY_EXCLUSIONS: DeriveExclusionsResult = {
  subjectNotContainsAny: [],
  bodyNotContainsAny: [],
};

export interface SuggestRulesParams {
  categoryName: string;
  senderEmails: string[];
  emailSamples: Array<{ subject: string; body: string }>;
  userId?: string;
}

export interface DeriveExclusionPhrasesParams {
  categoryName: string;
  truePositives: ExclusionDerivationSample[];
  falsePositives: ExclusionDerivationSample[];
  maxSubjectNotPhrases: number;
  maxBodyNotPhrases: number;
  userId?: string;
}

/** Strips a ```json fence and returns the first JSON object, or null. */
function extractJsonObject(response: string): Record<string, unknown> | null {
  const jsonString = response
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return null;
  }
  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

function formatEmailSamples(
  emailSamples: SuggestRulesParams["emailSamples"],
): string {
  return emailSamples
    .map(
      (sample, i) =>
        `[Email ${i + 1}]\nSubject: ${sample.subject}\nBody preview: ${cleanEmailContent(sample.body || "", null, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
    )
    .join("\n\n");
}

interface RenderedPrompt {
  prompt: string;
  systemPrompt: string;
}

async function suggestRulesWithProvider(
  generateText: ProviderRoutedGenerateText,
  logger: Logger,
  params: SuggestRulesParams,
  rendered: RenderedPrompt,
  provider: LLMProvider,
): Promise<SuggestRulesResult | null> {
  const response = await generateText(
    {
      ...rendered,
      temperature: RATIOS.THIRTY_PERCENT,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS,
      jsonMode: true,
      userId: params.userId,
    },
    provider,
  );

  const parsed = extractJsonObject(response);
  if (!parsed) {
    logger.warn(
      `${SUGGEST_LOG_PREFIX} No JSON object found in ${provider} response`,
    );
    return null;
  }

  const result = buildSuggestRulesResult(parsed, params.senderEmails);
  if (!result) {
    logger.warn(
      `${SUGGEST_LOG_PREFIX} ${provider} returned no usable phrases for "${params.categoryName}"`,
    );
  }
  return result;
}

/**
 * Uses the LLM to extract SHORT, GENERIC subject/body phrases and a sender
 * pattern from a set of email samples (issue #1714).
 *
 * When multiple sender emails share the same domain the LLM may return a
 * domain wildcard such as `*@github.com` in `fromMatchesAny`.
 *
 * Returns `null` when the LLM call fails or returns no usable phrases.
 */
export async function suggestRulesFromEmailSamples(
  generateText: ProviderRoutedGenerateText,
  logger: Logger,
  params: SuggestRulesParams,
): Promise<SuggestRulesResult | null> {
  const { categoryName, senderEmails, emailSamples } = params;
  logger.log(
    `${SUGGEST_LOG_PREFIX} === START === category="${categoryName}" senders=${senderEmails.length} samples=${emailSamples.length}`,
  );

  const promptConfig = getPrompt(UTILITY_PROMPT_IDS.SUGGEST_CATEGORY_RULES);
  if (!promptConfig) {
    logger.error(
      `${SUGGEST_LOG_PREFIX} ERROR: suggest_category_rules prompt not found`,
    );
    return null;
  }

  const prompt = renderPrompt(promptConfig.prompt || "", {
    categoryName,
    senderEmails: senderEmails.join("\n"),
    emailSamples: formatEmailSamples(emailSamples),
  });

  try {
    const result = await suggestRulesWithProvider(
      generateText,
      logger,
      params,
      { prompt, systemPrompt: promptConfig.systemPrompt || "" },
      SUGGEST_RULES_PROVIDER,
    );
    if (!result) {
      return null;
    }
    logger.log(
      `${SUGGEST_LOG_PREFIX} === SUCCESS === from=${result.fromMatchesAny.join(",")} subjects=${result.subjectContainsAny.length} body=${result.bodyContainsAny.length} subjectNot=${result.subjectNotContainsAny.length} bodyNot=${result.bodyNotContainsAny.length}`,
    );
    return result;
  } catch (error) {
    logger.error(`${SUGGEST_LOG_PREFIX} ERROR: ${getErrorMessage(error)}`);
    return null;
  }
}

const hasNoExclusions = (result: DeriveExclusionsResult): boolean =>
  result.subjectNotContainsAny.length === 0 &&
  result.bodyNotContainsAny.length === 0;

/**
 * Given a draft auto-rule that produced false positives during validation,
 * asks the LLM for `subjectNotContainsAny` / `bodyNotContainsAny` exclusion
 * phrases that appear in the FP samples but not in the TP samples. Nova's
 * "nothing separates them" answer is re-checked on Gemini before it is
 * trusted. Returns empty arrays when neither provider finds a clean
 * separator — callers should treat that as "no usable exclusions" and
 * discard the rule.
 */
export async function deriveExclusionPhrasesFromFalsePositives(
  generateText: ProviderRoutedGenerateText,
  logger: Logger,
  params: DeriveExclusionPhrasesParams,
): Promise<DeriveExclusionsResult> {
  const {
    categoryName,
    truePositives,
    falsePositives,
    maxSubjectNotPhrases,
    maxBodyNotPhrases,
    userId,
  } = params;
  logger.log(
    `${DERIVE_LOG_PREFIX} === START === category="${categoryName}" tp=${truePositives.length} fp=${falsePositives.length}`,
  );

  if (falsePositives.length === 0) {
    return EMPTY_EXCLUSIONS;
  }

  const promptConfig = getPrompt(UTILITY_PROMPT_IDS.DERIVE_RULE_EXCLUSIONS);
  if (!promptConfig) {
    logger.error(
      `${DERIVE_LOG_PREFIX} ERROR: derive_rule_exclusions prompt not found`,
    );
    return EMPTY_EXCLUSIONS;
  }

  const prompt = renderPrompt(promptConfig.prompt || "", {
    categoryName,
    truePositiveSamples: formatExclusionSamples(truePositives),
    falsePositiveSamples: formatExclusionSamples(falsePositives),
    maxSubjectNotPhrases: String(maxSubjectNotPhrases),
    maxBodyNotPhrases: String(maxBodyNotPhrases),
  });

  const result = await runWithNovaEscalation({
    label: DERIVE_LOG_PREFIX,
    logger,
    run: async (provider) => {
      const response = await generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
          jsonMode: true,
          userId,
        },
        provider,
      );
      return parseDeriveExclusionsResponse(
        response,
        truePositives,
        maxSubjectNotPhrases,
        maxBodyNotPhrases,
      );
    },
    needsEscalation: hasNoExclusions,
  });

  if (!result) {
    logger.error(`${DERIVE_LOG_PREFIX} ERROR: both providers failed`);
    return EMPTY_EXCLUSIONS;
  }
  logger.log(
    `${DERIVE_LOG_PREFIX} === SUCCESS === subjectNot=${result.subjectNotContainsAny.length} bodyNot=${result.bodyNotContainsAny.length}`,
  );
  return result;
}
