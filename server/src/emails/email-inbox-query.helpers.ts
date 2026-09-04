/* istanbul ignore file */
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import {
  buildThreadFilter,
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
  RawEmailRow,
} from "./email-inbox.types";
import {
  appendInboxScopeFilters,
  buildUserCategoryJoinSql,
  INBOX_SCOPE_ORDER_BY_SQL,
  INBOX_SCOPE_VISIBILITY_SQL,
  inboxRowLimit,
  InboxScopeFilters,
} from "./email-inbox-scope.helpers";

type InboxQueryFilters = InboxScopeFilters & {
  /**
   * Category keys (UUIDs) to narrow the query to. When present and containing
   * ONLY real UUIDs, the narrowing is pushed into SQL so a single-category fetch
   * only queries/decrypts that category's threads instead of the whole inbox.
   * The "Other"/uncategorized bucket is intentionally NOT narrowed here — its
   * membership depends on encrypted category-name resolution and orphaned-UUID
   * handling that only applyPostQueryFilters can resolve correctly.
   */
  categoryIds?: string[];
};

/**
 * Returns the requested category UUIDs only when the request targets real
 * categories exclusively (no "Other"/uncategorized sentinel). Returns null when
 * the request includes the Other bucket or resolves to no real UUIDs, signalling
 * that SQL narrowing must be skipped and the post-query filter left to decide.
 */
function realCategoryUuidsForNarrowing(
  categoryIds: string[] | undefined,
): string[] | null {
  if (!categoryIds || categoryIds.length === 0) {
    return null;
  }
  const includesOther = categoryIds.some(
    (id) =>
      id === INBOX_OTHER_CATEGORY_NAME ||
      id === INBOX_UNCATEGORIZED_CATEGORY_KEY,
  );
  if (includesOther) {
    return null;
  }
  return categoryIds;
}

function appendInboxAdditionalFilters(
  filters: InboxQueryFilters | undefined,
  paramIndex: number,
  queryParams: (string | number)[],
): { additionalFilters: string; paramIndex: number } {
  // Shared scope first (same order as the summary) so bound params line up.
  const scoped = appendInboxScopeFilters(filters, paramIndex, queryParams, "e");
  let { additionalFilters } = scoped;
  let idx = scoped.paramIndex;

  const narrowingUuids = realCategoryUuidsForNarrowing(filters?.categoryIds);
  if (narrowingUuids) {
    const placeholders = narrowingUuids.map(() => `$${idx++}`).join(", ");
    additionalFilters += ` AND thread."categoryId" IN (${placeholders})`;
    queryParams.push(...narrowingUuids);
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
          thread."keepInAction",
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
    ${buildUserCategoryJoinSql("$1")}
    WHERE thread."userId" = $1 ${threadFilter} ${additionalFilters}
      ${INBOX_SCOPE_VISIBILITY_SQL}
    ${INBOX_SCOPE_ORDER_BY_SQL}
    LIMIT ${inboxRowLimit(mode)}`,
    queryParams,
  ) as Promise<RawEmailRow[]>;
}
