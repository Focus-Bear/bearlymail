export type CategoryRuleKind = 'legacy' | 'composite';

/** v1 spec — single sender/subject (backward compat for existing rules). */
export interface CompositeSpecV1 {
  v: 1;
  sender: string;
  subjectContains: string;
  bodyContainsAny: string[];
}

/**
 * v2 spec — multiple senders/subjects with OR logic within each condition.
 * The optional `*NotContainsAny` arrays are EXCLUSIONS: a rule fails to match
 * when any listed phrase appears in the corresponding field (issue #1789).
 */
export interface CompositeSpecV2 {
  v: 2;
  senderMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  /** Phrases that, if any are present in the subject, disqualify the rule. */
  subjectNotContainsAny?: string[];
  /** Phrases that, if any are present in the body, disqualify the rule. */
  bodyNotContainsAny?: string[];
}

/** Union of all supported composite rule spec versions. */
export type CompositeSpec = CompositeSpecV1 | CompositeSpecV2;

/** Helper to get sender list regardless of spec version. */
export function specSenders(spec: CompositeSpec): string[] {
  return spec.v === 2 ? spec.senderMatchesAny : [spec.sender];
}

/** Helper to get subject phrases regardless of spec version. */
export function specSubjects(spec: CompositeSpec): string[] {
  return spec.v === 2 ? spec.subjectContainsAny : [spec.subjectContains];
}

/** Helper to get subject NOT-contains phrases (v2 only; empty for v1). */
export function specSubjectNotContains(spec: CompositeSpec): string[] {
  return spec.v === 2 ? (spec.subjectNotContainsAny ?? []) : [];
}

/** Helper to get body NOT-contains phrases (v2 only; empty for v1). */
export function specBodyNotContains(spec: CompositeSpec): string[] {
  return spec.v === 2 ? (spec.bodyNotContainsAny ?? []) : [];
}

/**
 * A single auto-drafted composite rule suggestion returned by
 * `POST /category-rules/suggest` (issue #1714).
 * The user confirms before it is persisted via the normal create flow.
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
  categoryName: string;
  suggestedSubjectPhrases: string[];
  suggestedBodyPhrases: string[];
  /** Issue #1789: optional subject exclusion phrases (may be empty). */
  suggestedSubjectNotPhrases: string[];
  /** Issue #1789: optional body exclusion phrases (may be empty). */
  suggestedBodyNotPhrases: string[];
  threadCount: number;
}

export interface CategoryRuleDto {
  id: string;
  categoryName: string;
  ruleKind: CategoryRuleKind;
  ruleType: string | null;
  pattern: string;
  subjectPrefix: string | null;
  compositeSpec: CompositeSpec | null;
  isEnabled: boolean;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}
