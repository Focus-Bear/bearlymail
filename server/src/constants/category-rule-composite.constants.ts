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
  /**
   * Distinct-condition minimum for STRUCTURAL rules, i.e. rules pinned to a
   * resolved `notificationSubtype` (e.g. `github:pr`). A notification sub-stream
   * is a precise, deterministic structural signal — sender + subtype already
   * separates one sub-stream from every other, which is exactly what the 3-type
   * (sender + subject + body) requirement exists to guarantee. So a structural
   * rule needs only sender + subtype (2 conditions); subject/body phrases become
   * optional refinements. Non-structural (phrase-only) rules still need all 3.
   */
  MIN_DISTINCT_CONDITION_TYPES_STRUCTURAL: 2,
  /** Minimum length for one auto-generated body line in a composite rule. */
  AUTO_COMPOSITE_RULE_MIN_BODY_PHRASE_CHARS: 6,
  /**
   * Minimum number of distinct threads a sender must have before a rule is
   * automatically generated after LLM categorisation (issue #1714).
   * Rules auto-created below this threshold are too specific / noisy.
   */
  AUTO_GENERATE_MIN_THREAD_COUNT: 10,
  /**
   * Rolling-24h cap on auto rule-generation LLM attempts per user. Every
   * HIGH-confidence categorisation with no rule match triggers a
   * `suggest_category_rules` call (plus derive-exclusion / value-add calls),
   * and the zero-false-positive persist gate rejects almost all of them — so a
   * busy sender that keeps failing the gate burns a fresh call on every email,
   * forever. Prod: 236 calls in a day produced ~5 rules. The cap bounds that
   * spend; the next day's first HIGH-confidence email retries naturally.
   * User-initiated drafts and "Suggest rules for me" are not subject to it.
   */
  AUTO_GENERATE_MAX_LLM_ATTEMPTS_PER_DAY: 20,
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
  SUGGEST_SAMPLE_EMAILS_PER_SENDER: 8,
  /**
   * Breadth of the recent-thread window scanned to measure a draft rule's FALSE
   * positives (matches against threads categorised differently); see issue #1789.
   *
   * Widened 200 → 800: at this user's volume 200 categorised threads is only
   * ~3–4 hours of mail, far too narrow to trust a "zero false positives" reading.
   * 800 covers a meaningfully longer window so an over-broad rule is far more
   * likely to reveal a false positive before it is persisted. TRUE positives are
   * measured separately, against the candidate category's OWN recent threads
   * (see VALIDATE_CATEGORY_THREAD_COUNT), so widening this window does not dilute
   * the per-category true-positive density.
   */
  AUTO_VALIDATE_THREAD_COUNT: 800,
  /**
   * Number of the candidate category's OWN most-recent threads scanned to count
   * TRUE positives. Kept separate from (and denser than) the broad FP window so a
   * rare category can still reach the min-match bar: its true positives are
   * sought among its own mail rather than diluted across the whole mailbox, while
   * false positives are still judged against the broad AUTO_VALIDATE_THREAD_COUNT
   * sample of non-category mail.
   */
  VALIDATE_CATEGORY_THREAD_COUNT: 300,
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
   * Minimum true positives a STRUCTURAL rule (one pinned to a resolved
   * `notificationSubtype`) needs when it produced ZERO false positives. A
   * zero-FP structural rule is a hard, deterministic separator (it can only fire
   * on its own sub-stream), so a single confirmed true positive is enough to
   * prove the sub-stream is real — no need for the AUTO_VALIDATE_MIN_MATCHES bar
   * that exists to guard the looser phrase-only rules. Phrase-only rules keep the
   * higher bar.
   */
  AUTO_VALIDATE_STRUCTURAL_MIN_MATCHES: 1,
  /**
   * Structured QA test-plan/report template markers. QA comments on GitHub PRs
   * follow this template (a heading block) but a QA test PLAN has no Pass/Fail
   * result word, so the brittle Pass/Fail heuristic misses them and they leak
   * into non-QA GitHub categories. Any of these markers in the body is a strong,
   * wording-independent signal that a message is a QA test artefact, so they are
   * auto-added as body NOT-contains exclusions on rules for non-QA GitHub
   * categories (never on QA categories, which SHOULD match them).
   */
  QA_TEMPLATE_MARKERS: ["Test Environment", "Test Objective", "Preconditions"],
  /**
   * Case-insensitive substrings that mark a category as a QA category, which
   * therefore SHOULD keep matching QA test artefacts and must NOT receive the
   * QA_TEMPLATE_MARKERS exclusions.
   */
  QA_CATEGORY_KEYWORDS: ["qa", "quality assurance", "test"],
  /**
   * Maximum number of TP and FP email samples passed to the LLM when
   * deriving `subjectNotContainsAny` / `bodyNotContainsAny` exclusions
   * (#1789 follow-up). Caps prompt size and avoids truncation. Each side
   * is independently capped.
   */
  DERIVE_EXCLUSIONS_MAX_SAMPLES: 8,
  /**
   * Maximum number of exclusion-refinement rounds when a candidate rule still
   * produces false positives. High-volume templated senders (e.g. GitHub PR
   * notifications) can share boilerplate with adjacent sub-streams (issues, CI),
   * so a single derive-exclusions pass rarely eliminates every false positive. A
   * genuinely-valuable candidate (175 true positives, 70 false positives from
   * issue/CI notifications) is worth iterating on: each round derives further
   * exclusions from the RESIDUAL false positives and accumulates them, rather
   * than discarding the rule outright after one pass. Bounded so the loop always
   * terminates; the loop also stops early when a round adds no new exclusion or
   * fails to reduce the false-positive count.
   */
  MAX_RULE_REFINE_ROUNDS: 3,
  /**
   * The most false positives a refined rule may still carry and be persisted.
   * Zero: precision is the whole point of a deterministic rule, and the
   * validation match gate already requires zero false positives, so the refine
   * loop converges only when it has eliminated every false positive.
   */
  RULE_MAX_ACCEPTABLE_FP: 0,
  /**
   * Exclusion quality bar (junk-exclusion fix). The LLM that derives
   * `subjectNotContainsAny` / `bodyNotContainsAny` phrases from false-positive
   * samples tends to grasp at brittle fragments ("Type: Feature Request",
   * "unimported entities") that happen to appear in one FP subject/body but carry
   * no real category signal. Before an exclusion is applied it must clear ALL of:
   *   - length >= DERIVE_EXCLUSION_MIN_PHRASE_LENGTH (short fragments are noise);
   *   - it appears in ZERO true-positive samples (else it would wrongly exclude
   *     genuine category mail — a false negative);
   *   - it eliminates at least DERIVE_EXCLUSION_MIN_FP_HITS false positives that
   *     are not already covered by a stronger exclusion (greedy set-cover, so
   *     redundant phrases are dropped rather than piled on).
   * When no phrase clears the bar the rule is discarded — a brittle rule with
   * junk conditions is worse than no rule.
   */
  DERIVE_EXCLUSION_MIN_PHRASE_LENGTH: 4,
  /** Minimum previously-uncovered false positives a kept exclusion must remove. */
  DERIVE_EXCLUSION_MIN_FP_HITS: 1,
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
