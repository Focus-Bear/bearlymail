import {
  PRIORITY_BANDS,
  PriorityBand,
  scoreToBand,
} from "../constants/priority-band";
import {
  PRIORITY_RULE_DRIFT,
  PRIORITY_RULE_GATES,
} from "../constants/priority-rule.constants";

export interface BandConsistency {
  sampleCount: number;
  /** The most common band, or null when there are no samples. */
  dominantBand: PriorityBand | null;
  /** Fraction (0-1) of samples in `dominantBand`. */
  dominantShare: number;
}

/**
 * Summarises how tightly a sender's LLM priority scores cluster into a single
 * band. On a tie the higher-urgency band wins (PRIORITY_BANDS is ordered
 * urgent → very_low and we keep the first band reaching the max), so a sender
 * split evenly is never quietly under-prioritised.
 */
export function computeBandConsistency(scores: number[]): BandConsistency {
  const sampleCount = scores.length;
  if (sampleCount === 0) {
    return { sampleCount: 0, dominantBand: null, dominantShare: 0 };
  }

  const counts = new Map<PriorityBand, number>();
  for (const score of scores) {
    const band = scoreToBand(score);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }

  let dominantBand: PriorityBand | null = null;
  let maxCount = 0;
  for (const band of PRIORITY_BANDS) {
    const count = counts.get(band) ?? 0;
    if (count > maxCount) {
      maxCount = count;
      dominantBand = band;
    }
  }

  return { sampleCount, dominantBand, dominantShare: maxCount / sampleCount };
}

/**
 * Whether a band distribution clears both gates (enough samples AND a dominant
 * band), i.e. a deterministic rule may be formed for the sender.
 */
export function qualifiesForRule(consistency: BandConsistency): boolean {
  return (
    consistency.dominantBand !== null &&
    consistency.sampleCount >= PRIORITY_RULE_GATES.MIN_SAMPLES &&
    consistency.dominantShare >= PRIORITY_RULE_GATES.DOMINANT_BAND_THRESHOLD
  );
}

/**
 * Whether a rule has drifted enough to retire: it must have at least the
 * minimum shadow samples AND disagree with the LLM more often than the allowed
 * divergence rate.
 */
export function shouldRetireForDrift(
  shadowSampleCount: number,
  shadowDivergenceCount: number,
): boolean {
  if (shadowSampleCount < PRIORITY_RULE_DRIFT.MIN_SHADOW_SAMPLES) {
    return false;
  }
  return (
    shadowDivergenceCount / shadowSampleCount >
    PRIORITY_RULE_DRIFT.MAX_DIVERGENCE_RATE
  );
}
