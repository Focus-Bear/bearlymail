import { normalizeCategoryNameForDedup } from "../utils/category-name.util";

/** Similarity at or above which a proto is flagged as a likely duplicate of an
 * existing real category. Token-Jaccard 0.5 catches near-dupes like
 * "Meeting Summaries" vs "Meeting Recaps & Summaries" (2/3 = 0.67) without
 * firing on merely topical overlap. */
export const DUPLICATION_SIMILARITY_THRESHOLD = 0.5;

export interface NearestCategory {
  name: string;
  /** Token-Jaccard similarity of the normalised names (0..1). */
  similarity: number;
  /** True when similarity ≥ {@link DUPLICATION_SIMILARITY_THRESHOLD}. */
  flagged: boolean;
}

function normalisedTokens(name: string): Set<string> {
  return new Set(
    normalizeCategoryNameForDedup(name)
      .split(/\s+/)
      .filter((token) => token.length > 0),
  );
}

function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * Finds the existing real category whose (emoji/punctuation-normalised) name is
 * the closest token-overlap match to `target` — used to instrument whether the
 * categoriser created or matched a proto category despite an existing
 * near-duplicate, which is the signal for taxonomy/proto sprawl. Returns null
 * when there are no candidates.
 */
export function findNearestExistingCategory(
  target: string | null | undefined,
  knownCategoryNames: string[],
): NearestCategory | null {
  if (!target || knownCategoryNames.length === 0) return null;
  const targetTokens = normalisedTokens(target);
  let best: NearestCategory | null = null;
  for (const name of knownCategoryNames) {
    const similarity = jaccard(targetTokens, normalisedTokens(name));
    // Only consider candidates with actual token overlap — otherwise an
    // unrelated first category would be reported as the "nearest" at similarity 0.
    if (similarity > 0 && (!best || similarity > best.similarity)) {
      best = {
        name,
        similarity,
        flagged: similarity >= DUPLICATION_SIMILARITY_THRESHOLD,
      };
    }
  }
  return best;
}
