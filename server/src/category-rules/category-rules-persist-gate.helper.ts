/**
 * Pre-persist quality gate for composite category rules.
 *
 * Ties together the three checks that decide whether a draft rule is worth
 * keeping, so that both the auto-generation path and the manual create path
 * apply the same policy:
 *   1. Match gate — the rule must match at least one real mailbox email.
 *   2. Value-add — when sibling rules already target the same category, an
 *      LLM decides whether the draft adds value or is redundant, and may
 *      return disambiguating NOT-contains phrases.
 *   3. Exclusion requirement — every persisted rule must carry at least one
 *      subject/body NOT-contains phrase so it cannot match too broadly.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { RuleSpecSummary } from "../llm/llm-rule-value";
import { specToV2 } from "./category-rules-auto-composite.helper";
import {
  countMatchesInRows,
  dropContradictoryExclusions,
  fetchRecentEmailsForMatching,
  mergeExclusionsIntoSpec,
  specHasExclusion,
} from "./category-rules-match-gate.helper";

export interface RulePersistGateParams {
  categoryRuleRepository: Repository<CategoryRule>;
  emailRepository: Repository<Email>;
  llmCategoriesService: LLMCategoriesService;
  normaliseSender: (raw: string) => string;
  userId: string;
  categoryName: string;
  /** FK UUID matching UserContext.contextId — used for sibling filtering. */
  categoryId: string | null;
  candidateSpec: CompositeCategoryRuleSpec;
  /** When true, skip the LLM value-add comparison (used for manual creation). */
  skipValueAdd?: boolean;
  /**
   * When true, reject any rule that ends up with no NOT-contains exclusion.
   * Defaults to true. Set false to require exclusions only where the value-add
   * step found sibling overlap (clean, sibling-free rules are then allowed).
   */
  requireExclusions?: boolean;
  /**
   * Optional pre-fetched composite rules for this user. When provided, the gate
   * skips its own `find` call and uses this list — lets callers that already
   * have the rules in memory avoid a duplicate query.
   */
  compositeRules?: CategoryRule[];
}

export interface RulePersistGateOutcome {
  shouldPersist: boolean;
  finalSpec: CompositeCategoryRuleSpec | null;
  /** Machine-readable reason for rejection (for logging / error messages). */
  reason:
    | "ok"
    | "no_mailbox_match"
    | "redundant"
    | "no_exclusions"
    | "exclusions_removed_all_matches";
  detail?: string;
}

function specToSummary(spec: CompositeCategoryRuleSpec): RuleSpecSummary {
  const v2 = specToV2(spec);
  return {
    senders: v2.senderMatchesAny,
    subjectContains: v2.subjectContainsAny,
    bodyContains: v2.bodyContainsAny,
    subjectNotContains: v2.subjectNotContainsAny ?? [],
    bodyNotContains: v2.bodyNotContainsAny ?? [],
  };
}

async function fetchSiblingSpecs(
  categoryRuleRepository: Repository<CategoryRule>,
  userId: string,
  categoryId: string | null,
  prefetched?: CategoryRule[],
): Promise<CompositeCategoryRuleSpec[]> {
  if (!categoryId) return [];
  const composite =
    prefetched ??
    (await categoryRuleRepository.find({
      where: { userId, ruleKind: "composite", categoryId },
    }));
  return composite
    .filter(
      (rule) => rule.categoryId === categoryId && rule.compositeSpec != null,
    )
    .map((rule) => rule.compositeSpec as CompositeCategoryRuleSpec)
    .slice(0, CATEGORY_RULE_COMPOSITE.VALUE_ADD_MAX_EXISTING_RULES);
}

/**
 * Runs the full persist gate. Returns whether the rule should be saved and,
 * when it should, the final spec to save (with any value-add exclusions merged
 * in). Never throws on LLM failure — value-add fails open.
 */
export async function evaluateRulePersistGate(
  params: RulePersistGateParams,
): Promise<RulePersistGateOutcome> {
  const {
    categoryRuleRepository,
    emailRepository,
    llmCategoriesService,
    normaliseSender,
    userId,
    categoryName,
    categoryId,
    skipValueAdd,
    requireExclusions = true,
    compositeRules,
  } = params;

  // Drop any NOT-contains phrase that duplicates a same-field contains phrase —
  // such a rule is self-contradictory and would never match via that phrase.
  const candidateSpec = dropContradictoryExclusions(params.candidateSpec);

  const rows = await fetchRecentEmailsForMatching(emailRepository, userId);

  // 1. Cheap match gate before any LLM spend.
  const candidateMatches = countMatchesInRows(
    rows,
    candidateSpec,
    normaliseSender,
  );
  if (candidateMatches < CATEGORY_RULE_COMPOSITE.MATCH_GATE_MIN_MATCHES) {
    return {
      shouldPersist: false,
      finalSpec: null,
      reason: "no_mailbox_match",
    };
  }

  let finalSpec = candidateSpec;

  // 2. Value-add comparison against sibling rules for the same category.
  if (!skipValueAdd) {
    const siblingSpecs = await fetchSiblingSpecs(
      categoryRuleRepository,
      userId,
      categoryId,
      compositeRules,
    );
    if (siblingSpecs.length > 0) {
      const assessment = await llmCategoriesService.assessRuleAddsValue({
        categoryName,
        candidate: specToSummary(candidateSpec),
        existingRules: siblingSpecs.map(specToSummary),
        maxSubjectNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
        maxBodyNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
        userId,
      });
      if (!assessment.addsValue) {
        return {
          shouldPersist: false,
          finalSpec: null,
          reason: "redundant",
          detail: assessment.reasoning,
        };
      }
      finalSpec = dropContradictoryExclusions(
        mergeExclusionsIntoSpec(
          candidateSpec,
          assessment.subjectNotContainsAny,
          assessment.bodyNotContainsAny,
        ),
      );
    }
  }

  // 3. Every rule must carry at least one exclusion (when required).
  if (requireExclusions && !specHasExclusion(finalSpec)) {
    return { shouldPersist: false, finalSpec: null, reason: "no_exclusions" };
  }

  // 4. Re-check the match gate in case merged exclusions removed all matches.
  const finalMatches = countMatchesInRows(rows, finalSpec, normaliseSender);
  if (finalMatches < CATEGORY_RULE_COMPOSITE.MATCH_GATE_MIN_MATCHES) {
    return {
      shouldPersist: false,
      finalSpec: null,
      reason: "exclusions_removed_all_matches",
    };
  }

  return { shouldPersist: true, finalSpec, reason: "ok" };
}
