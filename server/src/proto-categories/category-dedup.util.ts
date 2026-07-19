import { Logger } from "@nestjs/common";

import { ConsideredDuplicateCandidate } from "../database/entities/proto-category.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { cosineSimilarity, EmbeddingService } from "../llm/embedding.service";
import { parseCategoryName } from "../utils/category-format.util";

// Cap on how many Levenshtein-flagged, shared-token, or embedding candidates we
// hand off to the LLM in one matching pass. Without this, a user with many
// similar category names would trigger one sequential LLM call per candidate.
export const MAX_LLM_DEDUP_CANDIDATES = 2;

// Minimum embedding cosine similarity between two category names for them to be
// treated as semantic near-duplicates worth confirming with the LLM.
export const EMBEDDING_DUPLICATE_THRESHOLD = 0.82;

/**
 * Combine two lists of considered duplicate candidates, de-duplicated by
 * (case-insensitive) name. Later entries win, so a fresh promotion-time
 * verdict overrides a stale creation-time one for the same category name.
 */
export function mergeConsideredCandidates(
  existing: ConsideredDuplicateCandidate[] | null | undefined,
  incoming: ConsideredDuplicateCandidate[],
): ConsideredDuplicateCandidate[] {
  const byName = new Map<string, ConsideredDuplicateCandidate>();
  for (const candidate of [...(existing ?? []), ...incoming]) {
    byName.set(candidate.name.trim().toLowerCase(), candidate);
  }
  return [...byName.values()];
}

/**
 * Cheapest dedup phase: exact / emoji-stripped / parenthetical-suffix match,
 * plus a lookup against each category's previously-confirmed alternate names.
 * Returns the matching `{ name, contextId }` or null.
 */
export function matchExactOrAlternateName(
  suggestedName: string,
  categories: UserContext[],
): { name: string; contextId: string } | null {
  const normalizedSuggestion = suggestedName.toLowerCase().trim();
  const suggestionWithoutEmoji = normalizedSuggestion
    .replace(/[\p{Emoji}]/gu, "")
    .trim();
  const suggestionWithoutParens = suggestionWithoutEmoji
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();

  for (const category of categories) {
    const categoryName = parseCategoryName(category.contextValue);
    const normalizedName = categoryName.toLowerCase().trim();
    const nameWithoutEmoji = normalizedName.replace(/[\p{Emoji}]/gu, "").trim();

    if (
      suggestionWithoutEmoji === nameWithoutEmoji ||
      normalizedSuggestion === normalizedName ||
      suggestionWithoutParens === nameWithoutEmoji
    ) {
      return { name: categoryName, contextId: category.contextId };
    }

    if (category.alternateNames?.length) {
      const altMatch = category.alternateNames.some((alt) => {
        const normAlt = alt.toLowerCase().trim();
        const altWithoutEmoji = normAlt.replace(/[\p{Emoji}]/gu, "").trim();
        return (
          normAlt === normalizedSuggestion ||
          altWithoutEmoji === suggestionWithoutEmoji
        );
      });
      if (altMatch) {
        return { name: categoryName, contextId: category.contextId };
      }
    }
  }

  return null;
}

/**
 * Returns category names whose embedding cosine similarity to `suggestedName`
 * is at least EMBEDDING_DUPLICATE_THRESHOLD, most-similar first, capped at
 * MAX_LLM_DEDUP_CANDIDATES and excluding any name in `excludeNames`
 * (lowercased). Returns [] when embeddings are unavailable so callers fall back
 * to their lexical checks only.
 */
export async function embeddingSimilarNames(
  embeddingService: EmbeddingService,
  logger: Logger,
  params: {
    suggestedName: string;
    candidateNames: string[];
    excludeNames: Set<string>;
    userId?: string;
  },
): Promise<string[]> {
  const { suggestedName, candidateNames, excludeNames, userId } = params;
  if (!embeddingService.isAvailable()) return [];
  const pool = candidateNames.filter(
    (name) => !excludeNames.has(name.toLowerCase().trim()),
  );
  if (pool.length === 0) return [];

  try {
    const [suggestionVectors, poolVectors] = await Promise.all([
      embeddingService.embed([suggestedName], { cache: true, userId }),
      embeddingService.embed(pool, { cache: true, userId }),
    ]);
    const suggestionVector = suggestionVectors[0];

    return pool
      .map((name, index) => ({
        name,
        score: cosineSimilarity(suggestionVector, poolVectors[index]),
      }))
      .filter((entry) => entry.score >= EMBEDDING_DUPLICATE_THRESHOLD)
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_LLM_DEDUP_CANDIDATES)
      .map((entry) => entry.name);
  } catch (err) {
    logger.warn(
      `Embedding similarity check failed for "${suggestedName}": ${err}`,
    );
    return [];
  }
}
