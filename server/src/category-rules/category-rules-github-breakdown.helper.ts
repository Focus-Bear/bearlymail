/**
 * Per-GitHub-fact true/false-positive breakdown of a sender's recent mail,
 * used when drafting a STRUCTURAL rule from a GitHub seed whose thread carries
 * fetched metadata (board status, state, author kind, labels).
 *
 * Each fact the seed email satisfies (`project status = QA passed`,
 * `state = merged`, `author = bot`, …) is probed as a sender + fact rule
 * against the validation windows: how many threads ALREADY filed under the
 * target category it matches (true positives) versus threads under OTHER
 * categories (false positives). A clean fact (≥1 TP, 0 FP) becomes the
 * rule's condition with no phrases at all — "board status QA passed → QA
 * passed category" is exactly such a rule. When no single fact is clean,
 * AND-pairs of different facts are probed (e.g. `author = bot` AND
 * `state = merged` for an "AI PRs merged" category). The whole breakdown is
 * shown to the strong-model reviewer.
 */
import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import type { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import type { GithubCategorySignals } from "../github/github-category-signals.helper";
import type { GithubFactsBreakdownEntry } from "../llm/llm-rule-sanity";
import {
  describeGithubConditions,
  GithubRuleConditions,
} from "./category-rules-github-conditions.helper";
import {
  DecryptedValidationRow,
  partitionMatchesByCategory,
} from "./category-rules-validate.helper";

export interface GithubFactsBreakdownParams {
  /** The target category's OWN recent threads (the dense true-positive window). */
  categoryRows: DecryptedValidationRow[];
  /** A broad recent sample of all categorised mail (the false-positive window). */
  broadRows: DecryptedValidationRow[];
  /** Sender patterns the rule will carry (exact or `*@domain` wildcards). */
  senderPatterns: string[];
  normaliseSender: (raw: string) => string;
  targetCategoryId: string | null;
  /** The seed email's facts — only conditions it satisfies are candidates. */
  seed: GithubCategorySignals;
}

/** A breakdown row together with the structured condition it probed. */
export interface GithubFactsBreakdownCandidate extends GithubFactsBreakdownEntry {
  conditions: GithubRuleConditions;
}

export interface GithubFactsSelection {
  /** The clean condition set to pin, or null when nothing is clean. */
  conditions: GithubRuleConditions | null;
  /** Every probed fact (singles, then any pairs), for the sanity reviewer. */
  breakdown: GithubFactsBreakdownEntry[];
}

/** Minimum true positives a fact needs to be pinned by the drafted rule. */
const MIN_TRUE_POSITIVES_PER_FACT = 1;
/** False positives allowed per pinned fact: none — precision is the point. */
const MAX_FALSE_POSITIVES_PER_FACT =
  CATEGORY_RULE_COMPOSITE.RULE_MAX_ACCEPTABLE_FP;
const CONDITION_SEPARATOR = "; ";

/**
 * The single-fact conditions the seed satisfies, most decisive first: a board
 * status is the rarest fact, then lifecycle state, author kind, labels.
 */
export function seedGithubConditions(
  seed: GithubCategorySignals,
): GithubRuleConditions[] {
  const conditions: GithubRuleConditions[] = seed.projectStatuses.map(
    (entry) => ({
      githubProjectStatusAny: [
        { status: entry.status, project: entry.project },
      ],
    }),
  );
  if (seed.state) {
    conditions.push({ githubStateAny: [seed.state] });
  }
  if (seed.authorKind) {
    conditions.push({ githubAuthorKind: seed.authorKind });
  }
  for (const label of seed.labels) {
    conditions.push({ githubLabelsAny: [label] });
  }
  return conditions;
}

function probeSpec(
  senderPatterns: string[],
  conditions: GithubRuleConditions,
): CompositeCategoryRuleSpec {
  return {
    v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION,
    fromMatchesAny: senderPatterns,
    subjectContainsAny: [],
    bodyContainsAny: [],
    ...conditions,
  };
}

function conditionKind(conditions: GithubRuleConditions): string {
  return Object.keys(conditions).sort().join(",");
}

function isClean(entry: GithubFactsBreakdownEntry): boolean {
  return (
    entry.truePositives >= MIN_TRUE_POSITIVES_PER_FACT &&
    entry.falsePositives <= MAX_FALSE_POSITIVES_PER_FACT
  );
}

/** Probes one condition set as sender + facts against both windows. */
export function tallyGithubConditions(
  params: Omit<GithubFactsBreakdownParams, "seed">,
  conditions: GithubRuleConditions,
): GithubFactsBreakdownCandidate {
  const spec = probeSpec(params.senderPatterns, conditions);
  const truePositives = partitionMatchesByCategory(
    params.categoryRows,
    spec,
    params.normaliseSender,
    params.targetCategoryId,
  ).truePositiveRows.length;
  const falsePositives = partitionMatchesByCategory(
    params.broadRows,
    spec,
    params.normaliseSender,
    params.targetCategoryId,
  ).falsePositiveRows.length;
  return {
    condition: describeGithubConditions(spec).join(CONDITION_SEPARATOR),
    truePositives,
    falsePositives,
    conditions,
  };
}

function bestClean(
  candidates: GithubFactsBreakdownCandidate[],
): GithubFactsBreakdownCandidate | null {
  // Candidates are already in decisiveness order; a strictly higher TP count
  // wins, otherwise the more decisive fact keeps its place.
  let best: GithubFactsBreakdownCandidate | null = null;
  for (const candidate of candidates) {
    if (!isClean(candidate)) continue;
    if (best === null || candidate.truePositives > best.truePositives) {
      best = candidate;
    }
  }
  return best;
}

function pairsOfDifferentKinds(
  singles: GithubRuleConditions[],
): GithubRuleConditions[] {
  const pairs: GithubRuleConditions[] = [];
  for (let first = 0; first < singles.length; first++) {
    for (let second = first + 1; second < singles.length; second++) {
      if (conditionKind(singles[first]) === conditionKind(singles[second])) {
        continue;
      }
      pairs.push({ ...singles[first], ...singles[second] });
    }
  }
  return pairs;
}

/**
 * Probes every single fact the seed satisfies and, when none is clean, every
 * AND-pair of different facts. Returns the cleanest condition set (most true
 * positives; single facts preferred over pairs because they cover more mail)
 * and the full evidence list, sorted strongest first.
 */
export function selectCleanGithubConditions(
  params: GithubFactsBreakdownParams,
): GithubFactsSelection {
  const singles = seedGithubConditions(params.seed);
  const singleCandidates = singles.map((conditions) =>
    tallyGithubConditions(params, conditions),
  );
  let chosen = bestClean(singleCandidates);
  let candidates = singleCandidates;
  if (!chosen) {
    const pairCandidates = pairsOfDifferentKinds(singles).map((conditions) =>
      tallyGithubConditions(params, conditions),
    );
    chosen = bestClean(pairCandidates);
    candidates = [...singleCandidates, ...pairCandidates];
  }
  const breakdown = candidates
    .map(({ condition, truePositives, falsePositives }) => ({
      condition,
      truePositives,
      falsePositives,
    }))
    .sort(
      (left, right) =>
        right.truePositives - left.truePositives ||
        left.condition.localeCompare(right.condition),
    );
  return { conditions: chosen?.conditions ?? null, breakdown };
}
