/**
 * The model's verdict on whether an FAQ's answer can be sent as-is to the next
 * person who asks. Only REUSABLE entries are ever saved: the others name the
 * ways learned FAQs used to go wrong, so the model has somewhere honest to put
 * a group instead of dressing it up as an FAQ.
 */
export const QA_ANSWER_KINDS = {
  /** Self-contained reply text built from facts the user gave; right for any asker. */
  REUSABLE: "reusable",
  /** The question only makes sense inside its thread ("Any updates on this?"). */
  THREAD_DEPENDENT: "thread_dependent",
  /** The right answer depends on one asker's order, account, task or bug. */
  CASE_SPECIFIC: "case_specific",
  /** The answer says what to do ("Provide a tracking link") instead of being the reply. */
  DESCRIBES_ACTION: "describes_action",
} as const;

export type QaAnswerKind =
  (typeof QA_ANSWER_KINDS)[keyof typeof QA_ANSWER_KINDS];

const QA_ANSWER_KIND_VALUES: readonly string[] = Object.values(QA_ANSWER_KINDS);

/**
 * Response contract for the extract-common-questions prompt: one FAQ the model
 * proposes from the numbered question/reply pairs it was shown.
 */
export interface ExtractedQaCluster {
  question: string;
  answer: string;
  /** Ids of the pairs the model grouped under this question. */
  pairIds: number[];
  answerKind: QaAnswerKind;
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
 * many different people asked, or `answerKind`, which it gates on. The
 * promptfoo suite sends the same schema (checked by the spec).
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
          // Generated after the answer so the verdict judges what was written.
          answerKind: { type: "string", enum: [...QA_ANSWER_KIND_VALUES] },
          confidence: { type: "number" },
        },
        required: ["question", "answer", "pairIds", "answerKind", "confidence"],
        propertyOrdering: [
          "question",
          "answer",
          "pairIds",
          "answerKind",
          "confidence",
        ],
      },
    },
  },
  required: [QA_PAIRS_KEY],
};

function isQaAnswerKind(value: unknown): value is QaAnswerKind {
  return typeof value === "string" && QA_ANSWER_KIND_VALUES.includes(value);
}

function isExtractedQaCluster(value: unknown): value is ExtractedQaCluster {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.question === "string" &&
    typeof candidate.answer === "string" &&
    typeof candidate.confidence === "number" &&
    isQaAnswerKind(candidate.answerKind) &&
    Array.isArray(candidate.pairIds) &&
    candidate.pairIds.every((pairId) => Number.isInteger(pairId))
  );
}

/**
 * Parses the model's reply. Anything malformed is dropped rather than repaired:
 * an entry without `pairIds` cannot be checked against the real askers, and
 * one without a valid `answerKind` was never judged reusable, so neither may
 * become an FAQ. Throws on text that is not JSON at all.
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
