import type {
  CategoryRule,
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

/**
 * Everything rule evaluation needs, fetched once via
 * `CategoryRulesService.loadRuleEvaluationSet` so batch callers can match many
 * emails without re-querying rules + categories per email.
 */
export interface CategoryRuleEvaluationSet {
  /** ALL of the user's rules, createdAt ASC (the trace reports disabled ones too). */
  rules: CategoryRule[];
  validCategoryIds: Set<string>;
  categoryIdByName: Map<string, string>;
}

/**
 * A draft composite rule built from a single email for USER review before it is
 * persisted (issue: draft-rule-from-email). Returned by
 * `POST /category-rules/draft-from-email`. Field names mirror the
 * `POST /category-rules` create payload so the review UI can submit it directly.
 */
export interface CompositeRuleDraft {
  categoryName: string;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny: string[];
  bodyNotContainsAny: string[];
  /**
   * False when the LLM exclusion-derivation step could not find disambiguating
   * NOT-contains phrases (e.g. too few false-positive samples). The review UI
   * must then prompt the user to add at least one exclusion before saving, since
   * the create endpoint requires one.
   */
  exclusionsDerived: boolean;
}

/**
 * Compact, persisted record of what the deterministic-rule step actually did at
 * the moment an email's category was set during priority processing.
 *
 * Stored on `EmailThread.categoryRuleTrace` so the category-debug view can show
 * the ORIGINAL outcome alongside a live re-run. This is the only way to tell
 * "no rule matched when it was processed" apart from "a rule matches now but was
 * created/enabled afterwards" — the live trace alone cannot distinguish them.
 */
export interface CategoryRuleTraceSnapshot {
  /** ISO timestamp of when the rule step ran during processing. */
  evaluatedAt: string;
  /** True when the rule step executed (false reserved for short-circuit/error paths). */
  ruleStepRan: boolean;
  /** How many rules existed for the user when the email was processed. */
  rulesConsideredCount: number;
  /** The rule that won and set the category, or null when no eligible rule matched. */
  winningRuleId: string | null;
  /** Category name of the winning rule, mirrored for display without a rule lookup. */
  winningRuleCategoryName: string | null;
  /**
   * Rule IDs whose pattern matched the email but that did NOT set the category —
   * because they were disabled, lost to an earlier rule, or pointed at a removed
   * category. Lets the debug view explain why a "matching" rule was not applied.
   */
  matchedButNotWinningRuleIds: string[];
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
  /** The rule's category FK (UUID), or null when the rule was never linked. */
  categoryId: string | null;
  /**
   * Whether the rule's category link is still valid. When false, the matcher
   * silently skips the rule even if its pattern matches — so a `patternMatches`
   * rule with `categoryExists === false` can never be applied.
   */
  categoryExists: boolean;
  pattern: string;
  subjectPrefix: string | null;
  isEnabled: boolean;
  hitCount: number;
  patternMatches: boolean;
  isWinningRule: boolean;
  /**
   * ISO creation timestamp of the rule. Lets the debug view flag a rule that
   * matches now but was created AFTER the email was processed (so it could not
   * have applied at the time).
   */
  createdAt: string;
  compositeDetail?: CompositeRuleEvaluationDetail;
}

export interface DeterministicRulesDebug {
  winningRule: CategoryRuleMatch | null;
  evaluations: CategoryRuleEvaluationDebug[];
}
