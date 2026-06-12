/**
 * Pure throughput/ETA math for the recategorisation progress bar.
 * Kept free of hooks so the estimate logic is unit-testable in isolation.
 */

export interface ThroughputSample {
  timestampMs: number;
  /** Number of jobs processed (completed + failed) at this point in time. */
  processed: number;
}

/** Minimum samples before an ETA is shown (avoids wild estimates off a single poll). */
export const MIN_ETA_SAMPLES = 3;
/** Minimum observed elapsed time before an ETA is shown. */
export const MIN_ETA_ELAPSED_MS = 4000;
/** Sliding window cap so the estimate adapts to recent throughput, not the whole run. */
export const MAX_ETA_SAMPLES = 20;

const MS_PER_MINUTE = 60_000;

/** Append a sample, keeping at most MAX_ETA_SAMPLES recent entries (sliding window). */
export function appendThroughputSample(samples: ThroughputSample[], sample: ThroughputSample): ThroughputSample[] {
  const next = [...samples, sample];
  return next.length > MAX_ETA_SAMPLES ? next.slice(next.length - MAX_ETA_SAMPLES) : next;
}

/**
 * Estimate the remaining time from observed throughput (processed delta over elapsed
 * time across the sample window). Returns null until there are enough samples, enough
 * elapsed time, and actual forward progress to produce a meaningful estimate.
 */
export function estimateRemainingMs(samples: ThroughputSample[], pending: number): number | null {
  if (pending <= 0 || samples.length < MIN_ETA_SAMPLES) {
    return null;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMs = last.timestampMs - first.timestampMs;
  const processedDelta = last.processed - first.processed;
  if (elapsedMs < MIN_ETA_ELAPSED_MS || processedDelta <= 0) {
    return null;
  }
  const ratePerMs = processedDelta / elapsedMs;
  return pending / ratePerMs;
}

/** Whole minutes for display, rounded up with a floor of 1 ("~1 min remaining"). */
export function formatEtaMinutes(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / MS_PER_MINUTE));
}
