import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { RATIOS } from "../constants/percentages";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { INBOX_MODES, QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { parseCategoryName } from "../utils/category-name.util";
import { computeEmailHmac } from "../utils/hmac-email";
import { EmailFollowUpService } from "./email-follow-up.service";
import {
  buildSummaryFiltersAndParams,
  buildThreadFilter,
  lookupCategoryIdByName,
  RawEmailRow,
  threadHasBlockedLabel,
} from "./email-inbox.types";
import {
  EmailInboxCategoryService,
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
} from "./email-inbox-category.service";
import { EmailInboxDecryptService } from "./email-inbox-decrypt.service";
import { runInboxQuery } from "./email-inbox-query.helpers";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

export { BLOCKED_MODE_THREAD_FILTER, RawEmailRow } from "./email-inbox.types";

/**
 * Handles inbox queries, filtering, summary, and decryption of raw query results.
 * Extracted from EmailsService (Phase 1 — lowest risk, read-only methods).
 *
 * Follow-up / action-mode filtering is delegated to EmailFollowUpService.
 * Category counting/filtering is delegated to EmailInboxCategoryService.
 * Decryption/label conversion is delegated to EmailInboxDecryptService.
 */
@Injectable()
export class EmailInboxService {
  private readonly logger = new Logger(EmailInboxService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private blockedSendersService: BlockedSendersService,
    private emailFollowUpService: EmailFollowUpService,
    private emailInboxCategoryService: EmailInboxCategoryService,
    private emailInboxDecryptService: EmailInboxDecryptService,
    @Optional() private cloudWatchService?: CloudWatchService,
  ) {}

  async getInboxSummary(
    userId: string,
    mode: "triage" | "action" | "follow-up" | "blocked" = "triage",
    filters?: {
      categoryIds?: string[];
      minPriority?: number;
      maxPriority?: number;
      includeThreadIds?: boolean;
      accountIds?: string[];
    },
  ): Promise<{
    total: number;
    categories: {
      id: string | null;
      name: string;
      count: number;
      threadIds?: string[];
    }[];
  }> {
    const threadFilter = buildThreadFilter(mode);
    const { additionalFilters, queryParams } = buildSummaryFiltersAndParams(
      userId,
      filters,
    );
    const needsUserSentLastFilter =
      mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP;

    const threadIdSelect = filters?.includeThreadIds
      ? ', thread."threadId"'
      : "";

    const rows = await this.querySummaryRows({
      userId,
      mode,
      threadFilter,
      additionalFilters,
      queryParams,
      threadIdSelect,
    });

    const userEmailLower =
      await this.emailInboxCategoryService.resolveUserEmailLower(
        userId,
        needsUserSentLastFilter,
      );
    const categoryNameToId = await this.getCategoryNameToIdMap(userId, true);
    await this.blockedSendersService.getBlockedEmailHashes(userId);

    const {
      categoryOrder,
      categoryCounts,
      categoryThreadIds,
      categoryUuidByName,
    } = await this.emailInboxCategoryService.countRowsByCategory({
      userId,
      mode,
      rows,
      includeThreadIds: filters?.includeThreadIds ?? false,
      needsUserSentLastFilter,
      userEmailLower,
    });

    const visibleCategories =
      this.emailInboxCategoryService.filterVisibleCategoriesByIds(
        userId,
        categoryOrder,
        categoryUuidByName,
        categoryNameToId,
        filters?.categoryIds,
      );

    if (visibleCategories === null) return { total: 0, categories: [] };

    const categories = visibleCategories.map((name) => ({
      id:
        name === INBOX_OTHER_CATEGORY_NAME
          ? null
          : (categoryUuidByName.get(name) ??
            lookupCategoryIdByName(name, categoryNameToId)),
      name,
      count: categoryCounts[name] || 0,
      ...(filters?.includeThreadIds
        ? { threadIds: categoryThreadIds[name] || [] }
        : {}),
    }));
    const total = categories.reduce((sum, cat) => sum + cat.count, 0);
    return { total, categories };
  }

  /**
   * Executes the raw SQL for getInboxSummary.
   *
   * Extracted to keep getInboxSummary under the max-lines-per-function limit.
   *
   * fix(#1554): both lateral subqueries use CROSS JOIN LATERAL with
   * em."userId" = $1 so that only the current user's emails are considered —
   * matching the behaviour of runInboxQuery() and preventing tab-count inflation
   * in action mode when threads contain emails from multiple users.
   */
  private async querySummaryRows(opts: {
    userId: string;
    mode: string;
    threadFilter: string;
    additionalFilters: string;
    queryParams: (string | number)[];
    threadIdSelect: string;
  }): Promise<
    {
      categoryName: string | null;
      categoryId: string | null;
      threadId?: string;
      latestFrom?: string;
      allLabels?: string[] | null;
      priorityScore?: number | null;
    }[]
  > {
    const {
      mode,
      threadFilter,
      additionalFilters,
      queryParams,
      threadIdSelect,
    } = opts;
    return this.emailThreadRepository.query(
      `SELECT thread."categoryId", uc."contextValue" AS "categoryName",
              latest_email."latestFrom",
              thread_labels."allLabels",
              thread."priorityScore"${threadIdSelect}
       FROM email_threads thread
       LEFT JOIN user_contexts uc
         ON uc."contextId" = thread."categoryId"
       CROSS JOIN LATERAL (
         SELECT em."from" AS "latestFrom" FROM emails em
         WHERE em."emailThreadId" = thread.id AND em."userId" = $1
         ORDER BY em."receivedAt" DESC, em.id DESC LIMIT 1
       ) latest_email
       LEFT JOIN LATERAL (
         SELECT array_agg(em.labels) AS "allLabels" FROM emails em
         WHERE em."emailThreadId" = thread.id AND em."userId" = $1 AND em.labels IS NOT NULL
       ) thread_labels ON true
       WHERE thread."userId" = $1 ${threadFilter} ${additionalFilters}
         AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
         AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
       ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC
       ${mode === INBOX_MODES.BLOCKED ? "LIMIT 200" : ""}`,
      queryParams,
    ) as Promise<
      {
        categoryName: string | null;
        categoryId: string | null;
        threadId?: string;
        latestFrom?: string;
        allLabels?: string[] | null;
        priorityScore?: number | null;
      }[]
    >;
  }

  async getInbox(options: {
    userId: string;
    includeBatched?: boolean;
    mode?: "triage" | "action" | "follow-up" | "blocked";
    filters?: {
      accountIds?: string[];
      categoryIds?: string[];
      minPriority?: number;
      maxPriority?: number;
      /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
      assigneeId?: string;
    };
    pagination?: { offset?: number; limit?: number };
    fixStuckCalculatingThreads?: (userId: string) => Promise<unknown>;
  }): Promise<{ emails: Email[]; total: number; hasMore: boolean }> {
    const {
      userId,
      mode = "triage",
      filters,
      pagination,
      fixStuckCalculatingThreads,
    } = options;
    const perf = new PerformanceTracker(
      `getInbox(${mode})`,
      this.cloudWatchService,
    );

    await this.blockedSendersService.getBlockedEmailHashes(userId);
    if (Math.random() < RATIOS.SMALL && fixStuckCalculatingThreads) {
      fixStuckCalculatingThreads(userId).catch((err) =>
        this.logger.error("Error auto-fixing stuck calculating threads:", err),
      );
    }

    const budgetBase =
      mode === INBOX_MODES.ACTION
        ? PERFORMANCE_BUDGETS.THREAD_QUERY_PROCESS
        : PERFORMANCE_BUDGETS.THREAD_QUERY;
    const endCombined = perf.startSpan(
      "combined_query",
      budgetBase + PERFORMANCE_BUDGETS.EMAIL_QUERY,
    );
    const rawEmails = await this.runInboxQuery(userId, mode, filters);
    endCombined();

    if (rawEmails.length === 0) {
      perf.finish(mode);
      return { emails: [], total: 0, hasMore: false };
    }
    this.logger.debug(`Found ${rawEmails.length} threads for mode=${mode}`);

    // Filter blocked-mode threads using raw (encrypted) label data before decryption.
    // This keeps encrypted ciphertext strictly server-side — it is never copied into
    // the InboxEmail response type.
    const filteredRawEmails =
      mode === INBOX_MODES.BLOCKED
        ? rawEmails.filter((row) => threadHasBlockedLabel(row.allThreadLabels))
        : rawEmails;

    const endDecrypt = perf.startSpan(
      "decryption",
      PERFORMANCE_BUDGETS.DECRYPTION,
    );
    const threadRepresentatives: InboxEmail[] = filteredRawEmails.map(
      (row: RawEmailRow) =>
        this.emailInboxDecryptService.decryptRawEmailRow(row),
    );
    endDecrypt();

    const maxResults =
      mode === INBOX_MODES.ACTION
        ? QUERY_LIMITS.INBOX_PROCESS_TOTAL
        : QUERY_LIMITS.INBOX_TOTAL;
    const { emails: filteredEmails, blockedCount } =
      await this.applyPostQueryFilters(
        userId,
        mode,
        threadRepresentatives,
        perf,
        filters,
      );

    this.emailInboxDecryptService
      .convertEmailLabels(userId, filteredEmails)
      .catch((err) => this.logger.error("Error converting labels:", err));

    const allFiltered = filteredEmails.slice(0, maxResults);
    const total = allFiltered.length;
    const qOffset = pagination?.offset ?? 0;
    const qLimit = pagination?.limit ?? total;
    const finalEmails = allFiltered.slice(qOffset, qOffset + qLimit);
    const hasMore = qOffset + finalEmails.length < total;

    this.emailInboxDecryptService.assignCategoryIds(finalEmails);

    this.logger.log(
      `getInbox(${mode}): Returning ${finalEmails.length}/${total} threads (from ${rawEmails.length} matching, ${blockedCount} blocked)`,
    );
    perf.finish(mode);
    return { emails: finalEmails, total, hasMore };
  }

  async getCategoryNameToIdMap(
    userId: string,
    deduplicateWithWarning = false,
  ): Promise<Map<string, string>> {
    const ctxs = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
        contextValue: true,
        createdAt: true,
      },
    });
    for (const ctx of ctxs) {
      decryptUserContextEntityForApi(ctx);
    }
    if (!deduplicateWithWarning) {
      const map = new Map<string, string>();
      for (const ctx of ctxs)
        map.set(parseCategoryName(ctx.contextValue), ctx.contextId);
      return map;
    }
    // Fix #1258: deduplicate — keep oldest UUID as canonical.
    const byName = new Map<string, UserContext[]>();
    for (const ctx of ctxs) {
      const categoryName = parseCategoryName(ctx.contextValue);
      const existing = byName.get(categoryName) ?? [];
      existing.push(ctx);
      byName.set(categoryName, existing);
    }
    const result = new Map<string, string>();
    for (const [name, contexts] of byName.entries()) {
      if (contexts.length > 1) {
        contexts.sort(
          (ctxA, ctxB) => ctxA.createdAt.getTime() - ctxB.createdAt.getTime(),
        );
        this.logger.warn(
          `Duplicate category "${name}" for user ${userId}: ` +
            `${contexts.length} entries. Using oldest UUID.`,
        );
      }
      result.set(name, contexts[0].contextId);
    }
    return result;
  }

  async runInboxQuery(
    userId: string,
    mode: string,
    filters?: {
      accountIds?: string[];
      minPriority?: number;
      maxPriority?: number;
      /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
      assigneeId?: string;
    },
  ): Promise<RawEmailRow[]> {
    const userEmailLower =
      await this.emailInboxCategoryService.resolveUserEmailLower(userId, true);
    const userEmailHmac = userEmailLower
      ? computeEmailHmac(userEmailLower)
      : undefined;
    return runInboxQuery(
      this.emailRepository,
      userId,
      mode,
      filters,
      userEmailHmac,
    );
  }

  async applyPostQueryFilters(
    userId: string,
    mode: string,
    emails: InboxEmail[],
    perf: PerformanceTracker,
    filters?: {
      accountIds?: string[];
      categoryIds?: string[];
      minPriority?: number;
      maxPriority?: number;
    },
  ): Promise<{ emails: InboxEmail[]; blockedCount: number }> {
    const endBlockedFilter = perf.startSpan(
      "blocked_filter",
      QUERY_LIMITS.MAX_RESULTS_DEFAULT,
    );
    // Blocked-mode thread filtering (by encrypted label) is applied upstream on raw
    // rows before decryption. Here we only need to filter by blocked senders for
    // non-blocked modes.
    const blockedEmailIds =
      mode === INBOX_MODES.BLOCKED
        ? []
        : await this.blockedSendersService.filterBlockedEmails(
            userId,
            emails.map((emailItem) => ({
              id: emailItem.id,
              from: emailItem.from,
            })),
          );
    const blockedSet = new Set(blockedEmailIds);
    let filteredEmails = emails.filter(
      (emailItem) => !blockedSet.has(emailItem.id),
    );
    endBlockedFilter();

    if (blockedEmailIds.length > 0)
      this.logger.debug(
        `Filtered ${blockedEmailIds.length} emails from blocked senders`,
      );

    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      // Client sends "uncategorized" for the null-category bucket; treat as synonym for "Other".
      const requestedOther =
        filters.categoryIds.includes(INBOX_OTHER_CATEGORY_NAME) ||
        filters.categoryIds.includes(INBOX_UNCATEGORIZED_CATEGORY_KEY);
      const realIds = filters.categoryIds.filter(
        (id) =>
          id !== INBOX_OTHER_CATEGORY_NAME &&
          id !== INBOX_UNCATEGORIZED_CATEGORY_KEY,
      );
      const requestedUuids = new Set(realIds);
      const ctxs = await this.userContextRepository.find({
        where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
        select: {
          contextId: true,
          contextValue: true,
        },
      });
      for (const ctx of ctxs) {
        decryptUserContextEntityForApi(ctx);
      }
      const idToName = new Map<string, string>();
      for (const ctx of ctxs)
        idToName.set(ctx.contextId, parseCategoryName(ctx.contextValue));
      const requestedNames = new Set(
        realIds
          .map((id) => idToName.get(id))
          .filter((name): name is string => name !== undefined),
      );

      if (realIds.length > 0 && requestedNames.size === 0) {
        this.logger.warn(
          `Category filter: none of the requested UUIDs resolved to a known category (userId=${userId})`,
        );
        return { emails: [], blockedCount: 0 };
      }

      const before = filteredEmails.length;
      filteredEmails = filteredEmails.filter((emailEntry) => {
        // categoryId is the single source of truth (fixes #1293).
        // NULL categoryId → "Other" bucket.
        // Defense-in-depth for #1404: also catch orphaned-UUID threads where
        // decryptRawEmailRow already resolved category to INBOX_OTHER_CATEGORY_NAME.
        const isOtherThread =
          !emailEntry.categoryId ||
          emailEntry.category === INBOX_OTHER_CATEGORY_NAME;
        if (requestedOther && isOtherThread) return true;
        if (emailEntry.categoryId && !isOtherThread)
          return requestedUuids.has(emailEntry.categoryId);
        return false;
      });
      const removed = before - filteredEmails.length;
      if (removed > 0)
        this.logger.debug(
          `Category filter: Removed ${removed} emails not matching category UUIDs: ${filters.categoryIds.join(", ")}`,
        );
    }

    if (mode === INBOX_MODES.ACTION)
      filteredEmails = await this.emailFollowUpService.filterActionModeEmails(
        userId,
        filteredEmails,
        perf,
      );
    if (mode === INBOX_MODES.FOLLOW_UP)
      filteredEmails = await this.emailFollowUpService.filterFollowUpModeEmails(
        userId,
        filteredEmails,
        perf,
      );

    return { emails: filteredEmails, blockedCount: blockedEmailIds.length };
  }

  /** Expose decrypt for consumers that receive raw query rows (e.g. email-debug). */
  decryptRawEmailRow(row: RawEmailRow): InboxEmail {
    return this.emailInboxDecryptService.decryptRawEmailRow(row);
  }
}
