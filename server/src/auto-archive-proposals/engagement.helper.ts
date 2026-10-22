import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { MS_PER_SECOND } from "../constants/time-constants";

/**
 * Engagement signals for one received email, as recorded by BearlyMail.
 * See the `AddEmailEngagementSignals` migration for where each is captured.
 */
export interface EngagementSignals {
  receivedAt: Date;
  /** Provider/BearlyMail read flag. Archiving in BearlyMail also sets it. */
  isRead: boolean;
  /** First time the user opened the email in BearlyMail. */
  openedAt: Date | null;
  /** When the user archived/deleted it in BearlyMail. */
  archivedAt: Date | null;
  /** True when that archive happened while the email was still unread. */
  archivedWhileUnread: boolean;
  /** The thread was archived by a workflow rule, not by the user. */
  archivedByWorkflow: boolean;
  /** The user sent a message in the thread after this email arrived. */
  replied: boolean;
  /** The thread was ever starred (moved to Action). */
  starred: boolean;
  /** The user's manual priority override score, if any. */
  userPriorityOverride: number | null;
}

/** How much an email mattered to the user. */
export const ENGAGEMENT_LEVEL = {
  /** Replied, starred, raised priority, or opened and stayed. */
  ENGAGED: "engaged",
  /** Opened then archived within seconds — a glance, not real interest. */
  GLANCED: "glanced",
  /** Never opened. */
  IGNORED: "ignored",
} as const;

export type EngagementLevel =
  (typeof ENGAGEMENT_LEVEL)[keyof typeof ENGAGEMENT_LEVEL];

/**
 * Read status that cannot be attributed to the user's own archive or to a
 * workflow means the user read it somewhere (BearlyMail before `openedAt`
 * existed, or their provider's own client). Treated as an open — the
 * conservative direction, since it can only block a proposal.
 */
function wasReadOutsideArchive(signals: EngagementSignals): boolean {
  return (
    signals.isRead &&
    !signals.archivedWhileUnread &&
    !signals.archivedByWorkflow
  );
}

function isGlance(signals: EngagementSignals): boolean {
  if (!signals.openedAt || !signals.archivedAt) return false;
  const dwellMs = signals.archivedAt.getTime() - signals.openedAt.getTime();
  return (
    dwellMs >= 0 &&
    dwellMs <= AUTO_ARCHIVE_PROPOSAL_CONFIG.GLANCE_MAX_SECONDS * MS_PER_SECOND
  );
}

/** True when the email was opened at all (BearlyMail or elsewhere). */
export function wasOpened(signals: EngagementSignals): boolean {
  return signals.openedAt !== null || wasReadOutsideArchive(signals);
}

/** Replied, starred or raised priority — the user acted on it, not just read it. */
export function isStrongEngagement(signals: EngagementSignals): boolean {
  const raisedPriority =
    signals.userPriorityOverride !== null &&
    signals.userPriorityOverride >=
      AUTO_ARCHIVE_PROPOSAL_CONFIG.HIGH_PRIORITY_OVERRIDE_SCORE;
  return signals.replied || signals.starred || raisedPriority;
}

/** Classifies one email's engagement from its recorded signals. */
export function classifyEngagement(
  signals: EngagementSignals,
): EngagementLevel {
  if (isStrongEngagement(signals)) return ENGAGEMENT_LEVEL.ENGAGED;
  if (signals.openedAt !== null) {
    return isGlance(signals)
      ? ENGAGEMENT_LEVEL.GLANCED
      : ENGAGEMENT_LEVEL.ENGAGED;
  }
  return wasReadOutsideArchive(signals)
    ? ENGAGEMENT_LEVEL.ENGAGED
    : ENGAGEMENT_LEVEL.IGNORED;
}

/**
 * Upper bound of the Wilson score interval for a binomial proportion. Unlike the
 * raw rate it stays high for small samples — 0 of 5 opened is not evidence of
 * "never opened" — so small clusters cannot clear the noise threshold.
 */
export function wilsonUpperBound(
  successes: number,
  trials: number,
  z: number = AUTO_ARCHIVE_PROPOSAL_CONFIG.WILSON_Z,
): number {
  if (trials <= 0) return 1;
  const proportion = successes / trials;
  const zSquared = z * z;
  const centre = proportion + zSquared / (2 * trials);
  const margin =
    z *
    Math.sqrt(
      (proportion * (1 - proportion)) / trials +
        zSquared / (4 * trials * trials),
    );
  return Math.min(1, (centre + margin) / (1 + zSquared / trials));
}

/** Engagement tallies for a set of emails. */
export interface EngagementTally {
  total: number;
  engaged: number;
  /** Of `engaged`: replied, starred or raised priority. */
  strongEngaged: number;
  glanced: number;
  opened: number;
  replied: number;
  starred: number;
}

/** Counts engagement over a set of emails. */
export function tallyEngagement(
  emails: Array<{ signals: EngagementSignals; level: EngagementLevel }>,
): EngagementTally {
  const tally: EngagementTally = {
    total: emails.length,
    engaged: 0,
    strongEngaged: 0,
    glanced: 0,
    opened: 0,
    replied: 0,
    starred: 0,
  };
  for (const { signals, level } of emails) {
    if (level === ENGAGEMENT_LEVEL.ENGAGED) tally.engaged++;
    if (isStrongEngagement(signals)) tally.strongEngaged++;
    if (level === ENGAGEMENT_LEVEL.GLANCED) tally.glanced++;
    if (wasOpened(signals)) tally.opened++;
    if (signals.replied) tally.replied++;
    if (signals.starred) tally.starred++;
  }
  return tally;
}

/**
 * A group of emails is noise when even the optimistic (upper-bound) estimate of
 * its engagement rate stays at or under the configured ceiling.
 */
export function isLowEngagement(tally: EngagementTally): boolean {
  return (
    wilsonUpperBound(tally.engaged, tally.total) <=
    AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_ENGAGEMENT_UPPER_BOUND
  );
}
