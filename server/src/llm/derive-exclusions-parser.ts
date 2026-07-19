/**
 * Pure-function helpers for the "derive rule exclusions from false
 * positives" LLM call (issue #1789 follow-up). Kept separate from
 * `llm-categories.service.ts` so that file stays under the 800-line
 * lint cap.
 */
import { QUERY_LIMITS } from "../constants/query-limits";
import { cleanEmailContent } from "./email-content-cleaner";

/**
 * Result shape returned by `deriveExclusionPhrasesFromFalsePositives`. Both
 * fields can be empty when the LLM cannot find phrases that reliably appear
 * in false positives but not in true positives.
 */
export interface DeriveExclusionsResult {
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
}

/**
 * One email sample passed to `deriveExclusionPhrasesFromFalsePositives`.
 * Encryption decryption happens at the call site; this type holds plaintext.
 */
export interface ExclusionDerivationSample {
  subject: string;
  body: string;
}

export function formatExclusionSamples(
  samples: ExclusionDerivationSample[],
): string {
  if (samples.length === 0) {
    return "(none)";
  }
  return samples
    .map(
      (sample, i) =>
        `[Email ${i + 1}]\nSubject: ${sample.subject}\nBody preview: ${cleanEmailContent(sample.body || "", null, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
    )
    .join("\n\n");
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

/**
 * Parses the derive-exclusions LLM response and enforces two safety
 * filters before returning phrases:
 *   1. Drop any phrase that appears in any true-positive sample (it would
 *      cause the rule to stop matching legitimate emails).
 *   2. Cap each list at the configured maximum.
 * The LLM is asked to honour rule (1) but we enforce it locally because a
 * single bad phrase silently breaks the rule for the user.
 *
 * Returns empty arrays when the response contains no JSON object.
 */
export function parseDeriveExclusionsResponse(
  response: string,
  truePositives: ExclusionDerivationSample[],
  maxSubjectNotPhrases: number,
  maxBodyNotPhrases: number,
): DeriveExclusionsResult {
  const jsonString = response
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { subjectNotContainsAny: [], bodyNotContainsAny: [] };
  }
  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const tpSubjectsLower = truePositives
    .map((sample) => (sample.subject || "").toLowerCase())
    .filter((subject) => subject.length > 0);
  const tpBodiesLower = truePositives
    .map((sample) => (sample.body || "").toLowerCase())
    .filter((body) => body.length > 0);
  const safe = (
    phrases: string[],
    tpHaystacksLower: string[],
    max: number,
  ): string[] =>
    phrases
      .filter((phrase) => {
        const needle = phrase.toLowerCase();
        return !tpHaystacksLower.some((haystack) => haystack.includes(needle));
      })
      .slice(0, max);
  return {
    subjectNotContainsAny: safe(
      parseStringArray(parsed.subjectNotContainsAny),
      tpSubjectsLower,
      maxSubjectNotPhrases,
    ),
    bodyNotContainsAny: safe(
      parseStringArray(parsed.bodyNotContainsAny),
      tpBodiesLower,
      maxBodyNotPhrases,
    ),
  };
}
