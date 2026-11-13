/**
 * Deterministic (non-LLM) Q&A retrieval for the auto-responder.
 *
 * The inbound email is untrusted, so the model must never see the whole Q&A
 * knowledge base: only the few pairs whose questions clearly overlap with the
 * email are passed to the prompt, and the generated answer is checked
 * afterwards for content from pairs that were not selected.
 */

export interface QAPair {
  question: string;
  answer: string;
}

export interface ScoredQAPair {
  pair: QAPair;
  score: number;
}

export const QA_RETRIEVAL = {
  // Most pairs ever shown to the model for one email
  MAX_SELECTED_PAIRS: 3,
  // Minimum IDF-weighted share of a question's terms found in the email
  MIN_SCORE: 0.5,
  // Minimum distinct question terms the email must contain
  MIN_MATCHED_TERMS: 2,
  // Share of an unselected answer's distinctive terms that counts as a leak
  LEAK_RATIO: 0.5,
  // Distinctive terms that must match before a leak is reported
  LEAK_MIN_MATCHED_TERMS: 2,
  MIN_WORD_LENGTH: 3,
  MIN_NUMBER_LENGTH: 2,
  // Shortest stem left after stripping a suffix
  MIN_STEM_LENGTH: 3,
} as const;

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "and",
  "any",
  "are",
  "but",
  "can",
  "could",
  "did",
  "does",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "hello",
  "her",
  "here",
  "him",
  "his",
  "how",
  "into",
  "its",
  "just",
  "know",
  "let",
  "like",
  "may",
  "might",
  "more",
  "much",
  "not",
  "now",
  "our",
  "out",
  "please",
  "regards",
  "should",
  "some",
  "than",
  "thank",
  "thanks",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "want",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;
const DIGITS_RE = /^\p{N}+$/u;

function stripSuffix(word: string, suffix: string, replacement = ""): string {
  const stemmed = word.slice(0, -suffix.length) + replacement;
  return stemmed.length >= QA_RETRIEVAL.MIN_STEM_LENGTH ? stemmed : word;
}

/** Minimal English stemmer: enough to match plurals and simple tenses. */
function stem(word: string): string {
  if (word.endsWith("ies")) return stripSuffix(word, "ies", "y");
  if (word.endsWith("ing")) return stripSuffix(word, "ing");
  if (word.endsWith("ed")) return stripSuffix(word, "ed");
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return stripSuffix(word, "s");
  }
  return word;
}

/** Lower-cased, stop-word-free, lightly stemmed terms of a text. */
export function tokenize(text: string): Set<string> {
  const terms = new Set<string>();
  for (const raw of text.toLowerCase().split(TOKEN_SPLIT_RE)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const minLength = DIGITS_RE.test(raw)
      ? QA_RETRIEVAL.MIN_NUMBER_LENGTH
      : QA_RETRIEVAL.MIN_WORD_LENGTH;
    if (raw.length < minLength) continue;
    terms.add(stem(raw));
  }
  return terms;
}

function inverseDocumentFrequencies(
  questionTerms: Set<string>[],
): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const terms of questionTerms) {
    for (const term of terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const total = questionTerms.length;
  const idf = new Map<string, number>();
  for (const [term, frequency] of documentFrequency) {
    idf.set(term, Math.log(1 + total / frequency));
  }
  return idf;
}

/**
 * Scores every pair by the IDF-weighted share of its question's terms that
 * appear in the email, and returns the best few above the threshold (highest
 * first). An empty result means nothing is relevant enough to answer.
 */
export function selectRelevantQAPairs(
  pairs: QAPair[],
  emailText: string,
): ScoredQAPair[] {
  const emailTerms = tokenize(emailText);
  const questionTerms = pairs.map((pair) => tokenize(pair.question));
  const idf = inverseDocumentFrequencies(questionTerms);

  const scored: ScoredQAPair[] = [];
  pairs.forEach((pair, index) => {
    const terms = questionTerms[index];
    if (terms.size === 0) return;
    let totalWeight = 0;
    let matchedWeight = 0;
    let matchedCount = 0;
    for (const term of terms) {
      const weight = idf.get(term) ?? 0;
      totalWeight += weight;
      if (emailTerms.has(term)) {
        matchedWeight += weight;
        matchedCount += 1;
      }
    }
    const requiredMatches = Math.min(
      QA_RETRIEVAL.MIN_MATCHED_TERMS,
      terms.size,
    );
    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    if (matchedCount >= requiredMatches && score >= QA_RETRIEVAL.MIN_SCORE) {
      scored.push({ pair, score });
    }
  });

  return scored
    .sort((pairA, pairB) => pairB.score - pairA.score)
    .slice(0, QA_RETRIEVAL.MAX_SELECTED_PAIRS);
}

/**
 * Returns the unselected pairs whose answers appear to have been reproduced in
 * the generated reply. Only terms that are distinctive to an unselected answer
 * (absent from the selected pairs and from the email itself) count.
 */
export function findLeakedQAPairs(
  generatedAnswer: string,
  selected: QAPair[],
  unselected: QAPair[],
  emailText: string,
): QAPair[] {
  const allowed = tokenize(
    [
      emailText,
      ...selected.map((pair) => `${pair.question} ${pair.answer}`),
    ].join(" "),
  );
  const generatedTerms = tokenize(generatedAnswer);

  return unselected.filter((pair) => {
    const distinctive = [...tokenize(pair.answer)].filter(
      (term) => !allowed.has(term),
    );
    if (distinctive.length === 0) return false;
    const matched = distinctive.filter((term) =>
      generatedTerms.has(term),
    ).length;
    const requiredMatches = Math.min(
      QA_RETRIEVAL.LEAK_MIN_MATCHED_TERMS,
      distinctive.length,
    );
    return (
      matched >= requiredMatches &&
      matched / distinctive.length >= QA_RETRIEVAL.LEAK_RATIO
    );
  });
}

function clampUnit(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

/**
 * Geometric mean of the model's self-reported confidence and the retrieval
 * score, so a confident model cannot carry a weak match (or vice versa).
 */
export function combineQAConfidence(
  modelConfidence: unknown,
  retrievalScore: number,
): number {
  return Math.sqrt(clampUnit(modelConfidence) * clampUnit(retrievalScore));
}
