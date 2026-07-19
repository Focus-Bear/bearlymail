/**
 * LLM helpers for composite category rules, extracted from
 * LLMCategoriesService to keep that file within the max-lines limit:
 *  - `assessRuleAddsValue`: decides whether a draft rule adds value over the
 *    existing rules for a category, or is redundant, and may return
 *    disambiguating NOT-contains phrases. Fails open on any error.
 *  - `buildSuggestRulesResult`: parses the suggest-category-rules LLM response.
 */
import { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import { LLM_OP_ASSESS_CATEGORY_RULE_VALUE } from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

/**
 * Result shape returned by `suggestRulesFromEmailSamples`. The `*NotContainsAny`
 * arrays are kept for the suggest UI flow but are empty for auto-rule
 * generation — exclusions are derived from real false positives, not invented
 * by the LLM (issue #1789 follow-up).
 */
export interface SuggestRulesResult {
  fromMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
}

/**
 * Parses the LLM's JSON suggestion response into a typed result. Returns null
 * when the LLM provided no usable positive phrases (subject AND body empty).
 */
export function buildSuggestRulesResult(
  parsed: Record<string, unknown>,
  senderEmails: string[],
): SuggestRulesResult | null {
  const parseStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? (value as unknown[])
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim() !== "",
          )
          .map((item) => item.trim())
      : [];
  const fromMatchesAny = parseStringArray(parsed.fromMatchesAny);
  const subjectContainsAny = parseStringArray(parsed.subjectContainsAny);
  const bodyContainsAny = parseStringArray(parsed.bodyContainsAny);
  if (subjectContainsAny.length === 0 && bodyContainsAny.length === 0) {
    return null;
  }
  return {
    fromMatchesAny: fromMatchesAny.length > 0 ? fromMatchesAny : senderEmails,
    subjectContainsAny,
    bodyContainsAny,
    subjectNotContainsAny: parseStringArray(parsed.subjectNotContainsAny),
    bodyNotContainsAny: parseStringArray(parsed.bodyNotContainsAny),
  };
}

/** Flat, version-agnostic summary of a composite rule spec for LLM comparison. */
export interface RuleSpecSummary {
  senders: string[];
  subjectContains: string[];
  bodyContains: string[];
  subjectNotContains: string[];
  bodyNotContains: string[];
}

export interface AssessRuleValueParams {
  categoryName: string;
  candidate: RuleSpecSummary;
  existingRules: RuleSpecSummary[];
  maxSubjectNotPhrases: number;
  maxBodyNotPhrases: number;
  userId?: string;
}

export interface AssessRuleValueResult {
  /**
   * Whether the rule's conditions are logically coherent with the category's
   * purpose (e.g. a "bot updates" rule must not exclude bot names). A rule that
   * does not make sense should not be persisted.
   */
  makesSense: boolean;
  addsValue: boolean;
  reasoning: string;
  /** Disambiguating exclusions the LLM proposes to reduce sibling overlap. */
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
}

/** Generates raw LLM text for the value-add operation. Supplied by the service. */
export type AssessRuleValueGenerateText = (request: {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  userId?: string;
  operation: typeof LLM_OP_ASSESS_CATEGORY_RULE_VALUE;
}) => Promise<string>;

/** The lower-cased string an LLM uses for a false boolean it returned as text. */
const FALSE_STRING = "false";

/**
 * True when `value` is boolean false OR a stringified false ("false"/"False").
 * Used so an LLM that emits a quoted boolean cannot bypass a verdict check.
 * A missing/other value is NOT falsey, so verdicts fail open (default true).
 */
function isFalsey(value: unknown): boolean {
  return String(value).toLowerCase() === FALSE_STRING;
}

const failOpen = (reasoning: string): AssessRuleValueResult => ({
  makesSense: true,
  addsValue: true,
  reasoning,
  subjectNotContainsAny: [],
  bodyNotContainsAny: [],
});

function formatRuleSpecSummary(summary: RuleSpecSummary): string {
  const line = (label: string, values: string[]): string =>
    `  ${label}: ${values.length > 0 ? values.join(", ") : "(none)"}`;
  return [
    line("Senders", summary.senders),
    line("Subject contains", summary.subjectContains),
    line("Body contains", summary.bodyContains),
    line("Subject NOT contains", summary.subjectNotContains),
    line("Body NOT contains", summary.bodyNotContains),
  ].join("\n");
}

function parseAssessRuleValueResponse(
  response: string,
  maxSubjectNotPhrases: number,
  maxBodyNotPhrases: number,
  logger: Logger,
): AssessRuleValueResult {
  const jsonString = response
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn(
      "[ASSESS-RULE-VALUE] No JSON object in response; not blocking.",
    );
    return failOpen("Unparseable response; not blocking.");
  }
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const parseStringArray = (value: unknown, cap: number): string[] =>
    Array.isArray(value)
      ? (value as unknown[])
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim() !== "",
          )
          .map((item) => item.trim())
          .slice(0, cap)
      : [];
  return {
    // Default both verdicts to true when absent so a malformed response
    // fails open rather than silently discarding a usable rule. Treat a
    // stringified boolean ("false"/"False") — which LLMs sometimes emit — as
    // false rather than letting it bypass the check.
    makesSense: !isFalsey(parsed.makesSense),
    addsValue: !isFalsey(parsed.addsValue),
    reasoning:
      typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "",
    subjectNotContainsAny: parseStringArray(
      parsed.subjectNotContainsAny,
      maxSubjectNotPhrases,
    ),
    bodyNotContainsAny: parseStringArray(
      parsed.bodyNotContainsAny,
      maxBodyNotPhrases,
    ),
  };
}

export async function assessRuleAddsValue(
  generateText: AssessRuleValueGenerateText,
  logger: Logger,
  params: AssessRuleValueParams,
): Promise<AssessRuleValueResult> {
  const {
    categoryName,
    candidate,
    existingRules,
    maxSubjectNotPhrases,
    maxBodyNotPhrases,
    userId,
  } = params;

  if (existingRules.length === 0) {
    return failOpen("No existing rules for this category.");
  }

  const promptConfig = getPrompt(UTILITY_PROMPT_IDS.ASSESS_CATEGORY_RULE_VALUE);
  if (!promptConfig) {
    logger.error(
      "[ASSESS-RULE-VALUE] ERROR: assess_category_rule_value prompt not found",
    );
    return failOpen("Prompt unavailable; not blocking.");
  }

  const existingRulesText = existingRules
    .map((rule, i) => `[Rule ${i + 1}]\n${formatRuleSpecSummary(rule)}`)
    .join("\n\n");

  const prompt = renderPrompt(promptConfig.prompt || "", {
    categoryName,
    candidateRule: formatRuleSpecSummary(candidate),
    existingRules: existingRulesText,
    maxSubjectNotPhrases: String(maxSubjectNotPhrases),
    maxBodyNotPhrases: String(maxBodyNotPhrases),
  });

  try {
    const response = await generateText({
      prompt,
      systemPrompt: promptConfig.systemPrompt || "",
      temperature: RATIOS.THIRTY_PERCENT,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
      jsonMode: true,
      userId,
      operation: LLM_OP_ASSESS_CATEGORY_RULE_VALUE,
    });

    const result = parseAssessRuleValueResponse(
      response,
      maxSubjectNotPhrases,
      maxBodyNotPhrases,
      logger,
    );
    logger.log(
      `[ASSESS-RULE-VALUE] === SUCCESS === category="${categoryName}" makesSense=${result.makesSense} addsValue=${result.addsValue} subjectNot=${result.subjectNotContainsAny.length} bodyNot=${result.bodyNotContainsAny.length}`,
    );
    return result;
  } catch (error) {
    logger.error(`[ASSESS-RULE-VALUE] ERROR: ${getErrorMessage(error)}`);
    return failOpen("LLM error; not blocking.");
  }
}
