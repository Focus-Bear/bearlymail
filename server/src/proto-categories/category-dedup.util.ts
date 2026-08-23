import { ConsideredDuplicateCandidate } from "../database/entities/proto-category.entity";

/**
 * A normalized dedup candidate: a stable id (a real category's `contextId` or a
 * proto category's `id`), its display name (may include a leading emoji), and
 * any previously-confirmed alternate names. Normalizing real categories and
 * proto categories to this shape lets a single matching pipeline run over
 * either set instead of two divergent copies.
 */
export interface DedupCandidate {
  id: string;
  name: string;
  alternateNames?: string[] | null;
}

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
 * plus a lookup against each candidate's previously-confirmed alternate names.
 * Returns the matching candidate or null.
 */
export function matchExactOrAlternateCandidate(
  suggestedName: string,
  candidates: DedupCandidate[],
): DedupCandidate | null {
  const normalizedSuggestion = suggestedName.toLowerCase().trim();
  const suggestionWithoutEmoji = normalizedSuggestion
    .replace(/[\p{Emoji}]/gu, "")
    .trim();
  const suggestionWithoutParens = suggestionWithoutEmoji
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();

  for (const candidate of candidates) {
    const normalizedName = candidate.name.toLowerCase().trim();
    const nameWithoutEmoji = normalizedName.replace(/[\p{Emoji}]/gu, "").trim();

    if (
      suggestionWithoutEmoji === nameWithoutEmoji ||
      normalizedSuggestion === normalizedName ||
      suggestionWithoutParens === nameWithoutEmoji
    ) {
      return candidate;
    }

    if (candidate.alternateNames?.length) {
      const altMatch = candidate.alternateNames.some((alt) => {
        const normAlt = alt.toLowerCase().trim();
        const altWithoutEmoji = normAlt.replace(/[\p{Emoji}]/gu, "").trim();
        return (
          normAlt === normalizedSuggestion ||
          altWithoutEmoji === suggestionWithoutEmoji
        );
      });
      if (altMatch) {
        return candidate;
      }
    }
  }

  return null;
}
