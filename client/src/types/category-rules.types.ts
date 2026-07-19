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

/**
 * v3 spec — renamed `senderMatchesAny` → `fromMatchesAny` to align with the
 * priority classification model input format (issue #1975). Adds optional
 * fields for read status, attachment, and received/read time conditions.
 */
export interface CompositeSpecV3 {
  v: 3;
  fromMatchesAny: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  subjectNotContainsAny?: string[];
  bodyNotContainsAny?: string[];
  emailIsRead?: boolean;
  emailAttachment?: Record<string, string>;
  emailReceived?: string;
  emailRead?: string;
}

/** Union of all supported composite rule spec versions. */
export type CompositeSpec = CompositeSpecV1 | CompositeSpecV2 | CompositeSpecV3;

/** Helper to get sender list regardless of spec version. */
export function specSenders(spec: CompositeSpec): string[] {
  if (spec.v === 3) {
    return spec.fromMatchesAny;
  }
  if (spec.v === 2) {
    return spec.senderMatchesAny;
  }
  return [spec.sender];
}

/** Helper to get subject phrases regardless of spec version. */
export function specSubjects(spec: CompositeSpec): string[] {
  if (spec.v === 1) {
    return [spec.subjectContains];
  }
  return spec.subjectContainsAny;
}

/** Helper to get subject NOT-contains phrases (v2/v3 only; empty for v1). */
export function specSubjectNotContains(spec: CompositeSpec): string[] {
  if (spec.v === 1) {
    return [];
  }
  return spec.subjectNotContainsAny ?? [];
}

/** Helper to get body NOT-contains phrases (v2/v3 only; empty for v1). */
export function specBodyNotContains(spec: CompositeSpec): string[] {
  if (spec.v === 1) {
    return [];
  }
  return spec.bodyNotContainsAny ?? [];
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
  /**
   * FK to the EMAIL_CATEGORY context. Null when the rule's category was deleted
   * or never linked — such a rule can never set a category, so it is "broken".
   */
  categoryId: string | null;
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
