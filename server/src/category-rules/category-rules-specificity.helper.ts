/**
 * Total-order specificity comparator for composite category rules.
 *
 * Match precedence used to be oldest-wins (`createdAt ASC`, first match returned),
 * so the oldest/broadest rule for a category permanently shadowed newer, better-
 * scoped siblings — even when a newer sibling carried the exclusions that would
 * have kept an email out of the wrong category. This comparator replaces that
 * with a deterministic "most specific wins" order.
 *
 * Specificity, in strict priority order:
 *   1. More GitHub-metadata conditions (board status, state, author kind,
 *      labels) beats fewer — a board status such as "QA passed" is the rarest,
 *      most decisive structural fact an email can carry.
 *   2. A rule pinned to a notification subtype (a hard structural separator)
 *      beats one without; among pinned rules a DEEPER pin wins — a fine
 *      `github:pr:merged:human` rule beats a legacy coarse `github:pr` rule
 *      that also matches the email (a set counts as its shallowest member).
 *   3. More total exclusion phrases (`subjectNotContainsAny` + `bodyNotContainsAny`)
 *      beats fewer — a more-excluded rule is more precise.
 *   4. More positive conditions (senders + subject + body phrases) beats fewer.
 *   5. Older `createdAt` wins — the ONLY use of age, and only as a tiebreak.
 *   6. Lexicographic `id` — final tiebreak so the order is total (no ambiguity
 *      is ever left to insertion order).
 */
import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import { specToV2 } from "./category-rules-auto-composite.helper";
import { githubConditionCount } from "./category-rules-github-conditions.helper";
import { notificationSubtypeDepthOf } from "./category-rules-notification-subtype.helper";

/** The fields the comparator needs from a matching composite rule. */
export interface SpecificityCandidate {
  spec: CompositeCategoryRuleSpec;
  createdAt: Date;
  id: string;
}

interface SpecificityScore {
  /** Number of GitHub-metadata conditions pinned; 0 when none. */
  githubConditionCount: number;
  /** Segment depth of the subtype pin; 0 when the rule is unpinned. */
  notificationSubtypeDepth: number;
  exclusionCount: number;
  positiveCount: number;
}

function scoreOf(spec: CompositeCategoryRuleSpec): SpecificityScore {
  const v2 = specToV2(spec);
  const exclusionCount =
    (v2.subjectNotContainsAny?.length ?? 0) +
    (v2.bodyNotContainsAny?.length ?? 0);
  const positiveCount =
    v2.senderMatchesAny.length +
    v2.subjectContainsAny.length +
    v2.bodyContainsAny.length;
  return {
    githubConditionCount: githubConditionCount(spec),
    notificationSubtypeDepth: notificationSubtypeDepthOf(spec),
    exclusionCount,
    positiveCount,
  };
}

/**
 * Returns a negative number when `a` is MORE specific than `b` (so `a` should
 * sort first / win), positive when `b` is more specific, and 0 only when the
 * two candidates are the same rule (identical id). Suitable for `Array.sort`.
 */
export function compareCompositeRuleSpecificity(
  first: SpecificityCandidate,
  second: SpecificityCandidate,
): number {
  const scoreA = scoreOf(first.spec);
  const scoreB = scoreOf(second.spec);

  if (scoreA.githubConditionCount !== scoreB.githubConditionCount) {
    return scoreB.githubConditionCount - scoreA.githubConditionCount;
  }
  if (scoreA.notificationSubtypeDepth !== scoreB.notificationSubtypeDepth) {
    return scoreB.notificationSubtypeDepth - scoreA.notificationSubtypeDepth;
  }
  if (scoreA.exclusionCount !== scoreB.exclusionCount) {
    return scoreB.exclusionCount - scoreA.exclusionCount;
  }
  if (scoreA.positiveCount !== scoreB.positiveCount) {
    return scoreB.positiveCount - scoreA.positiveCount;
  }
  const createdA = first.createdAt.getTime();
  const createdB = second.createdAt.getTime();
  if (createdA !== createdB) {
    return createdA - createdB;
  }
  if (first.id === second.id) {
    return 0;
  }
  return first.id < second.id ? -1 : 1;
}

/**
 * Returns the most specific candidate from a non-empty list, deterministically.
 * `null` for an empty list.
 */
export function pickMostSpecificCandidate<T extends SpecificityCandidate>(
  candidates: T[],
): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (best === null || compareCompositeRuleSpecificity(candidate, best) < 0) {
      best = candidate;
    }
  }
  return best;
}
