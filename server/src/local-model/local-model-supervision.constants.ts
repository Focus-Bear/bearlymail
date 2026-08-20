/**
 * Adaptive LLM-supervision of the local category model.
 *
 * When the local model is confident it applies its prediction and skips the
 * (expensive) LLM. To keep it honest we divert a per-category *sample* of those
 * would-be-applied predictions to the LLM, compare the two, and score category
 * agreement over a rolling window. The sample rate then adapts per category:
 * start high, and step it down as the category proves accurate — step it back
 * up if a completed window regresses. This is the durable replacement for the
 * flat, env-gated `LOCAL_MODEL_HOLDOUT_SAMPLE_RATE` (which defaulted to 0 and
 * was never set in prod, so nothing was ever supervised).
 */

/** Supervision rate ladder (percent), highest → lowest. */
const RATE_STAGE_HIGH = 50;
const RATE_STAGE_MID = 25;
const RATE_STAGE_LOW = 10;

/**
 * Sample rates (percent) in descending order. A fresh category starts at the
 * first (highest) stage; ≥{@link SUPERVISION_ACCURACY_THRESHOLD} accuracy over a
 * full window steps to the next stage, a regression steps back one stage.
 */
export const SUPERVISION_RATE_STAGES = [
  RATE_STAGE_HIGH,
  RATE_STAGE_MID,
  RATE_STAGE_LOW,
] as const;

/** The rate a category is supervised at before it has completed any window. */
export const SUPERVISION_DEFAULT_RATE = SUPERVISION_RATE_STAGES[0];

/** Never supervise below this / above this (mirrors the stage endpoints). */
export const SUPERVISION_MIN_RATE =
  SUPERVISION_RATE_STAGES[SUPERVISION_RATE_STAGES.length - 1];
export const SUPERVISION_MAX_RATE = SUPERVISION_RATE_STAGES[0];

/**
 * Samples (LLM-supervised decisions) that must accumulate for a category before
 * its rate is re-evaluated. Larger = steadier signal, slower to adapt.
 */
export const SUPERVISION_WINDOW_SIZE = 100;

/**
 * Category-agreement rate (local vs LLM) at or above which a category is
 * considered accurate enough to reduce supervision.
 */
export const SUPERVISION_ACCURACY_THRESHOLD = 0.9;

/**
 * Global kill-switch env var. Unset (the default) → adaptive supervision runs
 * ON. Set to "false" to disable supervision entirely (0% — legacy behaviour).
 */
export const SUPERVISION_DISABLED_FLAG = "false";
export const SUPERVISION_ENABLED_ENV = "LOCAL_MODEL_SUPERVISION_ENABLED";
