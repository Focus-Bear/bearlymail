/**
 * Response contract for the extract-common-questions prompt: one FAQ the model
 * proposes from the numbered question/reply pairs it was shown.
 */
export interface ExtractedQaCluster {
  question: string;
  answer: string;
  /** Ids of the pairs the model grouped under this question. */
  pairIds: number[];
  /** The model's own 0–1 confidence that the group is one real, answerable question. */
  confidence: number;
}

const QA_PAIRS_KEY = "qa_pairs";
const CODE_FENCE_OPEN = /^```(json)?\s*/i;
const CODE_FENCE_CLOSE = /\s*```$/i;
const JSON_OBJECT = /\{[\s\S]*\}/;

/**
 * Structured-output schema. Constrained decoding (Gemini) forces this shape so
 * the model cannot drop `pairIds`, which the quality gate needs to count how
 * many different people asked.
 */
export const QA_EXTRACTION_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    [QA_PAIRS_KEY]: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          pairIds: { type: "array", items: { type: "integer" } },
          confidence: { type: "number" },
        },
        required: ["question", "answer", "pairIds", "confidence"],
        propertyOrdering: ["question", "answer", "pairIds", "confidence"],
      },
    },
  },
  required: [QA_PAIRS_KEY],
};

function isExtractedQaCluster(value: unknown): value is ExtractedQaCluster {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.question === "string" &&
    typeof candidate.answer === "string" &&
    typeof candidate.confidence === "number" &&
    Array.isArray(candidate.pairIds) &&
    candidate.pairIds.every((pairId) => Number.isInteger(pairId))
  );
}

/**
 * Parses the model's reply. Anything malformed is dropped rather than repaired:
 * an entry without `pairIds` cannot be checked against the real askers, so it
 * must never become an FAQ. Throws on text that is not JSON at all.
 */
export function parseQaExtractionResponse(
  response: string,
): ExtractedQaCluster[] {
  const unfenced = response
    .trim()
    .replace(CODE_FENCE_OPEN, "")
    .replace(CODE_FENCE_CLOSE, "");
  const objectText = unfenced.match(JSON_OBJECT)?.[0];
  if (!objectText) return [];
  const parsed = JSON.parse(objectText) as Record<string, unknown>;
  const entries = parsed[QA_PAIRS_KEY];
  if (!Array.isArray(entries)) return [];
  return entries.filter(isExtractedQaCluster);
}
