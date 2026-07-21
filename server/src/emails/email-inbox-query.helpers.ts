/* istanbul ignore file */
import { Repository } from "typeorm";

import { INBOX_FILTER_VALUES } from "../constants/domain-types";
import { INBOX_MODES, QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { buildThreadFilter, RawEmailRow } from "./email-inbox.types";

type InboxQueryFilters = {
  accountIds?: string[];
  minPriority?: number;
  maxPriority?: number;
  /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
  assigneeId?: string;
};

function appendInboxAdditionalFilters(
  filters: InboxQueryFilters | undefined,
  paramIndex: number,
  queryParams: (string | number)[],
): { additionalFilters: string; paramIndex: number } {
  let additionalFilters = "";
  let idx = paramIndex;

  if (filters?.accountIds && filters.accountIds.length > 0) {
    const phGoogle = filters.accountIds.map(() => `$${idx++}`).join(", ");
    const phOffice = filters.accountIds.map(() => `$${idx++}`).join(", ");
    const phZoho = filters.accountIds.map(() => `$${idx++}`).join(", ");
    additionalFilters += ` AND (e."googleAccountId" IN (${phGoogle}) OR e."office365AccountId" IN (${phOffice}) OR e."zohoAccountId" IN (${phZoho}))`;
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

/**
 * Builds and executes the raw SQL inbox query, returning one representative
 * email row per thread ordered by priority descending.
 *
 * Extracted from EmailInboxService to keep that file under the 800-line limit.
 */
export async function runInboxQuery(
  emailRepository: Repository<Email>,
  userId: string,
  mode: string,
  filters?: InboxQueryFilters,
  userEmailHmac?: string,
): Promise<RawEmailRow[]> {
  const threadFilter = buildThreadFilter(mode);
  const queryParams: (string | number)[] = [userId];
  const { additionalFilters, paramIndex: nextIdx } =
    appendInboxAdditionalFilters(filters, 2, queryParams);
  let paramIndex = nextIdx;

  let correspondentFilter: string;
  if (userEmailHmac) {
    const hmacParam = `$${paramIndex++}`;
    queryParams.push(userEmailHmac);
    correspondentFilter = `AND cor."senderEmailHmac" IS DISTINCT FROM ${hmacParam}`;
  } else {
    correspondentFilter = "";
  }

  return emailRepository.query(
    `SELECT
          thread."starCount", thread."isArchived", thread."urgencyScore",
          thread."priorityExplanation", thread."priorityScore", thread."isProcessingPriority",
          thread."githubMetadata", thread."categoryExplanation",
          thread."protoCategoryId", thread."categoryId", thread."categorySource",
          uc."contextValue" AS "categoryName",
          thread."updatedAt" as "threadUpdatedAt",
          thread."isBatched", thread."batchReleaseAt", thread."wasDeliveredEarly",
          thread."batchDecisionReason",
          pc."name" as "protoCategoryName", pc."description" as "protoCategoryDescription",
      e.id, e."userId", e."threadId", e."emailThreadId", e."messageId",
      e."googleAccountId", e."office365AccountId", e."zohoAccountId",
      e."from", e."fromName", e."senderJobTitle", e.subject,
      e."isSnoozed", e."snoozeUntil", e."isRead", e.summary, e."isProcessingSummary",
      e.body, e."htmlBody",
      e."phishingConfidence", e."phishingReason",
      e."receivedAt", e.labels, e."to", e."cc", e."senderContactId",
      e."sentByAutoResponder",
      correspondent."from" as "correspondentEmail",
      correspondent."fromName" as "correspondentName",
      thread_labels."allThreadLabels"
    FROM email_threads thread
    CROSS JOIN LATERAL (
      SELECT em.id, em."userId", em."threadId", em."emailThreadId", em."messageId",
        em."from", em."fromName", em."senderJobTitle", em.subject,
        em."googleAccountId", em."office365AccountId", em."zohoAccountId",
        em."isSnoozed", em."snoozeUntil", em."isRead", em.summary, em."isProcessingSummary",
        em.body, em."htmlBody",
        em."phishingConfidence", em."phishingReason",
        em."receivedAt", em.labels, em."to", em."cc", em."senderContactId",
        em."sentByAutoResponder"
      FROM emails em
      WHERE em."emailThreadId" = thread.id AND em."userId" = $1
      ORDER BY em."receivedAt" DESC, em.id DESC LIMIT 1
    ) e
    -- correspondent: the most recent sender in the thread who isn't the user,
    -- so the list shows who last wrote (and the other party when the user replied last)
    LEFT JOIN LATERAL (
      SELECT cor."from", cor."fromName"
      FROM emails cor
      WHERE cor."emailThreadId" = thread.id AND cor."userId" = $1
        ${correspondentFilter}
      ORDER BY cor."receivedAt" DESC, cor.id DESC LIMIT 1
    ) correspondent ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(em.labels) AS "allThreadLabels" FROM emails em
      WHERE em."emailThreadId" = thread.id AND em.labels IS NOT NULL
    ) thread_labels ON true
    LEFT JOIN proto_categories pc ON pc.id = thread."protoCategoryId"
    LEFT JOIN user_contexts uc ON uc."contextId" = thread."categoryId"
    WHERE thread."userId" = $1 ${threadFilter} ${additionalFilters}
      AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
      AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
    ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC, thread."threadId" ASC
    LIMIT ${mode === INBOX_MODES.ACTION ? QUERY_LIMITS.INBOX_PROCESS_TOTAL : QUERY_LIMITS.INBOX_TOTAL}`,
    queryParams,
  ) as Promise<RawEmailRow[]>;
}
