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
  /** Maximum subject NOT-contains exclusion phrases per composite rule (issue #1789). */
  MAX_SUBJECT_NOT_PHRASES: 10,
  /** Maximum body NOT-contains exclusion phrases per composite rule (issue #1789). */
  MAX_BODY_NOT_PHRASES: 20,
  /** Current spec version for newly created composite rules. */
  SPEC_VERSION: 3 as const,
  /** v2 spec — still supported for backward compatibility. */
  SPEC_VERSION_V2: 2 as const,
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
  /**
   * Number of recent threads to evaluate a draft auto-rule against before
   * persisting it. The rule is rejected if it produces any false positives
   * (i.e. matches a thread the LLM categorised differently); see issue #1789.
   */
  AUTO_VALIDATE_THREAD_COUNT: 200,
  /**
   * Minimum number of true-positive matches a draft auto-rule must produce
   * across the validation window for it to be persisted (issue #1789).
   *
   * Was 10 — but a composite rule requires sender AND a subject phrase AND a
   * body phrase to all match, so demanding 10 such threads (that are also among
   * the AUTO_VALIDATE_THREAD_COUNT most-recent categorised threads and carry the
   * exact LLM-extracted phrases) is unrealistic per sender. Prod logs showed the
   * derive path deriving valid exclusions but then almost every candidate being
   * discarded on this gate (see the `[CategoryRules][derive] … reason=` line).
   * The precision guarantee is the zero-false-positive check, not this count;
   * 3 recurring examples is enough to prove a real pattern.
   */
  AUTO_VALIDATE_MIN_MATCHES: 3,
  /**
   * Maximum number of TP and FP email samples passed to the LLM when
   * deriving `subjectNotContainsAny` / `bodyNotContainsAny` exclusions
   * (#1789 follow-up). Caps prompt size and avoids truncation. Each side
   * is independently capped.
   */
  DERIVE_EXCLUSIONS_MAX_SAMPLES: 8,
  /**
   * Number of most-recent mailbox emails scanned (regardless of category) to
   * confirm a draft rule actually matches real mail before it is persisted.
   * Unlike AUTO_VALIDATE_THREAD_COUNT this is not limited to categorised
   * threads, so it catches rules that match nothing at all.
   */
  MATCH_GATE_SCAN_COUNT: 300,
  /**
   * Minimum number of real mailbox emails a draft rule must match to be
   * persisted. Rules that match zero emails are noise and are discarded.
   */
  MATCH_GATE_MIN_MATCHES: 1,
  /**
   * Maximum number of existing same-category composite rules summarised for
   * the LLM value-add comparison. Caps prompt size.
   */
  VALUE_ADD_MAX_EXISTING_RULES: 12,
  /**
   * Number of most-recently-updated threads scanned when a rule is created,
   * enabled, or edited, to retroactively re-file existing threads the rule
   * matches (LLM-free; writes go through the category precedence guard, so
   * user-pinned threads are never moved). Includes "Other" threads — the main
   * retro-apply target.
   */
  RETRO_APPLY_THREAD_COUNT: 500,
} as const;
