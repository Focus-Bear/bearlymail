/**
 * Central registry of known debug feature name constants.
 *
 * Use these instead of raw string literals to avoid typos and make
 * cross-file renames trivial.
 */
export const DEBUG_FEATURES = {
  PRIORITY_ANALYSIS_TRACKING: "priority_analysis_tracking",
  /** md5(systemPrompt + prompt) + call site per LLM call, to find duplicate calls. */
  LLM_CALL_FINGERPRINT: "llm_call_fingerprint",
} as const;

export type DebugFeatureName =
  (typeof DEBUG_FEATURES)[keyof typeof DEBUG_FEATURES];
