/**
 * The single definition of "which threads are in the inbox for this mode and
 * these filters", shared by the category summary (header counts / tab counts)
 * and the thread list query (rows). Issue #2062: when the two were built
 * separately they drifted — the summary counted threads the list never
 * returned, producing sections with a count badge but no rows. Every scope
 * decision (visibility, filters, ordering, row cap, category join, action-mode
 * rule) lives here so the two queries cannot describe different sets.
 */
import { INBOX_FILTER_VALUES } from "../constants/domain-types";
import { INBOX_MODES, QUERY_LIMITS } from "../constants/query-limits";
import { ContextKey } from "../database/entities/user-context.entity";

export interface InboxScopeFilters {
  accountIds?: string[];
  minPriority?: number;
  maxPriority?: number;
  /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
  assigneeId?: string;
}

/**
 * Threads currently visible in any mode: batched-and-held or snoozed threads
 * are hidden until their release time passes.
 */
export const INBOX_SCOPE_VISIBILITY_SQL = `AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
      AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())`;

/** Deterministic order shared by both queries so the row cap cuts the same threads. */
export const INBOX_SCOPE_ORDER_BY_SQL = `ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC, thread."threadId" ASC`;

/**
 * Category join restricted to the user's own EMAIL_CATEGORY contexts. Without
 * the restriction a thread whose categoryId points at another user's context,
 * or at a context of a different key, resolves to a name in the summary but
 * is rejected by the list's category filter.
 */
export function buildUserCategoryJoinSql(userIdParam: string): string {
  return `LEFT JOIN user_contexts uc
      ON uc."contextId" = thread."categoryId"
     AND uc."userId" = ${userIdParam}
     AND uc."contextKey" = '${ContextKey.EMAIL_CATEGORY}'`;
}

/** Maximum threads either query considers for a mode; the list can never show more. */
export function inboxRowLimit(mode: string): number {
  return mode === INBOX_MODES.ACTION
    ? QUERY_LIMITS.INBOX_PROCESS_TOTAL
    : QUERY_LIMITS.INBOX_TOTAL;
}

/**
 * Appends the account / priority / assignee WHERE fragments and binds their
 * params, starting at `paramIndex`. `latestEmailAlias` names the lateral that
 * holds the thread's representative (latest) email in the calling query, so the
 * account filter always tests the same row in both queries.
 */
export function appendInboxScopeFilters(
  filters: InboxScopeFilters | undefined,
  paramIndex: number,
  queryParams: (string | number)[],
  latestEmailAlias: string,
): { additionalFilters: string; paramIndex: number } {
  let additionalFilters = "";
  let idx = paramIndex;

  if (filters?.accountIds && filters.accountIds.length > 0) {
    const phGoogle = filters.accountIds.map(() => `$${idx++}`).join(", ");
    const phOffice = filters.accountIds.map(() => `$${idx++}`).join(", ");
    const phZoho = filters.accountIds.map(() => `$${idx++}`).join(", ");
    additionalFilters += ` AND (${latestEmailAlias}."googleAccountId" IN (${phGoogle}) OR ${latestEmailAlias}."office365AccountId" IN (${phOffice}) OR ${latestEmailAlias}."zohoAccountId" IN (${phZoho}))`;
    queryParams.push(
      ...filters.accountIds,
      ...filters.accountIds,
      ...filters.accountIds,
    );
  }
  if (filters?.minPriority !== undefined) {
    additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${idx++}`;
    queryParams.push(filters.minPriority);
  }
  if (filters?.maxPriority !== undefined) {
    additionalFilters += ` AND COALESCE(thread."priorityScore", 0) < $${idx++}`;
    queryParams.push(filters.maxPriority);
  }
  if (filters?.assigneeId === INBOX_FILTER_VALUES.UNASSIGNED) {
    additionalFilters += ` AND thread."assigneeId" IS NULL`;
  } else if (filters?.assigneeId) {
    additionalFilters += ` AND thread."assigneeId" = $${idx++}`;
    queryParams.push(filters.assigneeId);
  }

  return { additionalFilters, paramIndex: idx };
}

/** The fields the action-mode rule needs, available on both summary rows and list emails. */
export interface ActionModeCandidate {
  from?: string | null;
  sentByAutoResponder?: boolean | null;
  keepInAction?: boolean | null;
}

/** True when the thread's latest message was sent by the user themselves. */
export function isUserSentLast(
  from: string | null | undefined,
  userEmailLower: string,
): boolean {
  return (from?.toLowerCase() ?? "") === userEmailLower;
}

/**
 * Action mode shows starred threads that still need the user's action: threads
 * where the user sent the last message drop out, unless that message was the
 * auto-responder's or the user pinned the thread with "I still need to take
 * action" (#2125). Used by the summary count and the list alike.
 */
export function shouldKeepInActionMode(
  candidate: ActionModeCandidate,
  userEmailLower: string,
): boolean {
  return (
    !isUserSentLast(candidate.from, userEmailLower) ||
    candidate.sentByAutoResponder === true ||
    candidate.keepInAction === true
  );
}
