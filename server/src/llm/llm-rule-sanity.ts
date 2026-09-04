/**
 * Pure helpers for the strong-model sanity review of auto-generated composite
 * category rules: verdict constants, the structured-output schema, prompt
 * formatting, and response parsing. The LLM call itself lives in
 * `CategoryRuleSanityService`; the gating decision in
 * `category-rules-sanity-gate.helper.ts`.
 */
import { QUERY_LIMITS } from "../constants/query-limits";
import { cleanEmailContent } from "./email-content-cleaner";
import { RuleSpecSummary } from "./llm-rule-value";

export const RULE_SANITY_VERDICTS = {
  ACCEPT: "accept",
  REJECT: "reject",
  REVISE: "revise",
} as const;

export type RuleSanityVerdict =
  (typeof RULE_SANITY_VERDICTS)[keyof typeof RULE_SANITY_VERDICTS];

/** A category the reviewer may judge to be a better home for the rule's emails. */
export interface RuleSanityCategory {
  name: string;
  description: string | null;
}

/** One of the emails that motivated the rule, as shown to the reviewer. */
export interface RuleSanitySampleEmail {
  from: string;
  subject: string;
  body: string;
}

/** The reviewer's proposed corrected rule (verdict "revise" only). */
export interface RuleSanityRevision {
  fromMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
}

export interface RuleSanityCheckResult {
  verdict: RuleSanityVerdict;
  /** 0–1, clamped. */
  confidence: number;
  reason: string;
  betterCategoryName: string | null;
  suggestedRevision: RuleSanityRevision | null;
}

export interface RuleSanityCheckParams {
  categoryName: string;
  categoryDescription: string | null;
  candidate: RuleSpecSummary;
  otherCategories: RuleSanityCategory[];
  sampleEmails: RuleSanitySampleEmail[];
  userId?: string;
}

const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;
const NONE_PLACEHOLDER = "(none)";
const PHRASE_SEPARATOR = " · ";

const STRING_ARRAY_SCHEMA = { type: "array", items: { type: "string" } };

/**
 * Structured-output schema for the verdict. Constrained decoding forces exactly
 * this shape so a thinking model cannot leak chain-of-thought into the JSON.
 * `nullable` fields are still emitted (as null) so parsing never has to guess.
 */
export const RULE_SANITY_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: Object.values(RULE_SANITY_VERDICTS),
    },
    confidence: { type: "number" },
    reason: { type: "string" },
    betterCategoryName: { type: "string", nullable: true },
    suggestedRevision: {
      type: "object",
      nullable: true,
      properties: {
        fromMatchesAny: STRING_ARRAY_SCHEMA,
        subjectContainsAny: STRING_ARRAY_SCHEMA,
        bodyContainsAny: STRING_ARRAY_SCHEMA,
        subjectNotContainsAny: STRING_ARRAY_SCHEMA,
        bodyNotContainsAny: STRING_ARRAY_SCHEMA,
      },
      required: ["fromMatchesAny", "subjectContainsAny", "bodyContainsAny"],
    },
  },
  required: ["verdict", "confidence", "reason"],
  propertyOrdering: [
    "verdict",
    "confidence",
    "reason",
    "betterCategoryName",
    "suggestedRevision",
  ],
};

/**
 * Renders the rule for the reviewer with every phrase quoted and separated by
 * a middle dot, so multi-word phrases are never misread as one comma-joined
 * phrase (the value-add prompt's plain comma list caused exactly that).
 */
export function formatSanityRuleSummary(summary: RuleSpecSummary): string {
  const line = (label: string, values: string[]): string =>
    `${label}: ${
      values.length > 0
        ? values.map((value) => `"${value}"`).join(PHRASE_SEPARATOR)
        : NONE_PLACEHOLDER
    }`;
  return [
    line("Sender matches any of", summary.senders),
    line("Subject contains any of", summary.subjectContains),
    line("Body contains any of", summary.bodyContains),
    line("Subject must NOT contain any of", summary.subjectNotContains),
    line("Body must NOT contain any of", summary.bodyNotContains),
  ].join("\n");
}

export function formatSanityCategories(
  categories: RuleSanityCategory[],
): string {
  if (categories.length === 0) {
    return NONE_PLACEHOLDER;
  }
  return categories
    .map(
      (category) =>
        `- ${category.name}${category.description ? ` — ${category.description}` : ""}`,
    )
    .join("\n");
}

export function formatSanitySampleEmails(
  samples: RuleSanitySampleEmail[],
): string {
  if (samples.length === 0) {
    return NONE_PLACEHOLDER;
  }
  return samples
    .map(
      (sample, index) =>
        `[Email ${index + 1}]\nFrom: ${sample.from}\nSubject: ${sample.subject}\nBody preview: ${cleanEmailContent(sample.body || "", null, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
    )
    .join("\n\n");
}

/** Prompt variables for the `sanity_check_category_rule` template. */
export function buildSanityPromptVariables(
  params: RuleSanityCheckParams,
): Record<string, string> {
  return {
    categoryName: params.categoryName,
    categoryDescription: params.categoryDescription || NONE_PLACEHOLDER,
    ruleSummary: formatSanityRuleSummary(params.candidate),
    otherCategories: formatSanityCategories(params.otherCategories),
    sampleEmails: formatSanitySampleEmails(params.sampleEmails),
  };
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? (value as unknown[])
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim() !== "",
        )
        .map((item) => item.trim())
    : [];
}

function isVerdict(value: unknown): value is RuleSanityVerdict {
  return (
    typeof value === "string" &&
    (Object.values(RULE_SANITY_VERDICTS) as string[]).includes(value)
  );
}

function parseConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return CONFIDENCE_MIN;
  }
  return Math.min(CONFIDENCE_MAX, Math.max(CONFIDENCE_MIN, numeric));
}

function parseRevision(value: unknown): RuleSanityRevision | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const revision: RuleSanityRevision = {
    fromMatchesAny: parseStringArray(raw.fromMatchesAny),
    subjectContainsAny: parseStringArray(raw.subjectContainsAny),
    bodyContainsAny: parseStringArray(raw.bodyContainsAny),
    subjectNotContainsAny: parseStringArray(raw.subjectNotContainsAny),
    bodyNotContainsAny: parseStringArray(raw.bodyNotContainsAny),
  };
  const hasPositiveConditions =
    revision.fromMatchesAny.length > 0 &&
    revision.subjectContainsAny.length > 0 &&
    revision.bodyContainsAny.length > 0;
  return hasPositiveConditions ? revision : null;
}

/** Strips a ```json fence and isolates the outermost JSON object. */
export function extractJsonObject(text: string | null): string | null {
  return (
    text
      ?.replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
      .match(/\{[\s\S]*\}/)?.[0] ?? null
  );
}

/**
 * Parses the reviewer's JSON. Returns null when there is no parseable verdict
 * so the caller can retry or fail open — a missing verdict is NOT a rejection.
 * A "revise" verdict without a usable revision degrades to "reject": the
 * reviewer found a problem but could not fix it.
 */
export function parseRuleSanityResponse(
  response: string | null,
): RuleSanityCheckResult | null {
  const jsonText = extractJsonObject(response);
  if (!jsonText) {
    return null;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!isVerdict(parsed.verdict)) {
    return null;
  }
  const suggestedRevision =
    parsed.verdict === RULE_SANITY_VERDICTS.REVISE
      ? parseRevision(parsed.suggestedRevision)
      : null;
  const verdict =
    parsed.verdict === RULE_SANITY_VERDICTS.REVISE && !suggestedRevision
      ? RULE_SANITY_VERDICTS.REJECT
      : parsed.verdict;
  const betterCategoryName =
    typeof parsed.betterCategoryName === "string" &&
    parsed.betterCategoryName.trim() !== ""
      ? parsed.betterCategoryName.trim()
      : null;
  return {
    verdict,
    confidence: parseConfidence(parsed.confidence),
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
    betterCategoryName,
    suggestedRevision,
  };
}
