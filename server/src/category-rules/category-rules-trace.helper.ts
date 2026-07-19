/**
 * Pure per-rule matching helpers shared by the live debug trace
 * (`getDeterministicRulesDebug`) and the persisted processing-time snapshot
 * (`findMatchingRuleWithTrace`). Keeping them here keeps both paths consistent
 * and keeps the service file under its line budget.
 */
import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CATEGORY_RULE_MATCH_MODES } from "../constants/domain-types";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import {
  CategoryRuleEvaluationDebug,
  EmailMetadata,
} from "./category-rules.types";
import {
  EmailHashes,
  evaluateComposite,
  rulePatternMatches,
} from "./category-rules-auto-composite.helper";

type NormaliseSender = (raw: string) => string;

/** True when a composite spec carries one of the supported schema versions. */
export function compositeSpecIsSupported(
  spec: CompositeCategoryRuleSpec | null | undefined,
): spec is CompositeCategoryRuleSpec {
  return (
    spec != null &&
    (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION ||
      spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2 ||
      spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1)
  );
}

/** Whether a single rule's pattern matches the email (composite or legacy). */
export function ruleMatchesEmail(
  rule: CategoryRule,
  email: EmailMetadata,
  hashes: EmailHashes,
  normaliseSender: NormaliseSender,
): boolean {
  if (rule.ruleKind === CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
    if (!compositeSpecIsSupported(rule.compositeSpec)) {
      return false;
    }
    return evaluateComposite(rule.compositeSpec, email, normaliseSender)
      .matches;
  }
  return rulePatternMatches(rule, hashes);
}

/**
 * Resolves a rule's *effective* category id — the live category it should set,
 * or null when it resolves to no current category (truly orphaned) and must be
 * skipped by the matcher.
 *
 * Resolution order:
 *  1. The stored `categoryId`, when it still points at a live category. This is
 *     preferred so renames (which keep the id) never break a rule. As before, an
 *     empty `validCategoryIds` (a transient read) keeps any non-null id rather
 *     than dropping every match.
 *  2. Otherwise, the live category whose name exactly matches the rule's
 *     `categoryName` (case-insensitive, trimmed). This self-heals the common
 *     case where a category regeneration/consolidation deleted+recreated the
 *     category under a new `contextId` and the FK nulled the rule's link, while
 *     an identically-named category still exists. Exact-name only — never fuzzy
 *     — so a rule is never re-pointed at a *different* category.
 *
 * A rule with no `categoryId` and no name match (e.g. a pre-migration legacy row
 * whose category was deleted) resolves to null and is skipped.
 */
export function resolveRuleCategoryId(
  rule: CategoryRule,
  validCategoryIds: Set<string>,
  categoryIdByName: Map<string, string>,
): string | null {
  if (
    rule.categoryId &&
    (validCategoryIds.size === 0 || validCategoryIds.has(rule.categoryId))
  ) {
    return rule.categoryId;
  }
  const name = rule.categoryName?.trim().toLowerCase();
  if (!name) {
    return null;
  }
  return categoryIdByName.get(name) ?? null;
}

/** IDs of every rule (enabled or not) whose pattern matches the email. */
export function collectMatchingRuleIds(
  rules: CategoryRule[],
  email: EmailMetadata,
  hashes: EmailHashes,
  normaliseSender: NormaliseSender,
): string[] {
  return rules
    .filter((rule) => ruleMatchesEmail(rule, email, hashes, normaliseSender))
    .map((rule) => rule.id);
}

/**
 * Builds the per-rule debug record shown in the live categorisation trace.
 * `categoryExists` reflects whether the rule's category link is still valid; a
 * matching rule with `categoryExists === false` is silently skipped by the
 * matcher, so the UI can explain why a "Matches" rule was never applied.
 */
export function buildRuleEvaluationDebug(args: {
  rule: CategoryRule;
  email: EmailMetadata;
  hashes: EmailHashes;
  isWinningRule: boolean;
  categoryExists: boolean;
  normaliseSender: NormaliseSender;
}): CategoryRuleEvaluationDebug {
  const {
    rule,
    email,
    hashes,
    isWinningRule,
    categoryExists,
    normaliseSender,
  } = args;
  if (rule.ruleKind === CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
    const supported = compositeSpecIsSupported(rule.compositeSpec);
    const evaluated = supported
      ? evaluateComposite(rule.compositeSpec, email, normaliseSender)
      : null;
    return {
      id: rule.id,
      ruleKind: "composite",
      ruleType: null,
      categoryName: rule.categoryName,
      categoryId: rule.categoryId,
      categoryExists,
      pattern: "",
      subjectPrefix: null,
      isEnabled: rule.isEnabled,
      hitCount: rule.hitCount,
      patternMatches: evaluated?.matches ?? false,
      isWinningRule,
      createdAt: rule.createdAt.toISOString(),
      compositeDetail: evaluated?.detail,
    };
  }

  return {
    id: rule.id,
    ruleKind: "legacy",
    ruleType: rule.ruleType,
    categoryName: rule.categoryName,
    categoryId: rule.categoryId,
    categoryExists,
    pattern: rule.pattern || "",
    subjectPrefix: rule.subjectPrefix,
    isEnabled: rule.isEnabled,
    hitCount: rule.hitCount,
    patternMatches: rulePatternMatches(rule, hashes),
    isWinningRule,
    createdAt: rule.createdAt.toISOString(),
  };
}
