import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";

/**
 * Sync-window policy (product decision, #sync-window-limits):
 *
 * 1. The initial sync caps at the `INITIAL_SYNC_MAX_EMAILS` most recent emails.
 * 2. After the initial sync, ongoing syncs only fetch emails at most
 *    `ONGOING_SYNC_WINDOW_DAYS` old. Starred emails are fetched separately
 *    by each provider regardless of age.
 * 3. When the cap/window means older mail is being skipped during the initial
 *    sync, `User.syncWindowLimited` is set so the client can show a
 *    "we're not syncing your old emails" banner.
 *
 * These helpers are pure so the decision logic can be unit-tested without
 * provider clients.
 */

/**
 * Overlap subtracted from `lastEmailSyncAt` when computing an incremental
 * window, so mail delivered while the previous sync was running isn't missed.
 */
export const INCREMENTAL_SYNC_OVERLAP_HOURS = 4;

/** Oldest `receivedAt` any non-starred sync fetch is allowed to reach back to. */
export function getOldestAllowedSyncDate(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - QUERY_LIMITS.ONGOING_SYNC_WINDOW_DAYS * MILLISECONDS.DAY,
  );
}

/**
 * Resolves the start of the sync window for an inbox/sent fetch.
 *
 * - `noDateFilter` (the 2-hourly extended sync) gets the full — but still
 *   clamped — ongoing window.
 * - An explicit `syncWindowHours` (continuation jobs) wins over the
 *   incremental default.
 * - Otherwise an incremental window from `lastEmailSyncAt` (minus a small
 *   overlap) is used; a missing `lastEmailSyncAt` (initial sync) gets the
 *   full window.
 *
 * Whatever the source, the result is never older than
 * `ONGOING_SYNC_WINDOW_DAYS` ago.
 */
export function resolveSyncWindowStart(params: {
  lastEmailSyncAt?: Date | null;
  syncWindowHours?: number;
  noDateFilter?: boolean;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const oldestAllowed = getOldestAllowedSyncDate(now);

  if (params.noDateFilter) {
    return oldestAllowed;
  }

  let start: Date;
  if (params.syncWindowHours !== undefined) {
    start = new Date(
      now.getTime() - params.syncWindowHours * MILLISECONDS.HOUR,
    );
  } else if (params.lastEmailSyncAt) {
    start = new Date(
      params.lastEmailSyncAt.getTime() -
        INCREMENTAL_SYNC_OVERLAP_HOURS * MILLISECONDS.HOUR,
    );
  } else {
    start = oldestAllowed;
  }

  return start.getTime() < oldestAllowed.getTime() ? oldestAllowed : start;
}

/** Maximum messages/threads to list: the initial sync caps at the 500 most recent. */
export function resolveMaxFetchResults(isInitialSync: boolean): number {
  return isInitialSync
    ? QUERY_LIMITS.INITIAL_SYNC_MAX_EMAILS
    : QUERY_LIMITS.INBOX_TOTAL;
}

/**
 * True when the initial sync skipped older mail — either the listing hit the
 * fetch cap with more results remaining, or the mailbox holds mail older than
 * the sync window. Ongoing syncs never (re-)flag; the banner is about what the
 * initial import left behind.
 */
export function shouldFlagSyncWindowLimited(params: {
  isInitialSync: boolean;
  hitFetchCap: boolean;
  olderMailExists?: boolean;
}): boolean {
  return (
    params.isInitialSync && (params.hitFetchCap || !!params.olderMailExists)
  );
}
