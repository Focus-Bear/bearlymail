/**
 * Auto-merge an auto-generated candidate rule into an existing sibling that
 * targets the same category with identical sender + subject conditions, by
 * unioning the candidate's body phrases into the sibling.
 *
 * Two rules with the same sender pattern and the same subject phrases for the
 * same category catch the same emails apart from a few different body phrases.
 * That's not two rules — it's one rule whose `bodyContainsAny` is the union
 * (it's an OR list). The value-add LLM was honestly accepting both because
 * each catches some emails the other misses; this helper performs the merge
 * deterministically so callers never get a near-duplicate sibling persisted.
 */
import { Repository } from "typeorm";

import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import {
  mergeBodyPhrasesIntoSibling,
  senderAndSubjectMatch,
} from "./category-rules-auto-composite.helper";

/** Discriminant: candidate was merged into an existing sibling (or no-op). */
export const MERGE_OUTCOME_MERGED = "merged";

/** Discriminant: merging would exceed the body-phrases cap; caller discards. */
export const MERGE_OUTCOME_WOULD_EXCEED_CAP = "would-exceed-cap";

export type MergeIntoSiblingOutcome =
  | { outcome: typeof MERGE_OUTCOME_MERGED; rule: CategoryRule }
  | { outcome: typeof MERGE_OUTCOME_WOULD_EXCEED_CAP; rule: CategoryRule }
  | null;

export interface MergeIntoSiblingParams {
  compositeRules: CategoryRule[];
  candidateSpec: CompositeCategoryRuleSpec;
  trimmedCategory: string;
  maxBodyPhrases: number;
  repository: Repository<CategoryRule>;
  /**
   * Optional callback fired when a merge actually mutates a sibling (skipped
   * for no-op merges where the sibling already covers the candidate).
   */
  onMerged?: (sibling: CategoryRule) => void;
}

/**
 * If an existing rule for the same category has the same sender + subject
 * conditions as `candidateSpec`, merge the candidate's body phrases into that
 * rule and persist it. Returns `null` when no mergeable sibling exists.
 *
 * The caller is responsible for the "no mergeable sibling" path — usually
 * proceeding with the normal persist gate.
 */
export async function mergeIntoSiblingRuleIfPossible(
  params: MergeIntoSiblingParams,
): Promise<MergeIntoSiblingOutcome> {
  const {
    compositeRules,
    candidateSpec,
    trimmedCategory,
    maxBodyPhrases,
    repository,
    onMerged,
  } = params;

  for (const sibling of compositeRules) {
    if (!sibling.compositeSpec) continue;
    if (sibling.categoryName !== trimmedCategory) continue;
    if (!senderAndSubjectMatch(sibling.compositeSpec, candidateSpec)) continue;

    const merged = mergeBodyPhrasesIntoSibling(
      sibling.compositeSpec,
      candidateSpec,
      maxBodyPhrases,
    );
    if (merged === null) {
      return { outcome: MERGE_OUTCOME_WOULD_EXCEED_CAP, rule: sibling };
    }
    if (merged === sibling.compositeSpec) {
      // No new phrases — sibling already covers the candidate.
      return { outcome: MERGE_OUTCOME_MERGED, rule: sibling };
    }
    sibling.compositeSpec = merged;
    await repository.save(sibling);
    onMerged?.(sibling);
    return { outcome: MERGE_OUTCOME_MERGED, rule: sibling };
  }
  return null;
}
