import type {
  CategoryRuleKind,
  CategoryRuleType,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";

export interface EmailMetadata {
  from: string;
  subject: string;
  /** Plain cleaned body slice for composite rule matching (optional). */
  bodyTextForMatch?: string;
}

/**
 * A single auto-drafted composite rule suggestion returned by the
 * `POST /category-rules/suggest` endpoint. The user must confirm before it
 * is persisted (issue #1714).
 */
export interface CategoryRuleSuggestion {
  /** Representative sender pattern for display (may be a wildcard like *@github.com). */
  sender: string;
  /**
   * Suggested sender match patterns for the composite rule spec.
   * May contain domain wildcards (e.g. `*@github.com`) when the LLM detects
   * that multiple addresses from the same domain are involved.
   */
  suggestedSenderPatterns: string[];
  /** Category name inferred from recent LLM categorisations for this sender. */
  categoryName: string;
  /** Distinct subject phrases sampled from recent emails for this sender. */
  suggestedSubjectPhrases: string[];
  /** Distinct body phrases sampled from recent emails for this sender. */
  suggestedBodyPhrases: string[];
  /**
   * Issue #1789: optional subject exclusions suggested by the LLM. May be
   * empty when no clear disambiguator exists.
   */
  suggestedSubjectNotPhrases: string[];
  /** Issue #1789: optional body exclusions suggested by the LLM. */
  suggestedBodyNotPhrases: string[];
  /** Number of distinct threads seen from this sender (used to rank suggestions). */
  threadCount: number;
}

export interface CategoryRuleMatch {
  categoryName: string;
  categoryId: string | null;
  ruleId: string;
  ruleType: CategoryRuleType | null;
  ruleKind: CategoryRuleKind;
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  categoryId: string | null;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeCategoryRuleSpec | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompositeRuleEvaluationDetail {
  senderMatch: boolean;
  subjectMatch: boolean;
  bodyMatch: boolean;
  bodyMatchedPhrase: string | null;
  /** Which sender value matched (v2 rules with multiple senders). */
  senderMatchedValue: string | null;
  /** Which subject phrase matched (v2 rules with multiple subject phrases). */
  subjectMatchedValue: string | null;
  /**
   * Issue #1789: subject exclusion phrase that disqualified the rule, or null
   * when no exclusion fired.
   */
  subjectExcludedMatch: string | null;
  /** Issue #1789: body exclusion phrase that disqualified the rule. */
  bodyExcludedMatch: string | null;
}

export interface CategoryRuleEvaluationDebug {
  id: string;
  ruleKind: CategoryRuleKind;
  ruleType: CategoryRuleType | null;
  categoryName: string;
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  compositeDetail?: CompositeRuleEvaluationDetail;
}

export interface DeterministicRulesDebug {
  winningRule: CategoryRuleMatch | null;
  evaluations: CategoryRuleEvaluationDebug[];
}
