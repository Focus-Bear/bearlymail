import type { Logger } from "@nestjs/common";

/**
 * Prefix of the one-line, content-free record written for every Jev answer,
 * accepted or not, so acceptance thresholds can be calibrated from production
 * traffic. Query with CloudWatch Logs Insights, e.g.
 *   filter @message like "[JEV-CONFIDENCE]"
 *   | parse @message "decision=* outcome=* confidence=* threshold=*" as decision, outcome, confidence, threshold
 */
export const JEV_CONFIDENCE_LOG_TAG = "[JEV-CONFIDENCE]";

export const JEV_OUTCOMES = {
  ACCEPTED: "accepted",
  BELOW_THRESHOLD: "below_threshold",
  NEEDS_GENERATION: "needs_generation",
} as const;

export type JevOutcome = (typeof JEV_OUTCOMES)[keyof typeof JEV_OUTCOMES];

export interface JevConfidenceRecord {
  /** Operation (categorisation) or decision kind the answer was for. */
  decision: string;
  outcome: JevOutcome;
  /** Lowest confidence among the answers the decision relied on; null when it relied on none. */
  confidence: number | null;
  threshold: number;
  /** Choice options offered, including the "none of these" option. */
  optionCount?: number;
  /** True when Jev picked the "none of these" option (e.g. Other). */
  choseNoneOption?: boolean;
  /** Top probability minus the runner-up's: small margins mean near-ties between options. */
  runnerUpMargin?: number;
}

const DECIMAL_PLACES = 2;

function formatNumber(value: number | null): string {
  return value === null ? "none" : value.toFixed(DECIMAL_PLACES);
}

/** Space-separated key=value pairs, in a fixed order so Logs Insights `parse` patterns stay stable. */
export function formatJevConfidenceRecord(record: JevConfidenceRecord): string {
  const fields = [
    `decision=${record.decision}`,
    `outcome=${record.outcome}`,
    `confidence=${formatNumber(record.confidence)}`,
    `threshold=${formatNumber(record.threshold)}`,
  ];
  if (record.optionCount !== undefined)
    fields.push(`options=${record.optionCount}`);
  if (record.choseNoneOption !== undefined)
    fields.push(`chose_none=${record.choseNoneOption}`);
  if (record.runnerUpMargin !== undefined)
    fields.push(`margin=${formatNumber(record.runnerUpMargin)}`);
  return `${JEV_CONFIDENCE_LOG_TAG} ${fields.join(" ")}`;
}

export function logJevConfidence(
  logger: Pick<Logger, "log">,
  record: JevConfidenceRecord,
): void {
  logger.log(formatJevConfidenceRecord(record));
}

/** Gap between the two most probable options (the top probability itself when there is only one). */
export function runnerUpMargin(probabilities: Record<string, number>): number {
  const [top = 0, second = 0] = Object.values(probabilities).sort(
    (first, next) => next - first,
  );
  return top - second;
}
