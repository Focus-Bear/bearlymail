import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
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
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import {
  BLOCKED_MODE_THREAD_FILTER,
  lookupCategoryIdByName,
  RawEmailRow,
  SYSTEM_LABELS,
} from "./email-inbox.types";
import { EmailProviderManager } from "./email-provider-manager.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

export { BLOCKED_MODE_THREAD_FILTER, RawEmailRow } from "./email-inbox.types";

/** Key the client sends for the null-category (uncategorized) bucket. */
const UNCATEGORIZED_CATEGORY_KEY = "uncategorized";

/** Display name used for the null-category (uncategorized) bucket. */
const OTHER_CATEGORY_NAME = "Other";

/**
 * Handles inbox queries, filtering, summary, and decryption of raw query results.
 * Extracted from EmailsService (Phase 1 — lowest risk, read-only methods).
 *
 * Follow-up / action-mode filtering is delegated to EmailFollowUpService.
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
    private usersService: UsersService,
    private emailFollowUpService: EmailFollowUpService,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
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
    const threadFilter = this.buildThreadFilter(mode);
    const { additionalFilters, queryParams } =
      this.buildSummaryFiltersAndParams(userId, filters);
    const needsUserSentLastFilter =
      mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP;

    const threadIdSelect = filters?.includeThreadIds
      ? ', thread."threadId"'
      : "";

    const rows = (await this.emailThreadRepository.query(
      `SELECT thread."categoryId", uc."contextValue" AS "categoryName",
              latest_email."latestFrom"${threadIdSelect}
       FROM email_threads thread
       LEFT JOIN user_contexts uc
         ON uc."contextId" = thread."categoryId"
       LEFT JOIN LATERAL (
         SELECT em."from" AS "latestFrom" FROM emails em
         WHERE em."emailThreadId" = thread.id ORDER BY em."receivedAt" DESC LIMIT 1
       ) latest_email ON true
       WHERE thread."userId" = $1 ${threadFilter} ${additionalFilters}
         AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
         AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
       ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC`,
      queryParams,
    )) as {
      categoryName: string | null;
      categoryId: string | null;
      threadId?: string;
      latestFrom?: string;
    }[];

    const userEmailLower = await this.resolveUserEmailLower(
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
    } = await this.countRowsByCategory(
      userId,
      mode,
      rows,
      filters?.includeThreadIds ?? false,
      needsUserSentLastFilter,
      userEmailLower,
    );

    const visibleCategories = await this.filterVisibleCategoriesByIds(
      userId,
      categoryOrder,
      categoryUuidByName,
      categoryNameToId,
      filters?.categoryIds,
    );

    if (visibleCategories === null) return { total: 0, categories: [] };

    const categories = visibleCategories.map((name) => ({
      id:
        categoryUuidByName.get(name) ??
        lookupCategoryIdByName(name, categoryNameToId),
      name,
      count: categoryCounts[name] || 0,
      ...(filters?.includeThreadIds
        ? { threadIds: categoryThreadIds[name] || [] }
        : {}),
    }));
    const total = categories.reduce((sum, cat) => sum + cat.count, 0);
    return { total, categories };
  }

  private buildSummaryFiltersAndParams(
    userId: string,
    filters?: {
      minPriority?: number;
      maxPriority?: number;
      accountIds?: string[];
    },
  ): { additionalFilters: string; queryParams: unknown[] } {
    const queryParams: unknown[] = [userId];
    let additionalFilters = "";
    let paramIndex = 2;

    if (filters?.minPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${paramIndex++}`;
      queryParams.push(filters.minPriority);
    }
    if (filters?.maxPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) < $${paramIndex++}`;
      queryParams.push(filters.maxPriority);
    }
    if (filters?.accountIds && filters.accountIds.length > 0) {
      const phGoogle = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      const phOffice = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      const phZoho = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      additionalFilters += ` AND EXISTS (
        SELECT 1 FROM emails acctFilter WHERE acctFilter."emailThreadId" = thread.id
          AND (acctFilter."googleAccountId" IN (${phGoogle}) OR acctFilter."office365AccountId" IN (${phOffice}) OR acctFilter."zohoAccountId" IN (${phZoho}))
      )`;
      queryParams.push(
        ...filters.accountIds,
        ...filters.accountIds,
        ...filters.accountIds,
      );
    }
    return { additionalFilters, queryParams };
  }

  private async resolveUserEmailLower(
    userId: string,
    needsFilter: boolean,
  ): Promise<string | null> {
    if (!needsFilter) return null;
    try {
      const user = await this.usersService.findOne(userId);
      if (user)
        return EncryptionHelper.decrypt(user.email)?.toLowerCase() || null;
    } catch (error) {
      this.logger.warn(
        "Failed to get user email for summary sent-last filter:",
        error,
      );
    }
    return null;
  }

  private async shouldSkipSummaryRow(
    userId: string,
    mode: string,
    row: { latestFrom?: string },
    needsUserSentLastFilter: boolean,
    userEmailLower: string | null,
  ): Promise<boolean> {
    if (mode !== INBOX_MODES.BLOCKED && row.latestFrom) {
      let fromEmail = "";
      try {
        fromEmail = EncryptionHelper.decrypt(row.latestFrom) || "";
      } catch {
        /* include on error */
      }
      if (
        fromEmail &&
        (await this.blockedSendersService.isSenderBlocked(userId, fromEmail))
      )
        return true;
    }
    if (needsUserSentLastFilter && userEmailLower && row.latestFrom) {
      try {
        const fromLower =
          EncryptionHelper.decrypt(row.latestFrom)?.toLowerCase() || "";
        const userSentLast = fromLower.includes(userEmailLower);
        if (mode === INBOX_MODES.ACTION && userSentLast) return true;
        if (mode === INBOX_MODES.FOLLOW_UP && !userSentLast) return true;
      } catch {
        /* include on error */
      }
    }
    return false;
  }

  private async countRowsByCategory(
    userId: string,
    mode: string,
    rows: {
      categoryName: string | null;
      categoryId: string | null;
      threadId?: string;
      latestFrom?: string;
    }[],
    includeThreadIds: boolean,
    needsUserSentLastFilter: boolean,
    userEmailLower: string | null,
  ): Promise<{
    categoryOrder: string[];
    categoryCounts: Record<string, number>;
    categoryThreadIds: Record<string, string[]>;
    categoryUuidByName: Map<string, string>;
  }> {
    const categoryOrder: string[] = [];
    const categoryCounts: Record<string, number> = {};
    const categoryThreadIds: Record<string, string[]> = {};
    const categoryUuidByName = new Map<string, string>();

    for (const row of rows) {
      if (
        await this.shouldSkipSummaryRow(
          userId,
          mode,
          row,
          needsUserSentLastFilter,
          userEmailLower,
        )
      )
        continue;

      // categoryName comes from a raw SQL query — TypeORM's encryptedColumnTransformer does NOT
      // run for raw .query() results, so contextValue is returned as encrypted ciphertext.
      // Decrypt it here before use. NULL categoryId → "Other" bucket.
      // EncryptionHelper.decrypt() has internal error handling and returns the original string
      // on failure — it never throws, so no try/catch is needed.
      const decryptedCategoryName = row.categoryName
        ? EncryptionHelper.decrypt(row.categoryName)
        : null;
      const category = row.categoryId
        ? (decryptedCategoryName?.split(" - ")[0].trim() ?? OTHER_CATEGORY_NAME)
        : OTHER_CATEGORY_NAME;
      if (!categoryOrder.includes(category)) {
        categoryOrder.push(category);
        categoryThreadIds[category] = [];
      }
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (row.threadId && includeThreadIds)
        categoryThreadIds[category].push(row.threadId);
      if (row.categoryId && !categoryUuidByName.has(category))
        categoryUuidByName.set(category, row.categoryId);
    }

    return {
      categoryOrder,
      categoryCounts,
      categoryThreadIds,
      categoryUuidByName,
    };
  }

  private async filterVisibleCategoriesByIds(
    userId: string,
    categoryOrder: string[],
    categoryUuidByName: Map<string, string>,
    categoryNameToId: Map<string, string>,
    categoryIds?: string[],
  ): Promise<string[] | null> {
    if (!categoryIds || categoryIds.length === 0) return categoryOrder;

    // Client sends "uncategorized" for the null-category bucket; treat as synonym for "Other".
    const requestedOther =
      categoryIds.includes(OTHER_CATEGORY_NAME) ||
      categoryIds.includes(UNCATEGORIZED_CATEGORY_KEY);
    const realIds = categoryIds.filter(
      (id) => id !== OTHER_CATEGORY_NAME && id !== UNCATEGORIZED_CATEGORY_KEY,
    );
    const requestedUuids = new Set(realIds);
    const idToName = new Map<string, string>();
    categoryNameToId.forEach((id, name) => idToName.set(id, name));
    const namesFromIds = new Set(
      realIds
        .map((id) => idToName.get(id))
        .filter((name): name is string => name !== undefined),
    );

    if (realIds.length > 0 && namesFromIds.size === 0) {
      this.logger.warn(
        `getInboxSummary: none of the requested UUIDs resolved to a known category (userId=${userId})`,
      );
      return null;
    }

    return categoryOrder.filter((cat) => {
      if (requestedOther && cat === OTHER_CATEGORY_NAME) return true;
      const uuid = categoryUuidByName.get(cat);
      if (uuid) return requestedUuids.has(uuid);
      return namesFromIds.has(cat);
    });
  }

  async getInbox(
    userId: string,
    _includeBatched: boolean = false,
    mode: "triage" | "action" | "follow-up" | "blocked" = "triage",
    filters?: {
      accountIds?: string[];
      categoryIds?: string[];
      minPriority?: number;
      maxPriority?: number;
    },
    pagination?: { offset?: number; limit?: number },
    fixStuckCalculatingThreads?: (userId: string) => Promise<unknown>,
  ): Promise<{ emails: Email[]; total: number; hasMore: boolean }> {
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

    const endDecrypt = perf.startSpan(
      "decryption",
      PERFORMANCE_BUDGETS.DECRYPTION,
    );
    const threadRepresentatives: InboxEmail[] = rawEmails.map(
      (row: RawEmailRow) => this.decryptRawEmailRow(row),
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

    this.convertEmailLabels(userId, filteredEmails).catch((err) =>
      this.logger.error("Error converting labels:", err),
    );

    const allFiltered = filteredEmails.slice(0, maxResults);
    const total = allFiltered.length;
    const qOffset = pagination?.offset ?? 0;
    const qLimit = pagination?.limit ?? total;
    const finalEmails = allFiltered.slice(qOffset, qOffset + qLimit);
    const hasMore = qOffset + finalEmails.length < total;

    this.assignCategoryIds(finalEmails);

    this.logger.log(
      `getInbox(${mode}): Returning ${finalEmails.length}/${total} threads (from ${rawEmails.length} matching, ${blockedCount} blocked)`,
    );
    perf.finish(mode);
    return { emails: finalEmails, total, hasMore };
  }

  private assignCategoryIds(emails: InboxEmail[]): void {
    // categoryId is already the UUID from the JOIN in runInboxQuery.
    // Propagate it to category_id for client compatibility.
    for (const email of emails) {
      const em = email as InboxEmail & { category_id?: string | null };
      em.category_id = em.categoryId ?? null;
    }
  }

  async getCategoryNameToIdMap(
    userId: string,
    deduplicateWithWarning = false,
  ): Promise<Map<string, string>> {
    const ctxs = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: ["contextId", "contextValue", "createdAt"],
    });
    if (!deduplicateWithWarning) {
      const map = new Map<string, string>();
      for (const ctx of ctxs)
        map.set(ctx.contextValue.split(" - ")[0].trim(), ctx.contextId);
      return map;
    }
    // Fix #1258: deduplicate — keep oldest UUID as canonical.
    const byName = new Map<string, UserContext[]>();
    for (const ctx of ctxs) {
      const categoryName = ctx.contextValue.split(" - ")[0].trim();
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
    },
  ): Promise<RawEmailRow[]> {
    const threadFilter = this.buildThreadFilter(mode);
    const queryParams: (string | number)[] = [userId];
    let additionalFilters = "";
    let paramIndex = 2;

    if (filters?.accountIds && filters.accountIds.length > 0) {
      const phGoogle = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      const phOffice = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      const phZoho = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      additionalFilters += ` AND (e."googleAccountId" IN (${phGoogle}) OR e."office365AccountId" IN (${phOffice}) OR e."zohoAccountId" IN (${phZoho}))`;
      queryParams.push(
        ...filters.accountIds,
        ...filters.accountIds,
        ...filters.accountIds,
      );
    }
    if (filters?.minPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${paramIndex++}`;
      queryParams.push(filters.minPriority);
    }
    if (filters?.maxPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) < $${paramIndex++}`;
      queryParams.push(filters.maxPriority);
    }

    return this.emailRepository.query(
      `SELECT
            thread."starCount", thread."isArchived", thread."urgencyScore",
            thread."priorityExplanation", thread."priorityScore", thread."isProcessingPriority",
            thread."githubMetadata", thread."categoryExplanation",
            thread."protoCategoryId", thread."categoryId",
            uc."contextValue" AS "categoryName",
            thread."updatedAt" as "threadUpdatedAt",
            thread."isBatched", thread."batchReleaseAt", thread."wasDeliveredEarly",
            thread."batchDecisionReason",
            pc."name" as "protoCategoryName", pc."description" as "protoCategoryDescription",
        e.id, e."userId", e."threadId", e."emailThreadId", e."messageId",
        e."googleAccountId", e."office365AccountId", e."zohoAccountId",
        e."from", e."fromName", e."senderJobTitle", e.subject,
        e."isSnoozed", e."snoozeUntil", e."isRead", e.summary, e."isProcessingSummary",
        e."phishingConfidence", e."phishingReason",
        e."receivedAt", e.labels, e."cc", e."senderContactId",
        correspondent."from" as "correspondentEmail",
        correspondent."fromName" as "correspondentName"
      FROM email_threads thread
      CROSS JOIN LATERAL (
        SELECT em.id, em."userId", em."threadId", em."emailThreadId", em."messageId",
          em."from", em."fromName", em."senderJobTitle", em.subject,
          em."googleAccountId", em."office365AccountId", em."zohoAccountId",
          em."isSnoozed", em."snoozeUntil", em."isRead", em.summary, em."isProcessingSummary",
          em."phishingConfidence", em."phishingReason",
          em."receivedAt", em.labels, em."cc", em."senderContactId"
        FROM emails em
        WHERE em."emailThreadId" = thread.id AND em."userId" = $1
        ORDER BY em."receivedAt" DESC, em.id DESC LIMIT 1
      ) e
      LEFT JOIN LATERAL (
        SELECT cor."from", cor."fromName"
        FROM emails cor JOIN users u ON u.id = $1
        WHERE cor."emailThreadId" = thread.id AND cor."userId" = $1
          AND LOWER(cor."from") != LOWER(u.email)
        ORDER BY cor."receivedAt" ASC LIMIT 1
      ) correspondent ON true
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
    let filteredEmails =
      mode === INBOX_MODES.BLOCKED
        ? emails
        : emails.filter((emailItem) => !blockedSet.has(emailItem.id));
    endBlockedFilter();

    if (blockedEmailIds.length > 0)
      this.logger.debug(
        `Filtered ${blockedEmailIds.length} emails from blocked senders`,
      );

    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      // Client sends "uncategorized" for the null-category bucket; treat as synonym for "Other".
      const requestedOther =
        filters.categoryIds.includes(OTHER_CATEGORY_NAME) ||
        filters.categoryIds.includes(UNCATEGORIZED_CATEGORY_KEY);
      const realIds = filters.categoryIds.filter(
        (id) => id !== OTHER_CATEGORY_NAME && id !== UNCATEGORIZED_CATEGORY_KEY,
      );
      const requestedUuids = new Set(realIds);
      const ctxs = await this.userContextRepository.find({
        where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
        select: ["contextId", "contextValue"],
      });
      const idToName = new Map<string, string>();
      for (const ctx of ctxs)
        idToName.set(ctx.contextId, ctx.contextValue.split(" - ")[0].trim());
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
        if (requestedOther && !emailEntry.categoryId) return true;
        if (emailEntry.categoryId)
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

  decryptRawEmailRow(row: RawEmailRow): InboxEmail {
    const labels = this.decryptEmailLabels(row);
    const priorityExplanation = this.decryptEncryptedJsonField<
      Record<string, unknown>
    >(
      row.priorityExplanation,
      `priorityExplanation for thread ${row.emailThreadId}`,
    );
    const githubMetadata = this.decryptEncryptedJsonField<unknown>(
      row.githubMetadata as string | undefined,
      `githubMetadata for thread ${row.emailThreadId}`,
    );
    return {
      id: row.id,
      userId: row.userId,
      threadId: row.threadId,
      emailThreadId: row.emailThreadId,
      messageId: row.messageId,
      googleAccountId: row.googleAccountId,
      office365AccountId: row.office365AccountId,
      zohoAccountId: row.zohoAccountId,
      from: EncryptionHelper.decrypt(row.from),
      fromName: EncryptionHelper.decrypt(row.fromName),
      senderJobTitle: EncryptionHelper.decrypt(row.senderJobTitle),
      subject: EncryptionHelper.decrypt(row.subject),
      priorityExplanation,
      isSnoozed: row.isSnoozed,
      snoozeUntil: row.snoozeUntil,
      isBatched: row.isBatched,
      batchReleaseAt: row.batchReleaseAt,
      wasDeliveredEarly: row.wasDeliveredEarly,
      batchDecisionReason: row.batchDecisionReason,
      isRead: row.isRead,
      summary: EncryptionHelper.decrypt(row.summary),
      isProcessingPriority: row.isProcessingPriority,
      isProcessingSummary: row.isProcessingSummary,
      receivedAt: row.receivedAt,
      labels: labels || [],
      starCount: row.starCount,
      isArchived: row.isArchived,
      urgencyScore: row.urgencyScore,
      githubMetadata,
      threadUpdatedAt: row.threadUpdatedAt,
      // categoryName from raw SQL is encrypted ciphertext — decrypt before use.
      // EncryptionHelper.decrypt() has internal error handling; it never throws.
      category: row.categoryName
        ? (EncryptionHelper.decrypt(row.categoryName)?.split(" - ")[0].trim() ??
          OTHER_CATEGORY_NAME)
        : OTHER_CATEGORY_NAME,
      categoryExplanation: row.categoryExplanation
        ? EncryptionHelper.decrypt(row.categoryExplanation)
        : null,
      protoCategoryName: row.protoCategoryName
        ? EncryptionHelper.decrypt(row.protoCategoryName)
        : null,
      protoCategoryDescription: row.protoCategoryDescription
        ? EncryptionHelper.decrypt(row.protoCategoryDescription)
        : null,
      correspondentEmail: row.correspondentEmail
        ? EncryptionHelper.decrypt(row.correspondentEmail)
        : null,
      correspondentName: row.correspondentName
        ? EncryptionHelper.decrypt(row.correspondentName)
        : null,
      phishingConfidence: row.phishingConfidence,
      phishingReason: row.phishingReason,
      priorityScore: row.priorityScore ?? null,
      categoryId: row.categoryId,
      cc: row.cc ? EncryptionHelper.decrypt(row.cc) : null,
    } as InboxEmail;
  }

  private decryptEmailLabels(row: RawEmailRow): string[] {
    if (!row.labels) return [];
    try {
      const decrypted = EncryptionHelper.decrypt(row.labels);
      if (!decrypted) return [];
      const parsed = JSON.parse(decrypted);
      return Array.from(
        new Set(parsed.filter((label: string) => !SYSTEM_LABELS.has(label))),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to decrypt/parse labels for email ${row.id}:`,
        error,
      );
      return [];
    }
  }

  private decryptEncryptedJsonField<T>(
    encrypted: string | undefined,
    fieldDesc: string,
  ): T | null {
    if (!encrypted) return null;
    try {
      const decrypted = EncryptionHelper.decrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch {
      this.logger.warn(`Failed to decrypt/parse ${fieldDesc}`);
      return null;
    }
  }

  private async convertEmailLabels(
    userId: string,
    emails: InboxEmail[],
  ): Promise<void> {
    const allLabelIds = new Set<string>();
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels))
        email.labels.forEach((id) => allLabelIds.add(id));
    }
    if (allLabelIds.size === 0) return;

    const labelNames = await this.emailProviderManager.convertLabelIdsToNames(
      userId,
      Array.from(allLabelIds),
    );
    const labelIdToName = new Map<string, string>();
    Array.from(allLabelIds).forEach((id, index) => {
      if (labelNames[index]) labelIdToName.set(id, labelNames[index]);
    });

    for (const email of emails) {
      if (!email.labels || !Array.isArray(email.labels)) continue;
      const converted = email.labels
        .map((idOrName) => {
          if (SYSTEM_LABELS.has(idOrName)) return null;
          if (labelIdToName.has(idOrName)) {
            const name = labelIdToName.get(idOrName)!;
            return SYSTEM_LABELS.has(name) ? null : name;
          }
          if (idOrName.startsWith("Label_") || idOrName.startsWith("label_"))
            return null;
          return idOrName;
        })
        .filter((label): label is string => label !== null);

      const unique = Array.from(new Set(converted));
      if (JSON.stringify(unique) !== JSON.stringify(email.labels)) {
        this.logger.debug(
          `[EmailInboxService] Updating labels for email ${email.id}`,
        );
        email.labels = unique;
        this.emailRepository
          .update(email.id, { labels: unique })
          .catch((err) =>
            this.logger.warn(
              `Failed to update labels for email ${email.id}`,
              err,
            ),
          );
      }
    }
  }

  private buildThreadFilter(mode: string): string {
    if (mode === INBOX_MODES.TRIAGE)
      return 'AND thread."isArchived" = false AND thread."starCount" = 0';
    if (mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP)
      return 'AND thread."isArchived" = false AND thread."starCount" > 0';
    if (mode === INBOX_MODES.BLOCKED) return BLOCKED_MODE_THREAD_FILTER;
    return 'AND thread."isArchived" = false';
  }
}
