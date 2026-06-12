import { Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { HTTP_STATUS } from "../../constants/http-status";
import { MS_PER_SECOND } from "../../constants/time-constants";
import { formatGaxiosError } from "../../types/common";
import { GmailRateLimitError } from "../../utils/errors";

/**
 * Gmail threads.list helpers, extracted from GmailSyncService to keep that
 * class under the max-lines limit. Pure functions taking the logger as a
 * dependency, following the gmail-sync.refresh-attachments.ts pattern.
 */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface ThreadsListPageParams {
  gmail: gmail_v1.Gmail;
  query: string;
  maxResultsForPage: number;
  pageToken: string | undefined;
  pageCount: number;
}

/**
 * Fetches one threads.list page with exponential-backoff retries on 5xx.
 * 429s abort immediately with a GmailRateLimitError (no retry loop).
 */
export async function fetchThreadsPageWithRetry(
  logger: Logger,
  params: ThreadsListPageParams,
): Promise<gmail_v1.Schema$ListThreadsResponse> {
  const { gmail, query, maxResultsForPage, pageToken, pageCount } = params;
  const MAX_RETRIES = 4;
  const MAX_BACKOFF_SECONDS = 32;
  const MIN_WAIT_MS = 500;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await gmail.users.threads.list({
        userId: "me",
        maxResults: maxResultsForPage,
        q: query,
        pageToken,
      });
      return response.data;
    } catch (error: unknown) {
      lastError = error;
      const errObj = error as {
        response?: { status?: number; headers?: Record<string, string> };
      };
      const status = errObj?.response?.status;
      const headers = errObj?.response?.headers ?? {};

      if (status === HTTP_STATUS.TOO_MANY_REQUESTS) {
        const retryAfterHeader =
          headers["retry-after"] || headers["Retry-After"];
        const retryAfterSeconds = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : undefined;
        const hint = retryAfterSeconds
          ? ` (Retry-After: ${retryAfterSeconds}s)`
          : "";
        logger.warn(
          `[GmailSync] Rate limit (429) on page ${pageCount + 1}${hint} — aborting`,
        );
        throw new GmailRateLimitError(
          `Gmail rate limit exceeded${hint}; sync aborted`,
          Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds,
        );
      }

      if (status && status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
        attempt++;
        const waitSeconds = Math.min(2 ** attempt, MAX_BACKOFF_SECONDS);
        const waitMs = Math.max(MIN_WAIT_MS, waitSeconds * MS_PER_SECOND);
        logger.warn(
          `[GmailSync] threads.list returned ${status}; retry ${attempt}/${MAX_RETRIES} after ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }

  logger.error(
    `[GmailSync] Failed to fetch threads.list after ${MAX_RETRIES} attempts: ${formatGaxiosError(lastError)}`,
    lastError instanceof Error ? lastError.stack : undefined,
  );
  throw lastError;
}

/**
 * Collects thread IDs across threads.list pages up to `maxResults`.
 * `hasMore` is true when a next-page token remained after the cap/page limit,
 * i.e. the listing was truncated and more threads exist beyond the cap.
 */
export async function fetchAllThreadsWithPagination(
  logger: Logger,
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number,
): Promise<{ threadIds: string[]; hasMore: boolean }> {
  const allThreadIds: string[] = [];
  let pageToken: string | undefined;
  const MAX_PAGES = 10;
  let pageCount = 0;

  while (allThreadIds.length < maxResults && pageCount < MAX_PAGES) {
    const maxResultsForPage = Math.min(100, maxResults - allThreadIds.length);
    const response = await fetchThreadsPageWithRetry(logger, {
      gmail,
      query,
      maxResultsForPage,
      pageToken,
      pageCount,
    });
    const threads = response?.threads || [];
    allThreadIds.push(
      ...threads
        .map((thread: gmail_v1.Schema$Thread) => thread.id)
        .filter(Boolean),
    );
    pageToken = response?.nextPageToken || undefined;
    pageCount++;
    if (!pageToken || threads.length === 0) break;
  }

  const hasMore = !!pageToken;
  if (hasMore) {
    logger.warn(
      `[GmailSync] Pagination truncated: ${pageCount} pages, ${allThreadIds.length} ids`,
    );
  }
  return { threadIds: allThreadIds, hasMore };
}

/**
 * Cheap probe (one threads.list page of size 1) for any inbox mail older than
 * the sync window. Used during the initial sync to decide whether the
 * cap/window skipped older mail. Failures are swallowed — the probe must
 * never break the sync itself.
 */
export async function olderMailExistsBeyondWindow(
  logger: Logger,
  gmail: gmail_v1.Gmail,
  syncWindowStart: Date,
): Promise<boolean> {
  try {
    const beforeTimestamp = Math.floor(
      syncWindowStart.getTime() / MS_PER_SECOND,
    );
    const response = await fetchThreadsPageWithRetry(logger, {
      gmail,
      query: `in:inbox before:${beforeTimestamp}`,
      maxResultsForPage: 1,
      pageToken: undefined,
      pageCount: 0,
    });
    return (response?.threads?.length ?? 0) > 0;
  } catch (error) {
    logger.warn(
      `[GmailSync] older-mail probe failed — skipping syncWindowLimited check: ${formatGaxiosError(error)}`,
    );
    return false;
  }
}
