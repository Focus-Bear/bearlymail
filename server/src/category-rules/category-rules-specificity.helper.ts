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
 *   1. A rule pinned to a `notificationSubtype` (a hard structural separator)
 *      beats one without.
 *   2. More total exclusion phrases (`subjectNotContainsAny` + `bodyNotContainsAny`)
 *      beats fewer — a more-excluded rule is more precise.
 *   3. More positive conditions (senders + subject + body phrases) beats fewer.
 *   4. Older `createdAt` wins — the ONLY use of age, and only as a tiebreak.
 *   5. Lexicographic `id` — final tiebreak so the order is total (no ambiguity
 *      is ever left to insertion order).
 */
import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { specToV2 } from "./category-rules-auto-composite.helper";

/** The fields the comparator needs from a matching composite rule. */
export interface SpecificityCandidate {
  spec: CompositeCategoryRuleSpec;
  createdAt: Date;
  id: string;
}

interface SpecificityScore {
  hasNotificationSubtype: boolean;
  exclusionCount: number;
  positiveCount: number;
}

function notificationSubtypeOf(
  spec: CompositeCategoryRuleSpec,
): string | undefined {
  return spec.v === 3
    ? (spec as CompositeCategoryRuleSpecV3).notificationSubtype
    : undefined;
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
    hasNotificationSubtype: notificationSubtypeOf(spec) !== undefined,
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

  if (scoreA.hasNotificationSubtype !== scoreB.hasNotificationSubtype) {
    return scoreA.hasNotificationSubtype ? -1 : 1;
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
