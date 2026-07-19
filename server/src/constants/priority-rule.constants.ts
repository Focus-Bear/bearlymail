/**
 * Gate thresholds for mining deterministic priority rules from the LLM's own
 * scores (issue: deterministic priority rules).
 */
export const PRIORITY_RULE_GATES = {
  /**
   * Minimum number of LLM-labelled threads a sender must have before a rule is
   * considered. Higher than the category-rule threshold (10) because priority
   * is goal-sensitive and riskier to fix deterministically.
   */
  MIN_SAMPLES: 25,
  /**
   * Minimum fraction of those threads that must fall in a single band for a
   * rule to form. Replaces category's "0 false positives" gate — it is the
   * safety valve that stops a rule forming for senders whose priority varies.
   */
  DOMINANT_BAND_THRESHOLD: 0.9,
} as const;

export const PRIORITY_SCORE_SOURCE = {
  LLM: "llm",
  RULE: "rule",
  LOCAL: "local",
} as const;

/** Marks how a thread's priorityScore was last set, for re-mining provenance. */
export type PriorityScoreSource =
  (typeof PRIORITY_SCORE_SOURCE)[keyof typeof PRIORITY_SCORE_SOURCE];

/** Who owns a priority rule: the miner ('mined') or the user ('user'). */
export const PRIORITY_RULE_SOURCE = {
  MINED: "mined",
  USER: "user",
} as const;

export type PriorityRuleSource =
  (typeof PRIORITY_RULE_SOURCE)[keyof typeof PRIORITY_RULE_SOURCE];

/** Default fraction of rule matches that still run the LLM (shadow-sampling). */
const DEFAULT_SHADOW_SAMPLE_RATE = 0.1;

/**
 * Skip controls. The skip path is ON by default and gated by the rules' own
 * formation bar: a rule only exists after ≥25 LLM-labelled threads cluster ≥90%
 * in one band, so default-on never skips an unproven sender. A matching email
 * also needs a category rule before it skips. Set
 * `PRIORITY_RULE_SKIP_ENABLED=false` as a kill switch. Even when on, a fraction
 * of matches still run the LLM (shadow-sampling) so drift keeps being measured.
 */
export const PRIORITY_RULE_SKIP = {
  /** Reads the env flag fresh each call so it can be toggled without redeploy. */
  enabled(): boolean {
    return process.env.PRIORITY_RULE_SKIP_ENABLED !== "false";
  },
  /** Fraction of rule matches that still run the LLM when skipping is enabled. */
  shadowSampleRate(): number {
    const parsed = Number(process.env.PRIORITY_RULE_SHADOW_SAMPLE_RATE);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
      ? parsed
      : DEFAULT_SHADOW_SAMPLE_RATE;
  },
} as const;

/**
 * Phase-3 drift controls. A rule is retired (disabled) once it has enough
 * shadow samples and its band disagrees with the LLM too often.
 */
export const PRIORITY_RULE_DRIFT = {
  /** Minimum shadow samples before a rule can be retired for divergence. */
  MIN_SHADOW_SAMPLES: 10,
  /** Divergence rate above which a rule is retired. */
  MAX_DIVERGENCE_RATE: 0.3,
} as const;
