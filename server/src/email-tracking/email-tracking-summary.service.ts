import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  EMAIL_TRACKING_STATUS,
  OpenSource,
  RECENT_OPENS_LIMIT,
} from "../constants/email-tracking.constants";
import { SECONDS_PER_MINUTE } from "../constants/time-constants";
import { EmailTracking } from "../database/entities/email-tracking.entity";
import {
  OpenTrackingStats,
  OpenTrackingSummary,
  RecentOpen,
} from "./email-tracking.types";
import {
  extractTrackingTokens,
  stripTrackingPixelsFromEmail,
} from "./tracking-pixel.helpers";

/** The columns a summary needs — never `recipients`, so nothing is decrypted. */
const SUMMARY_COLUMNS = `
  t.id, t.token, t."messageId", t."threadId", t."sentAt", t."recipientCount",
  t."openCount", t."firstOpenedAt", t."lastOpenedAt",
  t."automaticOpenCount", t."lastAutomaticOpenAt"`;

interface SummaryRow {
  id: string;
  token: string | null;
  messageId: string | null;
  threadId: string | null;
  sentAt: Date;
  recipientCount: number;
  openCount: number;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
  automaticOpenCount: number;
  lastAutomaticOpenAt: Date | null;
}

interface RecentOpenRow {
  trackingId: string;
  openedAt: Date;
  openSource: OpenSource;
  isLikelyAutomatic: boolean;
}

interface StatsRow {
  sentCount: number;
  trackedCount: number;
  openedCount: number;
  automaticOnlyCount: number;
  medianMinutesToFirstOpen: number | string | null;
}

/** A thread message as far as matching it to its tracking row is concerned. */
export interface TrackableThreadEmail {
  id: string;
  messageId?: string | null;
  body?: string | null;
  htmlBody?: string | null;
  receivedAt: Date | string;
}

const toIso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

function toSummary(
  row: SummaryRow,
  recentOpens?: RecentOpen[],
): OpenTrackingSummary {
  return {
    sentAt: new Date(row.sentAt).toISOString(),
    recipientCount: row.recipientCount,
    openCount: row.openCount,
    firstOpenedAt: toIso(row.firstOpenedAt),
    lastOpenedAt: toIso(row.lastOpenedAt),
    automaticOpenCount: row.automaticOpenCount,
    lastAutomaticOpenAt: toIso(row.lastAutomaticOpenAt),
    ...(recentOpens ? { recentOpens } : {}),
  };
}

/**
 * Read side of open tracking: per-message summaries for the thread view, the
 * latest tracked send per thread for the Follow-Up list, and the open-rate
 * stats. Every method is a fixed number of raw queries regardless of how many
 * threads or messages are on screen.
 */
@Injectable()
export class EmailTrackingSummaryService {
  constructor(
    @InjectRepository(EmailTracking)
    private readonly trackingRepository: Repository<EmailTracking>,
  ) {}

  /**
   * Summaries keyed by email id for the user's own tracked messages in a
   * thread. A message is matched by provider message id or by the pixel token
   * in its synced body; a token is credited only to the EARLIEST message that
   * carries it, since later messages contain it only as quoted history.
   */
  async getSummariesForThreadEmails(
    userId: string,
    emails: TrackableThreadEmail[],
  ): Promise<Map<string, OpenTrackingSummary>> {
    const summaries = new Map<string, OpenTrackingSummary>();
    const tokensByEmail = new Map(
      emails.map((email) => [
        email.id,
        [
          ...extractTrackingTokens(email.htmlBody),
          ...extractTrackingTokens(email.body),
        ],
      ]),
    );
    const tokens = [...new Set([...tokensByEmail.values()].flat())];
    const messageIds = emails
      .map((email) => email.messageId)
      .filter((messageId): messageId is string => !!messageId);
    if (!tokens.length && !messageIds.length) return summaries;

    const rows: SummaryRow[] = await this.trackingRepository.query(
      `SELECT ${SUMMARY_COLUMNS}
         FROM email_trackings t
        WHERE t."userId" = $1 AND t.status = $2
          AND (t.token = ANY($3::text[]) OR t."messageId" = ANY($4::text[]))`,
      [userId, EMAIL_TRACKING_STATUS.TRACKED, tokens, messageIds],
    );
    if (!rows.length) return summaries;

    const recentOpens = await this.fetchRecentOpens(rows.map((row) => row.id));
    const byMessageId = new Map(rows.map((row) => [row.messageId, row]));
    const byToken = new Map(rows.map((row) => [row.token, row]));
    const claimed = new Set<string>();

    const chronological = [...emails].sort(
      (first, second) =>
        new Date(first.receivedAt).getTime() -
        new Date(second.receivedAt).getTime(),
    );
    for (const email of chronological) {
      const row =
        (email.messageId ? byMessageId.get(email.messageId) : undefined) ??
        tokensByEmail
          .get(email.id)
          ?.map((token) => byToken.get(token))
          .find((candidate) => candidate && !claimed.has(candidate.id));
      if (!row || claimed.has(row.id)) continue;
      claimed.add(row.id);
      summaries.set(email.id, toSummary(row, recentOpens.get(row.id) ?? []));
    }
    return summaries;
  }

  /**
   * Prepares a thread for display: attaches `openTracking` to the user's own
   * tracked messages, then strips every pixel so rendering the thread can never
   * register as an open. Matching runs first because it reads the pixels.
   */
  async annotateThreadEmails<T extends TrackableThreadEmail>(
    userId: string,
    emails: T[],
  ): Promise<Array<T & { openTracking?: OpenTrackingSummary }>> {
    const summaries = await this.getSummariesForThreadEmails(userId, emails);
    return emails.map((email) => {
      const stripped = stripTrackingPixelsFromEmail(email);
      const openTracking = summaries.get(email.id);
      return openTracking ? { ...stripped, openTracking } : stripped;
    });
  }

  /** The most recent tracked send in each thread, keyed by provider thread id. */
  async getLatestSummariesByThread(
    userId: string,
    threadIds: string[],
  ): Promise<Map<string, OpenTrackingSummary>> {
    const summaries = new Map<string, OpenTrackingSummary>();
    if (!threadIds.length) return summaries;

    const rows: SummaryRow[] = await this.trackingRepository.query(
      `SELECT DISTINCT ON (t."threadId") ${SUMMARY_COLUMNS}
         FROM email_trackings t
        WHERE t."userId" = $1 AND t.status = $2
          AND t."threadId" = ANY($3::text[])
        ORDER BY t."threadId", t."sentAt" DESC`,
      [userId, EMAIL_TRACKING_STATUS.TRACKED, threadIds],
    );
    for (const row of rows) {
      if (row.threadId) summaries.set(row.threadId, toSummary(row));
    }
    return summaries;
  }

  async getStats(userId: string, since: Date): Promise<OpenTrackingStats> {
    const [row]: StatsRow[] = await this.trackingRepository.query(
      `SELECT
         COUNT(*)::int AS "sentCount",
         COUNT(*) FILTER (WHERE status = $3)::int AS "trackedCount",
         COUNT(*) FILTER (WHERE status = $3 AND "openCount" > 0)::int AS "openedCount",
         COUNT(*) FILTER (
           WHERE status = $3 AND "openCount" = 0 AND "automaticOpenCount" > 0
         )::int AS "automaticOnlyCount",
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM ("firstOpenedAt" - "sentAt")) / ${SECONDS_PER_MINUTE}
         ) FILTER (WHERE "firstOpenedAt" IS NOT NULL) AS "medianMinutesToFirstOpen"
       FROM email_trackings
       WHERE "userId" = $1 AND "sentAt" >= $2`,
      [userId, since, EMAIL_TRACKING_STATUS.TRACKED],
    );

    const trackedCount = row?.trackedCount ?? 0;
    const openedCount = row?.openedCount ?? 0;
    const median = row?.medianMinutesToFirstOpen;
    return {
      sentCount: row?.sentCount ?? 0,
      trackedCount,
      openedCount,
      automaticOnlyCount: row?.automaticOnlyCount ?? 0,
      openRate: trackedCount > 0 ? openedCount / trackedCount : null,
      medianMinutesToFirstOpen:
        median === null || median === undefined ? null : Number(median),
    };
  }

  private async fetchRecentOpens(
    trackingIds: string[],
  ): Promise<Map<string, RecentOpen[]>> {
    const rows: RecentOpenRow[] = await this.trackingRepository.query(
      `SELECT "trackingId", "openedAt", "openSource", "isLikelyAutomatic"
         FROM (
           SELECT e.*, ROW_NUMBER() OVER (
             PARTITION BY e."trackingId" ORDER BY e."openedAt" DESC
           ) AS position
           FROM email_open_events e
           WHERE e."trackingId" = ANY($1::uuid[])
         ) ranked
        WHERE position <= $2
        ORDER BY "openedAt" DESC`,
      [trackingIds, RECENT_OPENS_LIMIT],
    );
    const byTracking = new Map<string, RecentOpen[]>();
    for (const row of rows) {
      const opens = byTracking.get(row.trackingId) ?? [];
      opens.push({
        openedAt: new Date(row.openedAt).toISOString(),
        openSource: row.openSource,
        isLikelyAutomatic: row.isLikelyAutomatic,
      });
      byTracking.set(row.trackingId, opens);
    }
    return byTracking;
  }
}
