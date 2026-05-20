/**
 * Pure helper functions for EmailDebugService thread analysis.
 * Extracted from email-debug.service.ts as part of issue #939 batch 2.
 *
 * These functions have no NestJS service dependencies and can be used
 * in both EmailDebugService and any future debug modules.
 */

import { SYNC_STATUS } from "../constants/domain-statuses";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";

const UNKNOWN_DURATION_MINUTES = 999;

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

/**
 * Build a set of human-readable reason strings explaining why a thread may
 * not appear in the expected inbox view.
 *
 * @param isSenderBlocked - async predicate to check if a sender is blocked.
 *   Extracted to keep this function free of NestJS service dependencies.
 */
export async function buildConditionReasons(
  thread: EmailThread,
  emails: Email[],
  userId: string,
  latestEmail: Email | undefined,
  isSenderBlocked: (userId: string, email: string) => Promise<boolean>,
): Promise<{ reasons: string[]; isBlocked: boolean }> {
  const reasons: string[] = [];

  if (emails.length === 0) {
    reasons.push(
      "Thread exists but has no emails linked to it (orphan thread)",
    );
  }

  if (thread.syncStatus === SYNC_STATUS.UNSYNCED) {
    const minutesSinceUpdate = thread.syncStatusUpdatedAt
      ? Math.floor(
          (Date.now() - new Date(thread.syncStatusUpdatedAt).getTime()) /
            MILLISECONDS.MINUTE,
        )
      : UNKNOWN_DURATION_MINUTES;
    reasons.push(
      `Thread has UNSYNCED changes (${minutesSinceUpdate} min ago) - local state may differ from Gmail`,
    );
  }

  if (thread.starCount === 0) {
    reasons.push(
      "Thread starCount is 0 in BearlyMail - will appear in Triage, not Action tab",
    );
  }

  if (thread.isArchived) {
    reasons.push(
      "Thread is ARCHIVED - archived threads don't show in any inbox view",
    );
  }

  let isBlocked = false;
  if (latestEmail) {
    isBlocked = await isSenderBlocked(userId, latestEmail.from || "");
    if (isBlocked) {
      reasons.push(`Sender "${latestEmail.from}" is BLOCKED`);
    }

    if (
      latestEmail.isSnoozed &&
      latestEmail.snoozeUntil &&
      new Date(latestEmail.snoozeUntil) > new Date()
    ) {
      reasons.push(
        `Email is SNOOZED until ${new Date(latestEmail.snoozeUntil).toISOString()}`,
      );
    }
  }

  if (
    thread.isBatched &&
    thread.batchReleaseAt &&
    new Date(thread.batchReleaseAt) > new Date()
  ) {
    reasons.push(
      `Thread is BATCHED and will be released at ${new Date(thread.batchReleaseAt).toISOString()}`,
    );
  }

  if (thread.batchDecisionReason) {
    reasons.push(`Batch decision: ${thread.batchDecisionReason}`);
  }

  return { reasons, isBlocked };
}

/**
 * Determine in which inbox views a thread would currently appear,
 * based on archive / snooze / batch / star state.
 */
export function buildThreadVisibility(
  thread: EmailThread,
  latestEmail: Email | undefined,
  isBlocked: boolean,
): {
  wouldShowInTriage: boolean;
  wouldShowInAction: boolean;
  wouldShowInFollowUp: boolean;
  baseConditionsMet: boolean;
} {
  const isNotArchived = !thread.isArchived;
  const hasNoBlockedSender = !isBlocked;
  const isNotSnoozed =
    !latestEmail ||
    !latestEmail.isSnoozed ||
    !latestEmail.snoozeUntil ||
    new Date(latestEmail.snoozeUntil) <= new Date();
  const isNotBatched =
    !thread.isBatched ||
    !thread.batchReleaseAt ||
    new Date(thread.batchReleaseAt) <= new Date();

  const baseConditionsMet =
    isNotArchived && hasNoBlockedSender && isNotSnoozed && isNotBatched;

  return {
    wouldShowInTriage: baseConditionsMet && thread.starCount === 0,
    wouldShowInAction: baseConditionsMet && thread.starCount > 0,
    wouldShowInFollowUp: baseConditionsMet && thread.starCount > 0,
    baseConditionsMet,
  };
}

/**
 * Build a human-readable reason code explaining why a Gmail-starred thread is
 * absent from the Action / Follow-Up inbox.
 *
 * Reason codes (prefix before ":"): OK | NOT_STARRED_IN_DB | ARCHIVED | SNOOZED |
 * BATCHED | BLOCKED_SENDER | UNSYNCED | UNKNOWN
 */
export function buildStarredThreadReason(
  thread: EmailThread,
  latestEmail: Email | undefined,
  isBlocked: boolean,
  visibility: { wouldShowInAction: boolean; baseConditionsMet: boolean },
): string {
  if (visibility.wouldShowInAction) {
    return "OK: thread is starred and should appear in Action tab";
  }
  if (thread.starCount === 0) {
    return (
      "NOT_STARRED_IN_DB: thread exists in BearlyMail but starCount is 0 — " +
      "Gmail and BearlyMail stars are out of sync. Trigger a manual sync to re-star."
    );
  }
  if (thread.isArchived) {
    return "ARCHIVED: thread is archived in BearlyMail and won't appear in any inbox view";
  }
  if (
    latestEmail?.isSnoozed &&
    latestEmail.snoozeUntil &&
    new Date(latestEmail.snoozeUntil) > new Date()
  ) {
    return `SNOOZED: thread is snoozed until ${new Date(latestEmail.snoozeUntil).toISOString()}`;
  }
  if (
    thread.isBatched &&
    thread.batchReleaseAt &&
    new Date(thread.batchReleaseAt) > new Date()
  ) {
    return `BATCHED: thread will be released from batch at ${new Date(thread.batchReleaseAt).toISOString()}`;
  }
  if (isBlocked) {
    return `BLOCKED_SENDER: sender "${latestEmail?.from ?? "unknown"}" is blocked`;
  }
  if (thread.syncStatus === SYNC_STATUS.UNSYNCED) {
    const minutesSinceUpdate = thread.syncStatusUpdatedAt
      ? Math.floor(
          (Date.now() - new Date(thread.syncStatusUpdatedAt).getTime()) /
            MILLISECONDS.MINUTE,
        )
      : UNKNOWN_DURATION_MINUTES;
    return (
      `UNSYNCED: thread has pending Gmail changes that haven't been applied yet ` +
      `(${minutesSinceUpdate} min ago) — the local BearlyMail state may differ from Gmail`
    );
  }
  return "UNKNOWN: thread does not meet Action tab conditions for an unidentified reason";
}

/**
 * Detect the format of a Gmail web UI URL hash fragment.
 * Gmail URLs use different formats depending on how the user navigated:
 *   - inbox:  #inbox/<id>
 *   - search: #search/<query>/<id>
 *   - label:  #label/<labelName>/<id>
 */
export function detectGmailUrlFormat(
  url: string,
): "inbox" | "search" | "label" | "unknown" {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return "unknown";
  const fragment = decodeURIComponent(url.slice(hashIndex + 1));
  if (fragment.startsWith("inbox/")) return "inbox";
  if (fragment.startsWith("search/")) return "search";
  if (fragment.startsWith("label/")) return "label";
  return "unknown";
}

/**
 * Extract the message/thread ID from a Gmail web UI URL.
 *
 * All Gmail URL formats end with the ID as the last `/`-separated segment
 * of the hash fragment. URL-decoding is applied first so that encoded
 * characters in the query segment (e.g. `%40` for `@`) do not interfere
 * with the split.
 */
export function extractGmailUrlId(url: string): string {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) {
    const segments = url.split("/");
    return segments[segments.length - 1] || url;
  }
  const fragment = decodeURIComponent(url.slice(hashIndex + 1));
  const segments = fragment.split("/");
  return segments[segments.length - 1] || fragment;
}

/**
 * Extract the `/u/N/` account index from a Gmail web URL. Gmail uses this to
 * indicate which logged-in Google account the URL is for — a frequent cause
 * of "URL not found" issues is the URL pointing at a different account than
 * the one BearlyMail has OAuth tokens for.
 */
export function extractGmailUrlAccountIndex(url: string): string | null {
  const match = url.match(/\/mail\/u\/(\d+)\//);
  return match ? match[1] : null;
}

/**
 * Build a diagnostic message explaining why a Gmail URL lookup failed,
 * including the connected Gmail account email and the URL's `/u/N/` index
 * so users can immediately tell when the URL is for a different account.
 */
export function buildGmailUrlNotFoundReasons(args: {
  urlId: string;
  detectedFormat: string;
  gmailApiResult: {
    connectedEmail: string | null;
    idsTried: string[];
    attempts: Array<{
      id: string;
      kind: "message" | "thread";
      success: boolean;
      errorCode?: number;
      errorMessage?: string;
    }>;
    error?: string;
  };
  accountIndex?: string | null;
}): string[] {
  const { urlId, detectedFormat, gmailApiResult, accountIndex } = args;
  const reasons: string[] = [
    `URL ID "${urlId}" (Gmail URL format: ${detectedFormat}) not found in BearlyMail database or via the Gmail API.`,
  ];

  if (gmailApiResult.connectedEmail) {
    const accountHint = accountIndex
      ? ` The URL is for /u/${accountIndex}/ in your browser — confirm that account matches "${gmailApiResult.connectedEmail}".`
      : "";
    reasons.push(
      `BearlyMail's Gmail OAuth is connected to: ${gmailApiResult.connectedEmail}.${accountHint}`,
    );
  } else if (!gmailApiResult.error) {
    reasons.push(
      "Could not read the connected Gmail account profile — OAuth may be missing the basic-profile scope.",
    );
  }

  if (gmailApiResult.idsTried.length > 0) {
    reasons.push(
      `Tried ${gmailApiResult.idsTried.length} candidate ID variant(s): ${gmailApiResult.idsTried.join(", ")}.`,
    );
  }

  const informativeFailures = gmailApiResult.attempts.filter(
    (attempt) =>
      !attempt.success &&
      attempt.errorCode !== undefined &&
      attempt.errorCode !== HTTP_NOT_FOUND &&
      attempt.errorCode !== HTTP_BAD_REQUEST,
  );
  if (informativeFailures.length > 0) {
    const first = informativeFailures[0];
    reasons.push(
      `Gmail API returned ${first.errorCode} for ${first.kind} lookup of "${first.id}": ${first.errorMessage ?? "no detail"}.`,
    );
  }

  if (gmailApiResult.error) {
    reasons.push(`Gmail API error: ${gmailApiResult.error}`);
  }

  return reasons;
}

/** Build a summary object from an array of per-thread analysis results. */
export function computeStarredSummary(
  threads: Array<{
    inDb: boolean;
    isStarredInDb: boolean;
    appearsInActionOrFollowUp: boolean;
    isArchivedInDb: boolean;
    archiveStatusConflict: boolean;
  }>,
  gmailStarredCount: number,
): {
  gmailStarredCount: number;
  foundInDb: number;
  notInDb: number;
  inActionOrFollowUp: number;
  starredInDbButHidden: number;
  notStarredInDb: number;
  archivedInBearlyMail: number;
  archiveConflicts: number;
} {
  return {
    gmailStarredCount,
    foundInDb: threads.filter((thread) => thread.inDb).length,
    notInDb: threads.filter((thread) => !thread.inDb).length,
    inActionOrFollowUp: threads.filter(
      (thread) => thread.appearsInActionOrFollowUp,
    ).length,
    notStarredInDb: threads.filter(
      (thread) => thread.inDb && !thread.isStarredInDb,
    ).length,
    starredInDbButHidden: threads.filter(
      (thread) =>
        thread.inDb &&
        thread.isStarredInDb &&
        !thread.appearsInActionOrFollowUp,
    ).length,
    archivedInBearlyMail: threads.filter(
      (thread) => thread.inDb && thread.isArchivedInDb,
    ).length,
    archiveConflicts: threads.filter((thread) => thread.archiveStatusConflict)
      .length,
  };
}

/** Shape of a single entry in the debugStarredThreads result. */
export interface StarredThreadEntry {
  threadId: string;
  subject: string | null;
  inDb: boolean;
  isStarredInDb: boolean;
  category: string | null;
  appearsInActionOrFollowUp: boolean;
  reason: string;
  isArchivedInDb: boolean;
  isInGmailInbox: boolean;
  syncStatus: "synced" | "unsynced";
  hasUnsyncedChanges: boolean;
  archiveStatusConflict: boolean;
}

/**
 * Analyse a single Gmail-starred thread against the BearlyMail DB records.
 * Returns a StarredThreadEntry (not-in-DB path or fully-analysed path).
 */
export async function analyzeStarredThread(options: {
  gmailThreadId: string;
  dbThreadMap: Map<string, EmailThread>;
  latestEmailsByThread: Map<string, Email>;
  gmailInboxSet: Set<string>;
  isSenderBlocked: (userId: string, email: string) => Promise<boolean>;
  userId: string;
}): Promise<StarredThreadEntry> {
  const {
    gmailThreadId,
    dbThreadMap,
    latestEmailsByThread,
    gmailInboxSet,
    isSenderBlocked,
    userId,
  } = options;
  const thread = dbThreadMap.get(gmailThreadId);

  if (!thread) {
    return {
      threadId: gmailThreadId,
      subject: null,
      inDb: false,
      isStarredInDb: false,
      category: null,
      appearsInActionOrFollowUp: false,
      reason:
        "NOT_IN_DB: thread exists in Gmail but has never been synced to BearlyMail " +
        "(likely older than the sync window — try triggering a manual sync)",
      isArchivedInDb: false,
      isInGmailInbox: gmailInboxSet.has(gmailThreadId),
      syncStatus: "synced" as const,
      hasUnsyncedChanges: false,
      archiveStatusConflict: false,
    };
  }

  const latestEmail = latestEmailsByThread.get(thread.id);
  const isBlocked = latestEmail
    ? await isSenderBlocked(userId, latestEmail.from ?? "")
    : false;

  const visibility = buildThreadVisibility(thread, latestEmail, isBlocked);
  const reason = buildStarredThreadReason(
    thread,
    latestEmail,
    isBlocked,
    visibility,
  );
  const isInGmailInbox = gmailInboxSet.has(gmailThreadId);
  const hasUnsyncedChanges = thread.syncStatus === SYNC_STATUS.UNSYNCED;

  return {
    threadId: gmailThreadId,
    subject:
      latestEmail?.subject?.substring(
        0,
        QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH,
      ) ?? null,
    inDb: true,
    isStarredInDb: thread.starCount > 0,
    // categoryId is the source of truth (fixes #1293)
    category: thread.categoryId ?? null,
    appearsInActionOrFollowUp: visibility.wouldShowInAction,
    reason,
    isArchivedInDb: thread.isArchived,
    isInGmailInbox,
    syncStatus: thread.syncStatus as "synced" | "unsynced",
    hasUnsyncedChanges,
    archiveStatusConflict:
      thread.isArchived && isInGmailInbox && !hasUnsyncedChanges,
  };
}
