/** Limits for user-defined composite category rules (issue #1624 extension). */
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
} as const;
