/** Limits and schema versioning for composite category rules. */
export const CATEGORY_RULE_COMPOSITE = {
  MAX_CATEGORY_NAME_LENGTH: 500,
  MAX_SENDER_LENGTH: 320,
  MAX_SUBJECT_CONTAINS_LENGTH: 200,
  MAX_BODY_PHRASES: 20,
  MAX_BODY_PHRASE_LENGTH: 200,
  /** Maximum senders per composite rule (OR logic within). */
  MAX_SENDERS: 10,
  /** Maximum subject phrases per composite rule (OR logic within). */
  MAX_SUBJECT_PHRASES: 10,
  /** Current spec version for newly created composite rules. */
  SPEC_VERSION: 2 as const,
  /** Legacy spec version — still supported for backward compatibility. */
  SPEC_VERSION_V1: 1 as const,
  /** Composite rules require sender, subject, and body conditions. */
  MIN_DISTINCT_CONDITION_TYPES: 3,
  /** Minimum length for one auto-generated body line in a composite rule. */
  AUTO_COMPOSITE_RULE_MIN_BODY_PHRASE_CHARS: 6,
  /**
   * Minimum number of distinct threads a sender must have before a rule is
   * automatically generated after LLM categorisation (issue #1714).
   * Rules auto-created below this threshold are too specific / noisy.
   */
  AUTO_GENERATE_MIN_THREAD_COUNT: 10,
  /**
   * Minimum number of distinct threads a sender must have before it is
   * included in the "Suggest rules for me" response (issue #1714).
   * Lower than AUTO_GENERATE_MIN_THREAD_COUNT because the user confirms
   * the suggestion before it is saved.
   */
  SUGGEST_MIN_THREAD_COUNT: 5,
  /** Maximum number of rule suggestions returned by the suggest endpoint. */
  SUGGEST_MAX_RESULTS: 10,
  /** Number of recent emails per sender sampled when building suggestions. */
  SUGGEST_SAMPLE_EMAILS_PER_SENDER: 5,
} as const;
