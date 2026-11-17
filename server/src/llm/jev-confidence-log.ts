import type { LoggerPort } from "../shared/email-intelligence/ports";
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
  /** Summed probability of the most probable category family (categorisation only). */
  familyConfidence?: number;
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
  if (record.familyConfidence !== undefined)
    fields.push(`family_confidence=${formatNumber(record.familyConfidence)}`);
  return `${JEV_CONFIDENCE_LOG_TAG} ${fields.join(" ")}`;
}

export function logJevConfidence(
  logger: Pick<LoggerPort, "log">,
  record: JevConfidenceRecord,
): void {
  logger.log(formatJevConfidenceRecord(record));
}

/**
 * Prefix of the one-line, content-free record written when Jev's answer was
 * below threshold and the LLM fallback then decided: whether the two agreed.
 * Agreement rate per confidence band is the accuracy estimate for lowering a
 * threshold. Lines end in an ANSI colour code, so parse with a regex. Query with:
 *   filter @message like "[JEV-SHADOW]"
 *   | parse @message /confidence=(?<confidence>[0-9.]+) agreed=(?<agreed>true|false) family_agreed=(?<familyAgreed>true|false) family_confidence=(?<familyConfidence>[0-9.]+) family="(?<family>[^"]+)"/
 * Family fields are present only on categorisation records.
 */
export const JEV_SHADOW_LOG_TAG = "[JEV-SHADOW]";

export interface JevShadowRecord {
  decision: string;
  /** Jev's confidence in the answer it was not trusted with. */
  confidence: number;
  /** True when the LLM fallback reached the same answer as Jev. */
  agreed: boolean;
  /** Categorisation only: how Jev's most probable family compared with the fallback's pick. */
  family?: FamilyShadowRecord;
}

export interface FamilyShadowRecord {
  /** Jev's most probable family (a fixed taxonomy label, never user content). */
  family: string;
  confidence: number;
  /** True when the fallback's category belongs to that family. */
  agreed: boolean;
}

export function formatJevShadowRecord(record: JevShadowRecord): string {
  const base = `${JEV_SHADOW_LOG_TAG} decision=${record.decision} confidence=${formatNumber(record.confidence)} agreed=${record.agreed}`;
  if (!record.family) return base;
  const { family, confidence, agreed } = record.family;
  return `${base} family_agreed=${agreed} family_confidence=${formatNumber(confidence)} family="${family}"`;
}

export function logJevShadowAgreement(
  logger: Pick<LoggerPort, "log">,
  record: JevShadowRecord,
): void {
  logger.log(formatJevShadowRecord(record));
}

/** Gap between the two most probable options (the top probability itself when there is only one). */
export function runnerUpMargin(probabilities: Record<string, number>): number {
  const [top = 0, second = 0] = Object.values(probabilities).sort(
    (first, next) => next - first,
  );
  return top - second;
}
