import { OpenSource } from "../constants/email-tracking.constants";

export interface RecentOpen {
  openedAt: string;
  openSource: OpenSource;
  isLikelyAutomatic: boolean;
}

/**
 * What the client needs to draw the sent / opened indicator for one tracked
 * message. `recentOpens` is only filled in on the thread view.
 */
export interface OpenTrackingSummary {
  sentAt: string;
  recipientCount: number;
  openCount: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  automaticOpenCount: number;
  lastAutomaticOpenAt: string | null;
  recentOpens?: RecentOpen[];
}

/** Open-rate section of `GET /emails/stats`. */
export interface OpenTrackingStats {
  /** Every user-originated send in the period, tracked or not. */
  sentCount: number;
  trackedCount: number;
  /** Tracked messages with at least one reliable open. */
  openedCount: number;
  /** Tracked messages whose only opens look like Apple's automatic prefetch. */
  automaticOnlyCount: number;
  /** openedCount / trackedCount, 0..1; null when nothing was tracked. */
  openRate: number | null;
  medianMinutesToFirstOpen: number | null;
}
