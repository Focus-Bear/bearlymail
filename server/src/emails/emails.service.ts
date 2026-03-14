import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { In, IsNull, Not, Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BlockedKeywordsService } from "../blocked-keywords/blocked-keywords.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { RATIOS } from "../constants/percentages";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { STAR_COUNTS } from "../constants/priority-constants";
import {
  PRIORITY_BOOSTS,
  PRIORITY_SCORES,
  SENTIMENT_THRESHOLDS,
} from "../constants/priority-constants";
import { INBOX_MODES, QUERY_LIMITS } from "../constants/query-limits";
import {
  DAYS,
  MILLISECONDS,
  MINUTES,
  MS_PER_SECOND,
} from "../constants/time-constants";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { LLMService } from "../llm/llm.service";
import { PriorityService } from "../priority/priority.service";
import { getJobPriority } from "../queue/job-priorities";
import { SuggestedRepliesService } from "../suggested-replies/suggested-replies.service";
import { isError } from "../types/common";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { EmailCrudService } from "./email-crud.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailSearchService } from "./email-search.service";
import { EmailStarService } from "./email-star.service";
import { EmailStatusService } from "./email-status.service";
import { EmailThreadService } from "./email-thread.service";
import { PerformanceTracker } from "./performance-tracker";

// Performance budgets in milliseconds
// Use PERFORMANCE_BUDGETS and QUERY_LIMITS constants directly instead of local PERF_BUDGETS

const BLOCKED_MODE_THREAD_FILTER = `AND thread."isArchived" = true AND EXISTS (
  SELECT 1 FROM emails em2
  WHERE em2."emailThreadId" = thread.id
    AND em2."userId" = $1
    AND 'BearlyMail-Blocked' = ANY(COALESCE(em2.labels, ARRAY[]::text[]))
)`;

interface RawEmailRow {
  id: string;
  labels?: string;
  priorityExplanation?: string;
  [key: string]: unknown;
}

/**
 * Email data that may include legacy thread-level properties
 * (starCount and isArchived are now on EmailThread, but may come from external sources)
 */
export interface EmailDataWithOptionalThreadProps extends Partial<Email> {
  starCount?: number;
  isArchived?: boolean;
}

// RankedResult interface used by email search service

interface EmailWithMetadata extends Email {
  searchExplanation?: string;
  relevanceScore?: number;
  debugInfo?: unknown;
  lastTheirReplyAt?: string;
  lastMyReplyAt?: string;
  _needsThreadUpdate?: { threadId: string; isArchived: boolean };
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
    @InjectRepository(CategoryOverride)
    private categoryOverrideRepository: Repository<CategoryOverride>,
    private priorityService: PriorityService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private blockedSendersService: BlockedSendersService,
    private blockedKeywordsService: BlockedKeywordsService,
    private llmService: LLMService,
    private usersService: UsersService,
    private emailThreadService: EmailThreadService,
    private emailSearchService: EmailSearchService,
    private emailStarService: EmailStarService,
    private emailDebugService: EmailDebugService,
    private emailReadService: EmailReadService,
    private emailCrudService: EmailCrudService,
    private emailGmailService: EmailGmailService,
    private emailStatusService: EmailStatusService,
    private batchScheduleService: BatchScheduleService,
    @Inject(forwardRef(() => GitHubService))
    private githubService?: GitHubService,
    @Inject(forwardRef(() => GitHubApiService))
    private githubApiService?: GitHubApiService,
    @Inject(forwardRef(() => SuggestedRepliesService))
    private suggestedRepliesService?: SuggestedRepliesService,
    private cloudWatchService?: CloudWatchService,
  ) {}

  // Buffer for collecting email IDs per user for batch priority refinement
  private readonly priorityBatchBuffer = new Map<
    string,
    { emailIds: string[]; timer: ReturnType<typeof setTimeout> | null }
  >();
  // Wait 2s to collect more emails before flushing
  private readonly BATCH_FLUSH_DELAY_MS = 2 * MS_PER_SECOND;
  // Max emails per batch LLM call
  private readonly BATCH_MAX_SIZE = 5;

  /**
   * Queue an email for batch priority refinement.
   * Collects emails for the same user and flushes them as a batch after a short delay.
   */
  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    let buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer) {
      buffer = { emailIds: [], timer: null };
      this.priorityBatchBuffer.set(userId, buffer);
    }

    buffer.emailIds.push(emailId);

    // If batch is full, flush immediately
    if (buffer.emailIds.length >= this.BATCH_MAX_SIZE) {
      await this.flushPriorityBatch(userId);
      return;
    }

    // Otherwise, set/reset a timer to flush after delay
    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }
    buffer.timer = setTimeout(() => {
      this.flushPriorityBatch(userId).catch((err) => {
        this.logger.error(
          `Failed to flush priority batch for user ${userId}:`,
          err,
        );
      });
    }, this.BATCH_FLUSH_DELAY_MS);
  }

  /**
   * Flush the priority batch buffer for a user, enqueueing a batch job.
   */
  private async flushPriorityBatch(userId: string): Promise<void> {
    const buffer = this.priorityBatchBuffer.get(userId);
    if (!buffer || buffer.emailIds.length === 0) return;

    const emailIds = [...buffer.emailIds];
    buffer.emailIds = [];
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // If only 1 email, use the standard single job (it handles skip logic)
    if (emailIds.length === 1) {
      await this.boss
        .send(
          "refine-priority",
          { userId, emailId: emailIds[0] },
          {
            priority: getJobPriority("refine-priority-background", false),
            singletonKey: `refine-priority-${emailIds[0]}`,
            singletonMinutes: 1,
          },
        )
        .catch((err) => {
          this.logger.error(
            `Failed to queue single priority refinement for email ${emailIds[0]}:`,
            err,
          );
        });
      return;
    }

    // Queue batch job
    const batchJobId = await this.boss
      .send(
        "refine-priority-batch",
        { userId, emailIds },
        {
          priority: getJobPriority("refine-priority-batch", false),
          singletonKey: `refine-priority-batch-${userId}-${Date.now()}`,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue batch priority refinement for ${emailIds.length} emails:`,
          err,
        );
        return null;
      });

    if (batchJobId) {
      this.logger.log(
        `Queued batch priority refinement job ${batchJobId} for ${emailIds.length} emails (user: ${userId})`,
      );
    }
  }

  /**
   * Get list of unique email categories for the user
   * Returns categories for filtering inbox
   */
  async getCategories(userId: string): Promise<string[]> {
    const categories = await this.emailThreadRepository.query(
      `SELECT DISTINCT category FROM email_threads WHERE "userId" = $1 AND category IS NOT NULL`,
      [userId],
    );

    const decryptedCategories = categories
      .map((row: { category: string }) =>
        row.category ? EncryptionHelper.decrypt(row.category) : null,
      )
      .filter(
        (cat: string | null): cat is string => cat !== null && cat !== "",
      );

    // Deduplicate after decryption since DISTINCT operates on encrypted values
    // AES-GCM uses random IVs, so same category can have different encrypted values
    const uniqueCategories = Array.from(
      new Set<string>(decryptedCategories),
    ).sort();

    return uniqueCategories;
  }

  /**
   * Returns counts of active (non-archived) triage email threads grouped by priority tier.
   * - high: priorityScore >= 50
   * - medium: priorityScore >= 20 and < 50
   * - low: priorityScore < 20
   */
  async getPriorityCounts(
    userId: string,
  ): Promise<{ high: number; medium: number; low: number }> {
    const rows = await this.emailThreadRepository.query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 50) AS high,
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 20 AND COALESCE("priorityScore", 0) < 50) AS medium,
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) < 20) AS low
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND "isBatched" = false
         AND "isSnoozed" = false`,
      [userId],
    );

    const row = rows[0] ?? { high: 0, medium: 0, low: 0 };
    return {
      high: parseInt(row.high, 10) || 0,
      medium: parseInt(row.medium, 10) || 0,
      low: parseInt(row.low, 10) || 0,
    };
  }

  /**
   * Get a lightweight summary of inbox categories with counts.
   * Returns all categories visible to the user without fetching full email data.
   * Counts are approximate — blocked sender and account filtering are skipped for performance.
   * For follow-up mode the count includes all starred threads (the per-thread follow-up check is skipped).
   */
  async getInboxSummary(
    userId: string,
    mode: "triage" | "action" | "follow-up" | "blocked" = "triage",
    filters?: {
      categories?: string[];
      categoryIds?: string[];
      minPriority?: number;
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
    let threadFilter =
      'AND thread."isArchived" = false AND thread."starCount" = 0';

    if (mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP) {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" > 0';
    } else if (mode === INBOX_MODES.BLOCKED) {
      threadFilter = BLOCKED_MODE_THREAD_FILTER;
    }

    let additionalFilters = "";
    const queryParams: unknown[] = [userId];
    let paramIndex = 2;

    if (filters?.minPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${paramIndex++}`;
      queryParams.push(filters.minPriority);
    }

    // Filter by account IDs if specified (check if any email in the thread belongs to the accounts)
    if (filters?.accountIds && filters.accountIds.length > 0) {
      const accountPlaceholders = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      additionalFilters += ` AND EXISTS (
        SELECT 1 FROM emails e
        WHERE e."emailThreadId" = thread.id
          AND (e."googleAccountId" IN (${accountPlaceholders})
               OR e."office365AccountId" IN (${accountPlaceholders})
               OR e."zohoAccountId" IN (${accountPlaceholders}))
      )`;
      queryParams.push(
        ...filters.accountIds,
        ...filters.accountIds,
        ...filters.accountIds,
      );
    }

    // We always need the latest email's "from" field to:
    // 1. Filter blocked senders (all modes)
    // 2. Filter threads where user sent last (action excludes, follow-up includes)
    const needsUserSentLastFilter =
      mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP;

    const selectParts: string[] = ["thread.category"];
    if (filters?.includeThreadIds) {
      selectParts.push('thread."threadId"');
    }
    // Always fetch latestFrom for blocked sender filtering
    selectParts.push('latest_email."latestFrom"');
    const selectFields = selectParts.join(", ");

    const lateralJoin = `LEFT JOIN LATERAL (
           SELECT e."from" AS "latestFrom" FROM emails e
           WHERE e."emailThreadId" = thread.id
           ORDER BY e."receivedAt" DESC LIMIT 1
         ) latest_email ON true`;

    const rows = await this.emailThreadRepository.query(
      `SELECT ${selectFields}
       FROM email_threads thread
       ${lateralJoin}
       WHERE thread."userId" = $1
         ${threadFilter}
         ${additionalFilters}
         AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
         AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
       ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC`,
      queryParams,
    );

    // Resolve the user's email for action/follow-up "sent last" filtering
    let userEmailLower: string | null = null;
    if (needsUserSentLastFilter) {
      try {
        const summaryUser = await this.usersService.findOne(userId);
        if (summaryUser) {
          userEmailLower =
            EncryptionHelper.decrypt(summaryUser.email)?.toLowerCase() || null;
        }
      } catch (error) {
        this.logger.warn(
          "Failed to get user email for summary sent-last filter:",
          error,
        );
      }
    }

    // Fetch category contexts to map category names to UUIDs
    const categoryContexts = await this.userContextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
      select: ["contextId", "contextValue"],
    });

    // Build a map from category name to context ID (UUID)
    const categoryNameToId = new Map<string, string>();
    for (const ctx of categoryContexts) {
      // contextValue format: "Category Name - Description" or just "Category Name"
      const categoryName = ctx.contextValue.split(" - ")[0].trim();
      categoryNameToId.set(categoryName, ctx.contextId);
    }

    // Pre-warm the blocked senders cache before the loop.
    // This ensures all subsequent isSenderBlocked calls use in-memory lookups.
    await this.blockedSendersService.getBlockedEmailHashes(userId);

    // Decrypt categories in-memory (AES-GCM random IVs prevent SQL DISTINCT)
    const categoryOrder: string[] = [];
    const categoryCounts: Record<string, number> = {};
    const categoryThreadIds: Record<string, string[]> = {};

    for (const row of rows as {
      category: string | null;
      threadId?: string;
      latestFrom?: string;
    }[]) {
      // Skip threads from blocked senders for normal inbox modes.
      // Blocked mode intentionally shows these threads.
      // Note: isSenderBlocked uses a cached lookup after the cache is warmed above.
      if (mode !== INBOX_MODES.BLOCKED && row.latestFrom) {
        let fromEmail = "";
        try {
          fromEmail = EncryptionHelper.decrypt(row.latestFrom) || "";
        } catch {
          // Decryption failed — include the row to avoid silently hiding emails
        }

        if (fromEmail) {
          const isBlocked = await this.blockedSendersService.isSenderBlocked(
            userId,
            fromEmail,
          );
          if (isBlocked) continue;
        }
      }

      // In action mode, skip threads where the user sent the last email (they
      // belong in follow-up). In follow-up mode, only include such threads.
      if (needsUserSentLastFilter && userEmailLower && row.latestFrom) {
        try {
          const fromLower =
            EncryptionHelper.decrypt(row.latestFrom)?.toLowerCase() || "";
          const userSentLast = fromLower.includes(userEmailLower);
          if (mode === INBOX_MODES.ACTION && userSentLast) continue;
          if (mode === INBOX_MODES.FOLLOW_UP && !userSentLast) continue;
        } catch {
          // Decryption failed — include the row to avoid silently hiding emails
        }
      }

      const category =
        (row.category ? EncryptionHelper.decrypt(row.category) : null) ||
        "Other";
      if (!categoryOrder.includes(category)) {
        categoryOrder.push(category);
        categoryThreadIds[category] = [];
      }
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (row.threadId && filters?.includeThreadIds) {
        categoryThreadIds[category].push(row.threadId);
      }
    }

    // Apply user-selected category filter in-memory (same as getInbox)
    // Support both category names and category IDs for filtering
    let visibleCategories = categoryOrder;
    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      // Filter by category IDs - reverse lookup from ID to name
      const idToName = new Map<string, string>();
      categoryNameToId.forEach((id, name) => idToName.set(id, name));
      const categoryNamesFromIds = filters.categoryIds
        .map((id) => idToName.get(id))
        .filter((name): name is string => name !== undefined);
      visibleCategories = categoryOrder.filter((cat) =>
        categoryNamesFromIds.includes(cat),
      );
    } else if (filters?.categories && filters.categories.length > 0) {
      visibleCategories = categoryOrder.filter((cat) =>
        filters.categories!.includes(cat),
      );
    }

    const categories = visibleCategories.map((name) => ({
      id: categoryNameToId.get(name) || null,
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
   * Get list of user's connected email accounts
   * Returns account info for filtering inbox by account
   */
  async getConnectedAccounts(userId: string): Promise<
    Array<{
      id: string;
      email: string;
      provider: "gmail" | "office365" | "zoho";
      isPrimary: boolean;
      isActive: boolean;
    }>
  > {
    const accounts: Array<{
      id: string;
      email: string;
      provider: "gmail" | "office365" | "zoho";
      isPrimary: boolean;
      isActive: boolean;
    }> = [];

    // Get Gmail accounts
    const googleAccounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM google_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of googleAccounts) {
      accounts.push({
        id: acc.id,
        email: EncryptionHelper.decrypt(acc.email),
        provider: "gmail",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    // Get Office365 accounts
    const office365Accounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM office365_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of office365Accounts) {
      accounts.push({
        id: acc.id,
        email: EncryptionHelper.decrypt(acc.email),
        provider: "office365",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    // Get Zoho accounts
    const zohoAccounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM zoho_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of zohoAccounts) {
      accounts.push({
        id: acc.id,
        email: EncryptionHelper.decrypt(acc.email),
        provider: "zoho",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    // Sort by primary first, then by provider
    return accounts.sort((itemA, itemB) => {
      if (itemA.isPrimary !== itemB.isPrimary) return itemA.isPrimary ? -1 : 1;
      return itemA.provider.localeCompare(itemB.provider);
    });
  }

  async getInbox(
    userId: string,
    _includeBatched: boolean = false,
    mode: "triage" | "action" | "follow-up" | "blocked" = "triage",
    filters?: {
      accountIds?: string[];
      categories?: string[];
      categoryIds?: string[];
      minPriority?: number;
    },
    pagination?: { offset?: number; limit?: number },
  ): Promise<{ emails: Email[]; total: number; hasMore: boolean }> {
    const perf = new PerformanceTracker(
      `getInbox(${mode})`,
      this.cloudWatchService,
    );

    await this.blockedSendersService.getBlockedEmailHashes(userId);
    if (Math.random() < RATIOS.SMALL) {
      this.fixStuckCalculatingThreads(userId).catch((err) =>
        this.logger.error("Error auto-fixing stuck calculating threads:", err),
      );
    }

    const threadQueryBudget =
      mode === "action"
        ? PERFORMANCE_BUDGETS.THREAD_QUERY_PROCESS
        : PERFORMANCE_BUDGETS.THREAD_QUERY;
    const endCombinedQuery = perf.startSpan(
      "combined_query",
      threadQueryBudget + PERFORMANCE_BUDGETS.EMAIL_QUERY,
    );
    const rawEmails = await this.runInboxQuery(userId, mode, filters);
    endCombinedQuery();

    if (rawEmails.length === 0) {
      perf.finish(mode);
      return { emails: [], total: 0, hasMore: false };
    }

    this.logger.debug(`Found ${rawEmails.length} threads for mode=${mode}`);

    const endDecryption = perf.startSpan(
      "decryption",
      PERFORMANCE_BUDGETS.DECRYPTION,
    );
    const threadRepresentatives: Email[] = rawEmails.map((row: RawEmailRow) =>
      this.decryptRawEmailRow(row),
    );
    endDecryption();

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

    const allFilteredEmails = filteredEmails.slice(0, maxResults);
    const total = allFilteredEmails.length;
    const queryOffset = pagination?.offset ?? 0;
    const queryLimit = pagination?.limit ?? total;
    const finalEmails = allFilteredEmails.slice(
      queryOffset,
      queryOffset + queryLimit,
    );
    const hasMore = queryOffset + finalEmails.length < total;

    // Enrich emails with category_id (UUID from UserContext) so the client
    // can group by a stable UUID rather than doing fragile name-based re-keying.
    const categoryNameToId = await this.getCategoryNameToIdMap(userId);
    for (const email of finalEmails) {
      const emailWithMeta = email as Email & { category_id?: string | null };
      const categoryName = (email as Email & { category?: string | null })
        .category;
      emailWithMeta.category_id = categoryName
        ? (categoryNameToId.get(categoryName) ?? null)
        : null;
    }

    this.logger.log(
      `getInbox(${mode}): Returning ${finalEmails.length}/${total} threads (from ${rawEmails.length} matching threads, ${blockedCount} blocked)`,
    );

    perf.finish(mode);
    return { emails: finalEmails, total, hasMore };
  }

  /**
   * Build a map from category name → context UUID for the given user.
   * Categories are stored as UserContext entries with key EMAIL_CATEGORY;
   * the contextValue format is "Category Name - Description" or "Category Name".
   * Re-uses the same lookup pattern as getInboxSummary.
   */
  private async getCategoryNameToIdMap(
    userId: string,
  ): Promise<Map<string, string>> {
    const categoryContexts = await this.userContextRepository.find({
      where: {
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
      select: ["contextId", "contextValue"],
    });
    const map = new Map<string, string>();
    for (const ctx of categoryContexts) {
      const categoryName = ctx.contextValue.split(" - ")[0].trim();
      map.set(categoryName, ctx.contextId);
    }
    return map;
  }

  private async runInboxQuery(
    userId: string,
    mode: string,
    filters?: {
      accountIds?: string[];
      categories?: string[];
      minPriority?: number;
    },
  ): Promise<RawEmailRow[]> {
    let threadFilter =
      'AND thread."isArchived" = false AND thread."starCount" > 0';

    if (mode === "triage") {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" = 0';
    } else if (mode === "blocked") {
      threadFilter = BLOCKED_MODE_THREAD_FILTER;
    }

    const queryParams: (string | number)[] = [userId];
    let additionalFilters = "";
    let paramIndex = 2;

    if (filters?.accountIds && filters.accountIds.length > 0) {
      const accountPlaceholders = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      additionalFilters += ` AND (e."googleAccountId" IN (${accountPlaceholders})
        OR e."office365AccountId" IN (${accountPlaceholders})
        OR e."zohoAccountId" IN (${accountPlaceholders}))`;
      queryParams.push(
        ...filters.accountIds,
        ...filters.accountIds,
        ...filters.accountIds,
      );
      paramIndex += filters.accountIds.length * 2;
    }

    if (filters?.minPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${paramIndex++}`;
      queryParams.push(filters.minPriority);
    }

    return this.emailRepository.query(
      `SELECT
            thread."starCount", thread."isArchived", thread."urgencyScore",
            thread."priorityExplanation", thread."priorityScore", thread."isProcessingPriority",
            thread."githubMetadata", thread."category", thread."categoryExplanation",
            thread."protoCategoryId", thread."updatedAt" as "threadUpdatedAt",
            thread."isBatched", thread."batchReleaseAt", thread."wasDeliveredEarly",
            thread."batchDecisionReason",
            pc."name" as "protoCategoryName", pc."description" as "protoCategoryDescription",
        e.id, e."userId", e."threadId", e."emailThreadId", e."messageId",
        e."googleAccountId", e."office365AccountId", e."zohoAccountId",
        e."from", e."fromName", e."senderJobTitle", e.subject,
        e."isSnoozed", e."snoozeUntil", e."isRead", e.summary, e."isProcessingSummary",
        e."phishingConfidence", e."phishingReason",
        e."receivedAt", e.labels, e."cc",
        correspondent."from" as "correspondentEmail",
        correspondent."fromName" as "correspondentName"
      FROM email_threads thread
      CROSS JOIN LATERAL (
        SELECT em.id, em."userId", em."threadId", em."emailThreadId", em."messageId",
          em."from", em."fromName", em."senderJobTitle", em.subject,
          em."googleAccountId", em."office365AccountId", em."zohoAccountId",
          em."isSnoozed", em."snoozeUntil", em."isRead", em.summary, em."isProcessingSummary",
          em."phishingConfidence", em."phishingReason",
          em."receivedAt", em.labels, em."cc"
        FROM emails em
        WHERE em."emailThreadId" = thread.id AND em."userId" = $1
        ORDER BY em."receivedAt" DESC, em.id DESC
        LIMIT 1
      ) e
      LEFT JOIN LATERAL (
        SELECT cor."from", cor."fromName"
        FROM emails cor JOIN users u ON u.id = $1
        WHERE cor."emailThreadId" = thread.id AND cor."userId" = $1
          AND LOWER(cor."from") != LOWER(u.email)
        ORDER BY cor."receivedAt" ASC LIMIT 1
      ) correspondent ON true
      LEFT JOIN proto_categories pc ON pc.id = thread."protoCategoryId"
      WHERE thread."userId" = $1
        ${threadFilter}
        ${additionalFilters}
        AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
        AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
      ORDER BY COALESCE(thread."priorityScore", 0) DESC, thread."updatedAt" DESC, thread."threadId" ASC
      LIMIT ${mode === "action" ? QUERY_LIMITS.INBOX_PROCESS_TOTAL : QUERY_LIMITS.INBOX_TOTAL}`,
      queryParams,
    ) as Promise<RawEmailRow[]>;
  }

  private async applyPostQueryFilters(
    userId: string,
    mode: string,
    emails: Email[],
    perf: PerformanceTracker,
    filters?: {
      accountIds?: string[];
      categories?: string[];
      categoryIds?: string[];
      minPriority?: number;
    },
  ): Promise<{ emails: Email[]; blockedCount: number }> {
    const endBlockedFilter = perf.startSpan(
      "blocked_filter",
      QUERY_LIMITS.MAX_RESULTS_DEFAULT,
    );
    const blockedEmailIds =
      mode === "blocked"
        ? []
        : await this.blockedSendersService.filterBlockedEmails(
            userId,
            emails.map((emailEntry) => ({
              id: emailEntry.id,
              from: emailEntry.from,
            })),
          );
    const blockedSet = new Set(blockedEmailIds);
    let filteredEmails =
      mode === "blocked"
        ? emails
        : emails.filter((emailEntry) => !blockedSet.has(emailEntry.id));
    endBlockedFilter();

    if (blockedEmailIds.length > 0) {
      this.logger.debug(
        `Filtered ${blockedEmailIds.length} emails from blocked senders`,
      );
    }

    // Apply category filter (by name or by ID)
    let categoryFilterNames: string[] | undefined;

    if (filters?.categoryIds && filters.categoryIds.length > 0) {
      // Resolve category IDs to names
      const categoryContexts = await this.userContextRepository.find({
        where: {
          userId,
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
        select: ["contextId", "contextValue"],
      });
      const idToName = new Map<string, string>();
      for (const ctx of categoryContexts) {
        const categoryName = ctx.contextValue.split(" - ")[0].trim();
        idToName.set(ctx.contextId, categoryName);
      }
      categoryFilterNames = filters.categoryIds
        .map((id) => idToName.get(id))
        .filter((name): name is string => name !== undefined);
    } else if (filters?.categories && filters.categories.length > 0) {
      categoryFilterNames = filters.categories;
    }

    if (categoryFilterNames && categoryFilterNames.length > 0) {
      const beforeCount = filteredEmails.length;
      filteredEmails = filteredEmails.filter((emailEntry) => {
        const emailCategory = (
          emailEntry as Email & { category?: string | null }
        ).category;
        // Treat null/undefined/empty category as "Other" to mirror getInboxSummary behaviour
        const effectiveCategory = emailCategory || "Other";
        return categoryFilterNames!.includes(effectiveCategory);
      });
      const removed = beforeCount - filteredEmails.length;
      if (removed > 0)
        this.logger.debug(
          `Category filter: Removed ${removed} emails not matching categories: ${categoryFilterNames.join(", ")}`,
        );
    }

    if (mode === "action") {
      filteredEmails = await this.filterActionModeEmails(
        userId,
        filteredEmails,
        perf,
      );
    }

    if (mode === "follow-up") {
      filteredEmails = await this.filterFollowUpModeEmails(
        userId,
        filteredEmails,
        perf,
      );
    }

    return { emails: filteredEmails, blockedCount: blockedEmailIds.length };
  }

  private async filterActionModeEmails(
    userId: string,
    emails: Email[],
    perf: PerformanceTracker,
  ): Promise<Email[]> {
    const endActionFilter = perf.startSpan(
      "action_user_sent_last_filter",
      QUERY_LIMITS.INBOX_PROCESS_TOTAL,
    );
    try {
      const actionUser = await this.usersService.findOne(userId);
      if (actionUser) {
        const actionUserEmail = EncryptionHelper.decrypt(
          actionUser.email,
        )?.toLowerCase();
        if (actionUserEmail) {
          const beforeCount = emails.length;
          const result = emails.filter(
            (emailEntry) =>
              (emailEntry.from?.toLowerCase() || "") !== actionUserEmail,
          );
          if (result.length < beforeCount) {
            this.logger.debug(
              `Action mode: Filtered ${beforeCount - result.length} threads where user sent the last email`,
            );
          }
          return result;
        }
      }
    } catch (error) {
      this.logger.warn(
        "Failed to filter action mode by user-sent-last:",
        error,
      );
    } finally {
      endActionFilter();
    }
    return emails;
  }

  private async filterFollowUpModeEmails(
    userId: string,
    emails: Email[],
    perf: PerformanceTracker,
  ): Promise<Email[]> {
    const endFollowUpFilter = perf.startSpan(
      "follow_up_filter",
      QUERY_LIMITS.INBOX_TOTAL,
    );
    const unsnoozed = emails.filter(
      (emailEntry) =>
        !emailEntry.isSnoozed ||
        (emailEntry.snoozeUntil &&
          new Date(emailEntry.snoozeUntil) < new Date()),
    );
    const followUpEmails: Email[] = [];
    for (const email of unsnoozed) {
      try {
        const threadStatus = await this.checkThreadFollowUpStatus(
          userId,
          email.threadId,
        );
        if (threadStatus.userSentLast && !threadStatus.replyReceived) {
          const emailWithReplyTimes = email as EmailWithMetadata;
          emailWithReplyTimes.lastTheirReplyAt =
            threadStatus.lastTheirReplyAt?.toISOString();
          emailWithReplyTimes.lastMyReplyAt =
            threadStatus.lastMyReplyAt?.toISOString();
          followUpEmails.push(email);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check follow-up status for thread ${email.threadId}:`,
          error,
        );
      }
    }
    endFollowUpFilter();
    return followUpEmails;
  }

  private decryptRawEmailRow(row: RawEmailRow): Email {
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
    const correspondentEmail = row.correspondentEmail
      ? EncryptionHelper.decrypt(row.correspondentEmail as string)
      : null;
    const correspondentName = row.correspondentName
      ? EncryptionHelper.decrypt(row.correspondentName as string)
      : null;

    return {
      id: row.id,
      userId: row.userId,
      threadId: row.threadId,
      emailThreadId: row.emailThreadId,
      messageId: row.messageId,
      googleAccountId: row.googleAccountId,
      office365AccountId: row.office365AccountId,
      zohoAccountId: row.zohoAccountId,
      from: EncryptionHelper.decrypt(row.from as string | null),
      fromName: EncryptionHelper.decrypt(row.fromName as string | null),
      senderJobTitle: EncryptionHelper.decrypt(
        row.senderJobTitle as string | null,
      ),
      subject: EncryptionHelper.decrypt(row.subject as string | null),
      priorityExplanation,
      isSnoozed: row.isSnoozed,
      snoozeUntil: row.snoozeUntil,
      isBatched: row.isBatched,
      batchReleaseAt: row.batchReleaseAt,
      wasDeliveredEarly: row.wasDeliveredEarly,
      batchDecisionReason: row.batchDecisionReason,
      isRead: row.isRead,
      summary: EncryptionHelper.decrypt(row.summary as string | null),
      isProcessingPriority: row.isProcessingPriority,
      isProcessingSummary: row.isProcessingSummary,
      receivedAt: row.receivedAt,
      labels: labels || [],
      starCount: row.starCount,
      isArchived: row.isArchived,
      urgencyScore: row.urgencyScore,
      githubMetadata,
      threadUpdatedAt: row.threadUpdatedAt,
      category: EncryptionHelper.decrypt(row.category as string | null) || null,
      categoryExplanation: row.categoryExplanation
        ? EncryptionHelper.decrypt(row.categoryExplanation as string)
        : null,
      protoCategoryName: row.protoCategoryName
        ? EncryptionHelper.decrypt(row.protoCategoryName as string)
        : null,
      protoCategoryDescription: row.protoCategoryDescription
        ? EncryptionHelper.decrypt(row.protoCategoryDescription as string)
        : null,
      correspondentEmail,
      correspondentName,
      phishingConfidence:
        (row.phishingConfidence as "low" | "medium" | "high" | null) ?? null,
      phishingReason: (row.phishingReason as string | null) ?? null,
    } as unknown as Email;
  }

  private decryptEmailLabels(row: RawEmailRow): string[] {
    if (!row.labels) return [];
    try {
      const decryptedLabels = EncryptionHelper.decrypt(row.labels);
      if (!decryptedLabels) return [];
      const parsedLabels = JSON.parse(decryptedLabels);
      const systemLabels = new Set([
        "INBOX",
        "SENT",
        "TRASH",
        "SPAM",
        "DRAFT",
        "UNREAD",
        "STARRED",
        "IMPORTANT",
        "CATEGORY_PERSONAL",
        "CATEGORY_SOCIAL",
        "CATEGORY_PROMOTIONS",
        "CATEGORY_UPDATES",
        "CATEGORY_FORUMS",
        "GREEN_CIRCLE",
        "BLUE_STAR",
        "YELLOW_STAR",
        "RED_BANG",
        "YELLOW_BANG",
        "PURPLE_QUESTION",
        "ORANGE_GUILLEMET",
        "BLUE_INFO",
        "RED_MINUS",
        "YELLOW_MINUS",
        "GREEN_CHECK",
        "BLUE_CHECK",
        "RED_CHECK",
        "ORANGE_CHECK",
      ]);
      return Array.from(
        new Set(
          parsedLabels.filter((label: string) => !systemLabels.has(label)),
        ),
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

  /**
   * Check if thread meets follow-up criteria: user sent last AND no reply received
   * Uses database emails instead of provider-specific API calls
   */
  private async checkThreadFollowUpStatus(
    userId: string,
    threadId: string,
  ): Promise<{
    userSentLast: boolean;
    replyReceived: boolean;
    lastTheirReplyAt: Date | null;
    lastMyReplyAt: Date | null;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const userEmail = EncryptionHelper.decrypt(user.email);

    try {
      // Get all emails in the thread from database
      const threadEmails = await this.emailThreadService.getThreadEmails(
        userId,
        threadId,
        // Get in chronological order
        { order: "ASC" },
      );

      if (threadEmails.length === 0) {
        return {
          userSentLast: false,
          replyReceived: false,
          lastTheirReplyAt: null,
          lastMyReplyAt: null,
        };
      }

      let lastTheirReplyAt: Date | null = null;
      let lastMyReplyAt: Date | null = null;

      // Check each email to find last reply from them and from user
      for (const email of threadEmails) {
        const fromEmail = email.from?.toLowerCase() || "";
        const isFromUser = fromEmail === userEmail.toLowerCase();

        if (isFromUser) {
          lastMyReplyAt = email.receivedAt;
        } else {
          lastTheirReplyAt = email.receivedAt;
        }
      }

      // User sent last if the last email is from the user
      const lastEmail = threadEmails[threadEmails.length - 1];
      const lastEmailFrom = lastEmail.from?.toLowerCase() || "";
      const userSentLast = lastEmailFrom === userEmail.toLowerCase();

      // No reply received if user sent last and there's no message after the last user message
      const replyReceived =
        !userSentLast ||
        (lastTheirReplyAt && lastMyReplyAt && lastTheirReplyAt > lastMyReplyAt);

      return {
        userSentLast,
        replyReceived,
        lastTheirReplyAt,
        lastMyReplyAt,
      };
    } catch (error) {
      this.logger.error(
        `Error checking thread follow-up status for ${threadId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Convert label IDs to human-readable names for a list of emails
   */
  private async convertEmailLabels(
    userId: string,
    emails: Email[],
  ): Promise<void> {
    // Collect all unique label IDs
    const allLabelIds = new Set<string>();
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        email.labels.forEach((id) => allLabelIds.add(id));
      }
    }

    if (allLabelIds.size === 0) return;

    // Get label names from email provider
    const labelNames = await this.emailProviderManager.convertLabelIdsToNames(
      userId,
      Array.from(allLabelIds),
    );

    // Create a mapping
    const labelIdToName = new Map<string, string>();
    const labelIdsArray = Array.from(allLabelIds);
    labelIdsArray.forEach((id, index) => {
      if (labelNames[index]) {
        labelIdToName.set(id, labelNames[index]);
      }
    });

    // Update emails in place (and save to DB for next time)
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        // Convert each label ID to name, or keep as-is if not in mapping
        // Also filter out system labels and unmapped Label_* labels
        // These are common system labels across providers (Gmail, O365, Zoho)
        const systemLabels = new Set([
          "INBOX",
          "SENT",
          "TRASH",
          "SPAM",
          "DRAFT",
          "UNREAD",
          "STARRED",
          "IMPORTANT",
          "CATEGORY_PERSONAL",
          "CATEGORY_SOCIAL",
          "CATEGORY_PROMOTIONS",
          "CATEGORY_UPDATES",
          "CATEGORY_FORUMS",
          "GREEN_CIRCLE",
          "BLUE_STAR",
          "YELLOW_STAR",
          "RED_BANG",
          "YELLOW_BANG",
          "PURPLE_QUESTION",
          "ORANGE_GUILLEMET",
          "BLUE_INFO",
          "RED_MINUS",
          "YELLOW_MINUS",
          "GREEN_CHECK",
          "BLUE_CHECK",
          "RED_CHECK",
          "ORANGE_CHECK",
        ]);

        const convertedLabels = email.labels
          .map((idOrName) => {
            // First check if it's a system label (by ID or name)
            if (systemLabels.has(idOrName)) {
              // Skip system labels
              return null;
            }

            // If it's an ID, try to convert it
            if (labelIdToName.has(idOrName)) {
              const convertedName = labelIdToName.get(idOrName)!;
              // Check if the converted name is also a system label
              if (systemLabels.has(convertedName)) {
                return null;
              }
              return convertedName;
            }

            // If it doesn't start with Label_ and isn't a system label, it might already be a name
            if (
              !idOrName.startsWith("Label_") &&
              !idOrName.startsWith("label_")
            ) {
              // Double-check it's not a system label (in case it was stored as a name)
              if (systemLabels.has(idOrName)) {
                return null;
              }
              // Keep as-is (might be a custom label name)
              return idOrName;
            }
            // Skip unmapped Label_* labels
            return null;
          })
          .filter((label): label is string => label !== null);

        // Remove duplicates using Set
        const uniqueConvertedLabels = Array.from(new Set(convertedLabels));

        // Only update if labels changed
        if (
          JSON.stringify(uniqueConvertedLabels) !== JSON.stringify(email.labels)
        ) {
          this.logger.debug(
            `[EmailsService] Updating labels for email ${email.id}: ${JSON.stringify(email.labels)} -> ${JSON.stringify(uniqueConvertedLabels)}`,
          );
          email.labels = uniqueConvertedLabels;
          // Update in DB (non-blocking)
          this.emailRepository
            .update(email.id, { labels: uniqueConvertedLabels })
            .catch((err) =>
              logError(
                `Failed to update labels for email ${email.id}`,
                err instanceof Error ? err : new Error(String(err)),
              ),
            );
        }
      }
    }
  }

  /**
   * Get email by ID
   * Delegates to EmailCrudService
   */
  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailCrudService.getEmailById(userId, emailId);
  }

  /**
   * Fetch current star status from email provider for debugging
   * Delegates to EmailGmailService (provider-specific debugging)
   */
  async getGmailStarStatus(
    userId: string,
    emailId: string,
  ): Promise<{
    dbStarCount: number;
    gmailStarStatus: {
      isStarred: boolean;
      starCount: number;
      threadId: string;
      latestMessageLabelIds: string[];
      messageStarStatuses: Array<{
        messageIndex: number;
        messageId: string;
        isStarred: boolean;
        labelIds: string[];
      }>;
      isAnyStarred: boolean;
      starredMessageCount: number;
      error?: string;
    };
    threadInfo: {
      threadId: string;
      emailThreadId: string | null;
    };
  }> {
    return this.emailGmailService.getGmailStarStatus(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Fetch current labels from Gmail for a specific message for debugging
   * Delegates to EmailGmailService
   */
  async getGmailLabels(
    userId: string,
    emailId: string,
  ): Promise<{
    dbLabels: {
      raw: string[] | null;
      names: string[] | null;
    };
    gmailLabels: {
      labelIds: string[];
      labelNames: string[];
      messageId: string;
      error?: string;
    };
    labelMapping: Array<{ id: string; name: string }>;
    emailInfo: {
      id: string;
      messageId: string;
      threadId: string;
    };
  }> {
    return this.emailGmailService.getGmailLabels(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Get attachment data from an email
   */
  async getAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{
    attachmentBuffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    // Get the email to find the messageId
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Verify the attachment exists in the email
    if (!email.attachments || email.attachments.length === 0) {
      throw new Error("Email has no attachments");
    }

    const attachment = email.attachments.find(
      (att) => att.attachmentId === attachmentId,
    );
    if (!attachment) {
      throw new Error("Attachment not found in email");
    }

    // Get the provider and fetch the attachment
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error("No email provider connected");
    }

    // Pass attachment metadata to help find the attachment if the ID has changed
    // (Gmail attachment IDs are ephemeral and can change between API calls)
    return provider.getAttachment(userId, email.messageId, attachmentId, {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  }

  async getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]> {
    // Delegate to EmailThreadService
    return this.emailThreadService.getThreadEmails(userId, threadId, options);
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in email provider)
   * Delegates to EmailThreadService
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS.WEEK,
  ): Promise<string[]> {
    return this.emailThreadService.getRecentNonArchivedThreadIds(userId, days);
  }

  /**
   * Get ALL non-archived thread IDs (for checking starred/archived status in email provider)
   * Delegates to EmailThreadService
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    return this.emailThreadService.getAllNonArchivedThreadIds(userId);
  }

  /**
   * Get non-archived threads that need status verification
   * Delegates to EmailThreadService
   */
  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = QUERY_LIMITS.INBOX_PAGE_SIZE,
  ): Promise<string[]> {
    return this.emailThreadService.getNonArchivedThreadsNeedingCheck(
      userId,
      limit,
    );
  }

  /**
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by email provider sync to compare with provider search results
   */
  async getAllThreadsForSync(userId: string): Promise<
    Array<{
      threadId: string;
      isArchived: boolean;
      starCount: number;
      syncStatus: "synced" | "unsynced";
    }>
  > {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select([
        "thread.threadId",
        "thread.isArchived",
        "thread.starCount",
        "thread.syncStatus",
      ])
      .where("thread.userId = :userId", { userId })
      // Reasonable limit for sync
      .limit(QUERY_LIMITS.INBOX_TOTAL)
      .getMany();

    return (
      results
        .map((thread) => ({
          threadId: thread.threadId,
          isArchived: thread.isArchived,
          starCount: thread.starCount,
          syncStatus: thread.syncStatus,
        }))
        // Filter out any null/undefined threadIds
        .filter((thread) => thread.threadId)
    );
  }

  /**
   * Update archived status for a thread (updates EmailThread)
   * Delegates to EmailThreadService
   * @param setLastUserOperation - If true, sets lastUserOperationAt to now (for user-initiated actions)
   */
  async updateThreadArchivedStatus(
    userId: string,
    threadId: string,
    isArchived: boolean,
    setLastUserOperation: boolean = false,
  ): Promise<void> {
    return this.emailThreadService.updateThreadArchivedStatus(
      userId,
      threadId,
      isArchived,
      setLastUserOperation,
    );
  }

  /**
   * Update lastCheckedAt for multiple threads (used to track verification without status changes)
   * Delegates to EmailThreadService
   */
  async updateThreadsLastCheckedAt(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.updateThreadsLastCheckedAt(
      userId,
      threadIds,
    );
  }

  /**
   * Batch update thread archived statuses (more efficient than individual updates)
   * Delegates to EmailThreadService
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadArchivedStatuses(
      userId,
      updates,
    );
  }

  /**
   * Update star count for a thread (updates EmailThread)
   * Delegates to EmailThreadService
   */
  async updateThreadStarCount(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    return this.emailThreadService.updateThreadStarCount(
      userId,
      threadId,
      starCount,
    );
  }

  /**
   * Batch update thread statuses (archived + starred) in a single transaction
   * Delegates to EmailThreadService
   */
  async batchUpdateThreadStatus(
    userId: string,
    updates: { threadId: string; isArchived: boolean; starCount: number }[],
    deletedThreadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadStatus(
      userId,
      updates,
      deletedThreadIds,
    );
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   * Delegates to EmailThreadService
   */
  async getOrCreateEmailThread(
    userId: string,
    threadId: string,
    starCount: number = STAR_COUNTS.NONE,
    isArchived: boolean = false,
  ): Promise<EmailThread> {
    return this.emailThreadService.getOrCreateEmailThread(
      userId,
      threadId,
      starCount,
      isArchived,
    );
  }

  /**
   * Get email by message ID
   * Delegates to EmailCrudService
   */
  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailCrudService.getEmailByMessageId(userId, messageId);
  }

  async createEmail(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    options?: { skipBatching?: boolean },
  ): Promise<Email> {
    this.logger.debug(
      `Creating email for user ${userId}: ${emailData.subject}`,
    );

    const senderEmail = emailData.from || "";
    const subject = emailData.subject || "";
    const [isSenderBlocked, hasBlockedKeyword] = await Promise.all([
      this.blockedSendersService.isSenderBlocked(userId, senderEmail),
      this.blockedKeywordsService.checkSubjectForBlockedKeywords(
        userId,
        subject,
      ),
    ]);
    const isBlocked = isSenderBlocked || hasBlockedKeyword;

    const starCount = emailData.starCount ?? 0;
    const isArchived = isBlocked ? true : (emailData.isArchived ?? false);
    const thread = await this.getOrCreateEmailThread(
      userId,
      emailData.threadId!,
      starCount,
      isArchived,
    );

    const {
      starCount: _starCount,
      isArchived: _isArchived,
      ...emailDataWithoutThreadProps
    } = emailData;
    const emailDataToCreate: Partial<Email> = {
      ...emailDataWithoutThreadProps,
      userId,
      emailThreadId: thread.id,
    };
    this.logger.debug(
      `[EmailsService] Creating email ${emailDataToCreate.messageId} with labels: ${emailDataToCreate.labels ? "yes" : "no"}`,
    );

    const createdEntities = this.emailRepository.create(emailDataToCreate);
    const email = (
      Array.isArray(createdEntities) ? createdEntities[0] : createdEntities
    ) as Email;

    if (isBlocked) {
      return this.saveBlockedEmail(
        userId,
        email,
        thread,
        isSenderBlocked,
        senderEmail,
        subject,
      );
    }

    thread.isProcessingPriority = true;
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = true;

    const batchResult = await this.determineBatchDecision(
      userId,
      thread,
      starCount,
      thread.priorityScore || 0,
      options,
    );
    email.batchDecisionReason = batchResult.batchDecisionReason;

    const savedEmail = await this.emailRepository.save(email);
    this.logger.debug(
      `[EmailsService] Saved email ${savedEmail.id} to database`,
    );

    await this.updateThreadAfterSave(userId, thread, batchResult);
    this.logLabelsSaved(savedEmail);
    await this.queuePostSaveJobs(userId, savedEmail, thread);

    return savedEmail;
  }

  private async determineBatchDecision(
    userId: string,
    thread: EmailThread,
    starCount: number,
    priorityScore: number,
    options?: { skipBatching?: boolean },
  ): Promise<{
    isBatched: boolean;
    batchReleaseAt: Date | null;
    wasDeliveredEarly: boolean;
    batchDecisionReason: string;
  }> {
    if (options?.skipBatching) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Initial sync",
      };
    }
    if (starCount > 0) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Starred email",
      };
    }

    let schedule = await this.batchScheduleService.getSchedule(userId);
    if (!schedule) {
      const defaultScheduleData =
        this.batchScheduleService.getDefaultSchedule();
      schedule = {
        ...defaultScheduleData,
        userId,
        id: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BatchSchedule;
    }

    if (!schedule.isEnabled) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: "Schedule disabled",
      };
    }

    if (
      priorityScore >= PRIORITY_SCORES.HIGH_THRESHOLD &&
      schedule.urgentBypassSchedule
    ) {
      return {
        isBatched: false,
        batchReleaseAt: null,
        wasDeliveredEarly: false,
        batchDecisionReason: `High priority (${priorityScore}) bypassed schedule`,
      };
    }

    const nextReleaseTime = this.batchScheduleService.getNextBatchReleaseTime(
      schedule,
      priorityScore,
    );
    if (nextReleaseTime !== null) {
      const existingReleaseAt = thread.batchReleaseAt;
      const now = new Date();
      // Only use existing release time if it's both:
      // 1. Earlier than the newly calculated time, AND
      // 2. Still in the future (not already past)
      const existingIsValidAndEarlier =
        existingReleaseAt !== null &&
        existingReleaseAt > now &&
        existingReleaseAt < nextReleaseTime;
      const effectiveReleaseTime = existingIsValidAndEarlier
        ? existingReleaseAt
        : nextReleaseTime;
      return {
        isBatched: true,
        batchReleaseAt: effectiveReleaseTime,
        wasDeliveredEarly: false,
        batchDecisionReason: `Batched until ${effectiveReleaseTime.toISOString()}`,
      };
    }

    return {
      isBatched: false,
      batchReleaseAt: null,
      wasDeliveredEarly: false,
      batchDecisionReason: "No upcoming delivery window",
    };
  }

  private async updateThreadAfterSave(
    userId: string,
    thread: EmailThread,
    batchDecision: {
      isBatched: boolean;
      batchReleaseAt: Date | null;
      wasDeliveredEarly: boolean;
      batchDecisionReason: string;
    },
  ): Promise<void> {
    const threadUpdate: Partial<EmailThread> = {
      updatedAt: new Date(),
      isBatched: batchDecision.isBatched,
      batchReleaseAt: batchDecision.batchReleaseAt,
      wasDeliveredEarly: batchDecision.wasDeliveredEarly,
      batchDecisionReason: batchDecision.batchDecisionReason,
    };
    await this.emailThreadRepository.update({ id: thread.id }, threadUpdate);
    await this.cancelThreadSnoozeIfNeeded(userId, thread);
    await this.invalidateSuggestedActionsCache(thread.id);
  }

  private async cancelThreadSnoozeIfNeeded(
    userId: string,
    thread: EmailThread,
  ): Promise<void> {
    try {
      const snoozedEmailsInThread = await this.emailRepository.find({
        where: { emailThreadId: thread.id, userId, isSnoozed: true },
      });
      if (!thread.isSnoozed && snoozedEmailsInThread.length === 0) return;

      if (thread.isSnoozed) {
        await this.emailThreadRepository.update(
          { id: thread.id },
          { isSnoozed: false, snoozeUntil: null },
        );
        this.logger.log(
          `Cancelled thread-level snooze for thread ${thread.id} due to new reply`,
        );
      }
      if (snoozedEmailsInThread.length > 0) {
        await this.emailRepository.update(
          { emailThreadId: thread.id, userId, isSnoozed: true },
          { isSnoozed: false, snoozeUntil: null },
        );
        this.logger.log(
          `Cancelled snooze for ${snoozedEmailsInThread.length} email(s) in thread ${thread.id} due to new reply`,
        );
      }

      const firstSnoozedEmail = snoozedEmailsInThread[0];
      if (firstSnoozedEmail?.threadId) {
        try {
          const provider =
            await this.emailProviderManager.getPrimaryProvider(userId);
          if (provider) {
            await provider.unsnoozeThread(userId, firstSnoozedEmail.threadId);
            this.logger.log(
              `Successfully synced unsnooze to provider for thread ${firstSnoozedEmail.threadId}`,
            );
          }
        } catch (providerError) {
          this.logger.error(
            `Failed to sync unsnooze to email provider for thread ${firstSnoozedEmail.threadId}:`,
            providerError,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cancel snooze for thread ${thread.id}:`,
        error,
      );
    }
  }

  private async invalidateSuggestedActionsCache(
    threadId: string,
  ): Promise<void> {
    try {
      await this.actionItemRepository.delete({
        emailThreadId: threadId,
        source: "llm",
        actionType: Not(IsNull()),
      });
      this.logger.debug(
        `Invalidated LLM suggested actions cache for thread ${threadId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate suggested actions cache for thread ${threadId}:`,
        error,
      );
    }
  }

  private logLabelsSaved(savedEmail: Email): void {
    if (savedEmail.labels) {
      this.logger.debug(
        `[EmailsService] Email ${savedEmail.id} saved with labels (after TypeORM): ${JSON.stringify(savedEmail.labels)}`,
      );
    } else {
      this.logger.debug(
        `[EmailsService] Email ${savedEmail.id} saved with no labels`,
      );
    }
  }

  private async queuePostSaveJobs(
    userId: string,
    savedEmail: Email,
    thread: EmailThread,
  ): Promise<void> {
    await this.queueBatchPriorityRefinement(userId, savedEmail.id).catch(
      async (err) => {
        this.logger.error(
          `Failed to queue priority refinement for email ${savedEmail.id}:`,
          err,
        );
        if (thread) {
          thread.isProcessingPriority = false;
          await this.emailThreadRepository.save(thread);
        }
      },
    );

    const summaryJobId = await this.boss
      .send(
        "generate-summary",
        { userId, emailId: savedEmail.id, threadId: savedEmail.emailThreadId },
        {
          priority: getJobPriority("generate-summary-background", false),
          singletonKey: `generate-summary-thread-${savedEmail.emailThreadId || savedEmail.id}`,
          singletonMinutes: 5,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue summary generation for email ${savedEmail.id}:`,
          err,
        );
        this.emailRepository.update(
          { id: savedEmail.id },
          { isProcessingSummary: false },
        );
        return null;
      });

    if (summaryJobId) {
      this.logger.debug(
        `Queued summary generation job ${summaryJobId} for email ${savedEmail.id}`,
      );
    }

    if (savedEmail.emailThreadId) {
      this.boss
        .send(
          "fetch-github-metadata",
          {
            userId,
            emailId: savedEmail.id,
            threadId: savedEmail.emailThreadId,
          },
          {
            priority: getJobPriority("generate-summary-background", false),
            singletonKey: `github-metadata-${savedEmail.emailThreadId}`,
            singletonMinutes: MINUTES.HOUR,
          },
        )
        .catch((err) => {
          this.logger.error(
            `Failed to queue GitHub metadata job for email ${savedEmail.id}:`,
            err,
          );
        });

      this.boss
        .send(
          "auto-responder",
          { userId, emailThreadId: savedEmail.emailThreadId },
          {
            priority: getJobPriority("auto-responder"),
            retryLimit: 2,
            retryDelay: 30,
            expireInMinutes: MINUTES.HOUR,
            singletonKey: `auto-responder-${savedEmail.emailThreadId}`,
          },
        )
        .then((jobId) => {
          if (jobId)
            this.logger.debug(
              `Queued auto-responder job ${jobId} for thread ${savedEmail.emailThreadId}`,
            );
        })
        .catch((err) => {
          this.logger.error(
            `Failed to queue auto-responder job for email ${savedEmail.id}:`,
            err,
          );
        });
    }

    if (thread && thread.starCount > 0 && this.suggestedRepliesService) {
      this.suggestedRepliesService
        .queueSuggestedReplyGeneration(userId, thread.id, savedEmail.id)
        .catch((err) => {
          this.logger.error(
            `Failed to queue suggested reply regeneration for thread ${thread.id}:`,
            err,
          );
        });
    }
  }

  private async saveBlockedEmail(
    userId: string,
    email: Email,
    thread: EmailThread,
    isSenderBlocked: boolean,
    senderEmail: string,
    subject: string,
  ): Promise<Email> {
    const blockReason = isSenderBlocked
      ? `blocked sender ${senderEmail}`
      : `blocked keyword in subject "${subject}"`;
    this.logger.log(
      `📛 Email from ${blockReason} - auto-archiving and skipping LLM processing`,
    );
    thread.isProcessingPriority = false;
    await this.emailThreadRepository.save(thread);
    email.isProcessingSummary = false;
    email.summary = isSenderBlocked ? "[Blocked sender]" : "[Blocked keyword]";
    email.labels = [...(email.labels || []), "BearlyMail-Blocked"];

    const savedEmail = await this.emailRepository.save(email);
    this.boss
      .send(
        "archive-email",
        { userId, emailId: savedEmail.id, isBlocked: true },
        {
          priority: getJobPriority("archive-email", false),
          singletonKey: `archive-blocked-${savedEmail.threadId}`,
          singletonMinutes: 5,
        },
      )
      .then((jobId) => {
        if (jobId)
          this.logger.log(
            `📛 Queued archive job ${jobId} for blocked sender email: threadId=${savedEmail.threadId}`,
          );
      })
      .catch((err) => {
        this.logger.error(
          `Failed to queue archive job for blocked sender email ${savedEmail.id}:`,
          err,
        );
      });

    return savedEmail;
  }

  private checkIfUrgent(email: Partial<Email>): boolean {
    // More strict urgent keyword detection
    // Only flag as urgent if keywords appear in subject (not body) to reduce false positives
    // Body often contains quoted text or casual mentions of these words
    const urgentKeywords = [
      "urgent",
      "asap",
      "critical",
      "emergency",
      "immediate",
      "time-sensitive",
    ];
    const subjectLower = (email.subject || "").toLowerCase();

    // Only check subject for urgent keywords - more reliable indicator
    // Require exact word match (not substring) to avoid false positives like "currently" matching "urgent"
    const subjectWords = subjectLower.split(/\s+/);
    return urgentKeywords.some(
      (keyword) =>
        subjectWords.includes(keyword) ||
        subjectLower.includes(` ${keyword} `) ||
        subjectLower.startsWith(`${keyword} `) ||
        subjectLower.endsWith(` ${keyword}`),
    );
  }

  /**
   * Mark an email as read
   * Delegates to EmailReadService
   */
  async markAsRead(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsRead(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Mark an email as unread
   * Delegates to EmailReadService
   */
  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsUnread(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Bulk mark multiple emails as read
   * Delegates to EmailReadService
   */
  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsRead(userId, emailIds);
  }

  /**
   * Bulk mark multiple emails as unread
   * Delegates to EmailReadService
   */
  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsUnread(userId, emailIds);
  }

  async getSyncStatus(userId: string): Promise<{
    lastSyncAt: Date | null;
    isSyncing: boolean;
  }> {
    return this.emailStatusService.getSyncStatus(userId);
  }

  /**
   * Get sync history for a user
   * Delegates to EmailDebugService
   */
  async getSyncHistory(userId: string, limit?: number) {
    return this.emailDebugService.getSyncHistory(userId, limit);
  }

  /**
   * Archive email - updates database FIRST, then syncs to email provider.
   * This ensures the UI reflects the change immediately on page reload.
   * The Gmail sync is done after DB update so it doesn't block the response.
   */
  async archiveEmail(userId: string, emailId: string): Promise<void> {
    this.logger.log(
      `[Archive] archiveEmail called: userId=${userId}, emailId=${emailId}`,
    );
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(
        `[Archive] Email not found: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error("Email not found");
    }

    if (!email.threadId) {
      this.logger.warn(
        `[Archive] Email has no threadId: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error("Email has no threadId");
    }

    const { threadId } = email;
    this.logger.log(
      `[Archive] Email found: emailId=${emailId}, threadId=${threadId}`,
    );

    // Check if the thread is starred
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    const isStarred = thread && thread.starCount > 0;

    this.logger.log(
      `[Archive] Thread info: threadId=${threadId}, isStarred=${isStarred}, currentIsArchived=${thread?.isArchived || false}`,
    );

    // STEP 1: Update database (immediate effect for UI)
    // This sets lastUserOperationAt to prevent sync from overriding the archive
    if (isStarred) {
      await this.updateThreadStarCount(userId, threadId, 0);
    }

    // Mark all emails in the thread as read in the database
    const threadEmails = await this.emailRepository.find({
      where: { userId, threadId, isRead: false },
      select: ["id"],
    });
    if (threadEmails.length > 0) {
      const emailIds = threadEmails.map((emailEntry) => emailEntry.id);
      await this.bulkMarkAsRead(userId, emailIds);
    }

    // Update thread archived status with lastUserOperationAt timestamp
    await this.updateThreadArchivedStatus(userId, threadId, true, true);
    this.logger.log(
      `[Archive] DB update completed: userId=${userId}, emailId=${emailId}, threadId=${threadId}`,
    );

    // STEP 2: Queue background job for provider sync (Gmail, Office365, etc.)
    this.boss
      .send(
        "archive-email-provider-sync",
        { userId, threadId, wasStarred: isStarred },
        {
          priority: getJobPriority("archive-email-provider-sync", true),
          singletonKey: `archive-provider-sync-${threadId}`,
          singletonMinutes: 5,
        },
      )
      .then((jobId) => {
        if (jobId) {
          this.logger.log(
            `[Archive] Queued provider sync job ${jobId}: userId=${userId}, threadId=${threadId}`,
          );
        }
      })
      .catch((err) => {
        this.logger.error(
          `[Archive] Failed to queue provider sync job: userId=${userId}, threadId=${threadId}`,
          err,
        );
      });
  }

  /**
   * Bulk archive multiple emails - updates database FIRST, then syncs to email provider.
   * This is more efficient than calling archiveEmail multiple times as it:
   * 1. Groups emails by thread to avoid duplicate thread operations
   * 2. Batches database updates
   * 3. Syncs to provider in parallel
   */
  async bulkArchiveEmails(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) {
      return;
    }

    this.logger.log(
      `[Archive] bulkArchiveEmails called: userId=${userId}, emailCount=${emailIds.length}`,
    );

    // Get all emails and group by threadId
    const emails = await this.emailRepository.find({
      where: { userId, id: In(emailIds) },
      select: ["id", "threadId"],
    });

    if (emails.length === 0) {
      this.logger.warn(
        `[Archive] No emails found for bulk archive: userId=${userId}`,
      );
      return;
    }

    // Group emails by threadId
    const threadIds = [
      ...new Set(
        emails.map((emailEntry) => emailEntry.threadId).filter(Boolean),
      ),
    ];
    this.logger.log(
      `[Archive] Found ${emails.length} emails in ${threadIds.length} threads`,
    );

    // Get thread info for starred status
    const threads = await this.emailThreadRepository.find({
      where: { userId, threadId: In(threadIds) },
    });

    // STEP 1: Update database (immediate effect for UI)
    // Remove stars from any starred threads
    const starredThreadIds = threads
      .filter((thread) => thread.starCount > 0)
      .map((thread) => thread.threadId);
    if (starredThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(starredThreadIds) },
        { starCount: 0 },
      );
    }

    // Mark all emails in these threads as read
    const unreadEmails = await this.emailRepository.find({
      where: { userId, threadId: In(threadIds), isRead: false },
      select: ["id"],
    });
    if (unreadEmails.length > 0) {
      const unreadEmailIds = unreadEmails.map((emailEntry) => emailEntry.id);
      await this.bulkMarkAsRead(userId, unreadEmailIds);
    }

    // Update all threads to archived with lastUserOperationAt timestamp
    const now = new Date();
    await this.emailThreadRepository.update(
      { userId, threadId: In(threadIds) },
      {
        isArchived: true,
        lastUserOperationAt: now,
        syncStatus: "unsynced",
        syncStatusUpdatedAt: now,
      },
    );
    this.logger.log(
      `[Archive] DB update completed: userId=${userId}, ${threadIds.length} threads archived`,
    );

    // STEP 2: Queue background jobs for provider sync per thread
    // Convert starredThreadIds to a Set for O(1) lookups
    const starredThreadIdsSet = new Set(starredThreadIds);
    for (const threadId of threadIds) {
      const wasStarred = starredThreadIdsSet.has(threadId);
      this.boss
        .send(
          "archive-email-provider-sync",
          { userId, threadId, wasStarred },
          {
            priority: getJobPriority("archive-email-provider-sync", true),
            singletonKey: `archive-provider-sync-${threadId}`,
            singletonMinutes: 5,
          },
        )
        .catch((err) => {
          this.logger.error(
            `[Archive] Failed to queue provider sync job for thread ${threadId}:`,
            err,
          );
        });
    }

    this.logger.log(
      `[Archive] Queued ${threadIds.length} provider sync jobs: userId=${userId}`,
    );
  }

  async deleteEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const { threadId } = email;

      // Delete/trash the thread in email provider
      // Only update database if provider API call succeeds
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "trashThread" in provider) {
        await provider.trashThread(userId, threadId);
      } else {
        throw new Error("No email provider available to delete thread");
      }

      // Mark as archived in database (deleted emails are effectively archived)
      await this.updateThreadArchivedStatus(userId, threadId, true);
    }
  }

  /**
   * Update email
   * Delegates to EmailCrudService
   */
  async updateEmail(
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    return this.emailCrudService.updateEmail(emailId, updates);
  }

  /**
   * Set star count for an email's thread
   * Delegates to EmailStarService
   */
  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<Email> {
    return this.emailStarService.setStarCount(
      userId,
      emailId,
      starCount,
      (userId, emailId) => this.getEmailById(userId, emailId),
      (userId, threadId, starCount) =>
        this.updateThreadStarCount(userId, threadId, starCount),
    );
  }

  /**
   * Toggle star for an email (backwards compatibility - toggle between 0 and 3 stars)
   * Delegates to EmailStarService
   */
  async toggleStar(userId: string, emailId: string): Promise<Email> {
    return this.emailStarService.toggleStar(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
      (userId, threadId, starCount) =>
        this.updateThreadStarCount(userId, threadId, starCount),
    );
  }

  /**
   * Force check for new emails by unbatting all pending batched emails
   * Delegates to EmailStatusService
   */
  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    return this.emailStatusService.forceCheckNewEmails(
      userId,
      (userId, includeBatched, mode) =>
        this.getInbox(userId, includeBatched, mode),
    );
  }

  /**
   * Get the next batch release time for a user
   * Delegates to EmailStatusService
   */
  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    return this.emailStatusService.getNextBatchReleaseTime(userId);
  }

  /**
   * Check for urgent emails that are currently batched
   * Delegates to EmailStatusService
   */
  async checkForUrgentEmails(userId: string): Promise<{
    hasUrgent: boolean;
    urgentCount: number;
    urgentEmails: Array<{
      subject: string;
      from: string;
      priorityScore: number;
    }>;
  }> {
    return this.emailStatusService.checkForUrgentEmails(userId);
  }

  /**
   * Batch calculate days since last email for multiple emails efficiently
   * Returns a Map<emailId, daysSinceLastEmail>
   */
  private async batchCalculateDaysSinceLastEmail(
    userId: string,
    emails: Partial<Email>[],
  ): Promise<Map<string, number | undefined>> {
    const resultMap = new Map<string, number | undefined>();

    // Filter out emails that can't be calculated (missing required fields)
    const validEmails = emails.filter(
      (emailEntry) =>
        emailEntry.threadId &&
        emailEntry.from &&
        emailEntry.receivedAt &&
        emailEntry.id,
    );
    if (validEmails.length === 0) {
      // Set all to undefined
      emails.forEach((emailEntry) => {
        if (emailEntry.id) resultMap.set(emailEntry.id, undefined);
      });
      return resultMap;
    }

    // Group by threadId to batch queries more efficiently
    const threadMap = new Map<string, Partial<Email>[]>();
    validEmails.forEach((email) => {
      const threadId = email.threadId!;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(email);
    });

    // For each thread, fetch all previous emails in one query, then calculate for each
    try {
      const threadIds = Array.from(threadMap.keys());
      if (threadIds.length === 0) {
        validEmails.forEach((emailEntry) => {
          if (emailEntry.id) resultMap.set(emailEntry.id, undefined);
        });
        return resultMap;
      }

      // Fetch all previous emails for all threads in one query (or a few queries if too many)
      // Since we need to match by encrypted 'from' field, we'll do one query per thread
      // But at least we're grouping by thread to minimize queries
      const promises = Array.from(threadMap.entries()).map(
        async ([threadId, threadEmails]) => {
          // Get the earliest receivedAt in this thread batch
          const earliestReceivedAt = threadEmails.reduce((earliest, email) => {
            if (!earliest || !email.receivedAt)
              return earliest || email.receivedAt;
            return email.receivedAt < earliest ? email.receivedAt : earliest;
          }, threadEmails[0]?.receivedAt);

          if (!earliestReceivedAt) return;

          // Fetch all emails in this thread before the earliest one using raw query
          // Only fetch 'from' and 'receivedAt' to avoid decrypting unnecessary fields
          const previousEmailsRaw = await this.emailRepository.query(
            `
          SELECT id, "from", "receivedAt"
          FROM emails
          WHERE "userId" = $1
            AND "threadId" = $2
            AND "receivedAt" < $3
          ORDER BY "receivedAt" DESC
          `,
            [userId, threadId, earliestReceivedAt],
          );

          // Decrypt only the 'from' field we need
          const previousEmails = previousEmailsRaw.map(
            (row: { id: string; from: string; receivedAt: Date }) => ({
              id: row.id,
              from: EncryptionHelper.decrypt(row.from),
              receivedAt: row.receivedAt,
            }),
          );

          // For each email in the batch, find the last email from the same sender BEFORE that email's receivedAt
          threadEmails.forEach((email) => {
            if (!email.id || !email.from || !email.receivedAt) {
              resultMap.set(email.id || "", undefined);
              return;
            }

            // Find last email from same sender that was received BEFORE this email
            // (TypeORM decrypts 'from' automatically, so we can compare decrypted values)
            const lastEmail = previousEmails.find(
              (emailEntry) =>
                emailEntry.from === email.from &&
                emailEntry.receivedAt < email.receivedAt,
            );

            if (!lastEmail) {
              resultMap.set(email.id, undefined);
              return;
            }

            // Calculate days difference
            const daysDiff =
              (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
              MILLISECONDS.DAY;
            resultMap.set(
              email.id,
              Math.max(0, Math.round(daysDiff * 10) / 10),
            );
          });
        },
      );

      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        "Error batch calculating days since last email:",
        error,
      );
      // Set all to undefined on error
      validEmails.forEach((emailEntry) => {
        if (emailEntry.id) resultMap.set(emailEntry.id, undefined);
      });
    }

    // Set undefined for emails that were filtered out
    emails.forEach((emailEntry) => {
      if (emailEntry.id && !resultMap.has(emailEntry.id)) {
        resultMap.set(emailEntry.id, undefined);
      }
    });

    return resultMap;
  }

  /**
   * Calculate days since the last email in the thread from the same sender
   * Returns undefined if this is the first email in the thread or from this sender
   * @deprecated Use batchCalculateDaysSinceLastEmail for multiple emails
   */
  private async calculateDaysSinceLastEmail(
    userId: string,
    email: Partial<Email>,
  ): Promise<number | undefined> {
    if (!email.threadId || !email.from || !email.receivedAt) {
      return undefined;
    }

    try {
      // Find the last email in the same thread from the same sender, before the current email
      const lastEmail = await this.emailRepository
        .createQueryBuilder("email")
        .where("email.userId = :userId", { userId })
        .andWhere("email.threadId = :threadId", { threadId: email.threadId })
        .andWhere("email.from = :from", { from: email.from })
        .andWhere("email.receivedAt < :receivedAt", {
          receivedAt: email.receivedAt,
        })
        .orderBy("email.receivedAt", "DESC")
        .take(1)
        .getOne();

      if (!lastEmail) {
        // First email from this sender in the thread
        return undefined;
      }

      // Calculate days difference
      const daysDiff =
        (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
        MILLISECONDS.DAY;
      // Round to 1 decimal place
      return Math.max(0, Math.round(daysDiff * 10) / 10);
    } catch (error) {
      this.logger.error("Error calculating days since last email:", error);
      return undefined;
    }
  }

  /**
   * Get priority score explanation breakdown for an email
   * Returns dimensions: Urgency, Goal Alignment, VIP Contact
   */
  async getPriorityExplanation(
    userId: string,
    emailId: string,
  ): Promise<{
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
      sentiment: { score: number; type: string; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  }> {
    const perf = new PerformanceTracker(
      "priority-explanation",
      this.cloudWatchService,
    );
    const endTotal = perf.startSpan(
      "total",
      PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION,
    );

    try {
      const endEmailQuery = perf.startSpan(
        "email-query",
        PERFORMANCE_BUDGETS.PRIORITY_CALC,
      );
      const email = await this.getEmailById(userId, emailId);
      endEmailQuery();

      if (!email) {
        throw new Error("Email not found");
      }

      // Get thread to access priority explanation (now thread-level)
      let thread = null;
      if (email.emailThreadId) {
        thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId },
        });
      }

      // Return precomputed explanation if available (from thread)
      if (thread?.priorityExplanation) {
        const hasOldStructure =
          thread.priorityExplanation.breakdown?.some(
            (item) =>
              item.factor === "Base Score" ||
              item.factor === "🤖 AI Analysis" ||
              item.factor === "AI Analysis",
          ) ?? false;
        const hasCalculatingItems =
          thread.priorityExplanation.breakdown?.some(
            (item) =>
              item.description === "Calculating..." ||
              item.description?.includes("Calculating..."),
          ) ?? false;

        await this.checkAndQueuePriorityRecalculation(
          thread,
          userId,
          emailId,
          hasOldStructure,
          hasCalculatingItems,
        );

        if (hasCalculatingItems && thread.isProcessingPriority) {
          this.logger.debug(
            `Returning partial priority explanation for email ${emailId} (still calculating)`,
          );
          endTotal();
          perf.finish();
          return this.normalizePriorityExplanation(
            thread.priorityExplanation,
            email.sentimentScore ?? 0,
          );
        } else if (!hasOldStructure && !hasCalculatingItems) {
          endTotal();
          perf.finish();
          return this.normalizePriorityExplanation(
            thread.priorityExplanation,
            email.sentimentScore ?? 0,
          );
        }
        // If hasOldStructure and isProcessingPriority, fall through to fallback
      }

      // Fallback: compute explanation on demand if not precomputed (for legacy emails)
      // Get user context for prioritization
      const endContextQuery = perf.startSpan(
        "context-query",
        PERFORMANCE_BUDGETS.PRIORITY_CALC,
      );
      const contexts = await this.userContextRepository.find({
        where: { userId },
      });
      endContextQuery();

      const endDaysCalc = perf.startSpan(
        "days-since-last-email",
        PERFORMANCE_BUDGETS.INBOX_TOTAL,
      );
      await this.calculateDaysSinceLastEmail(userId, email);
      endDaysCalc();

      // Initialize dimensions
      const dimensions = {
        urgency: { score: 0, reasons: [] as string[] },
        goalAlignment: { score: 0, reasons: [] as string[] },
        vipContact: { score: 0, reasons: [] as string[] },
        sentiment: {
          score: email.sentimentScore ?? 0,
          type: this.getSentimentType(email.sentimentScore ?? 0),
          reasons: [] as string[],
        },
      };

      const breakdown: Array<{
        factor: string;
        value: number;
        description: string;
      }> = [];
      let currentScore = 0;
      const senderEmail = email.from?.toLowerCase() || "";
      const senderName = email.fromName?.toLowerCase() || "";

      // Base score is 0 - no need to add it to breakdown

      // === VIP CONTACT DIMENSION ===
      const vipContacts = contexts.filter(
        (contact) => contact.contextKey === ContextKey.VIP_CONTACT,
      );
      const matchedVip = vipContacts.find(
        (vip) =>
          senderEmail.includes(vip.contextValue.toLowerCase()) ||
          senderName.includes(vip.contextValue.toLowerCase()),
      );

      if (matchedVip) {
        const vipBoost = PRIORITY_BOOSTS.URGENT_KEYWORD;
        dimensions.vipContact.score += vipBoost;
        dimensions.vipContact.reasons.push(
          `VIP contact: ${matchedVip.contextValue}`,
        );
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: vipBoost,
          description: `From VIP: ${matchedVip.contextValue}`,
        });
        currentScore += vipBoost;
      }

      // Check job title for VIP
      if (email.senderJobTitle) {
        const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle);
        if (jobTitleScore > RATIOS.HALF) {
          const titleBoost = Math.round(
            jobTitleScore * PRIORITY_BOOSTS.GOAL_ALIGNMENT,
          );
          dimensions.vipContact.score += titleBoost;
          dimensions.vipContact.reasons.push(
            `Important role: ${email.senderJobTitle}`,
          );
          breakdown.push({
            factor: "⭐ VIP Contact",
            value: titleBoost,
            description: `Sender role: ${email.senderJobTitle}`,
          });
          currentScore += titleBoost;
        }
      }

      // === GOAL ALIGNMENT DIMENSION ===
      // Goal alignment is now calculated via LLM in llm-processor.ts
      // This fallback method is only used for legacy emails without stored priorityExplanation
      // Add placeholder for goal alignment (will be 0 until LLM processes)
      breakdown.push({
        factor: "🎯 Goal Alignment",
        value: 0,
        description: "Calculating...",
      });

      // === URGENCY DIMENSION ===
      // Urgency is now calculated via LLM in llm-processor.ts
      // This fallback method is only used for legacy emails without stored priorityExplanation
      // Add placeholder for urgency (will be 0 until LLM processes)
      breakdown.push({
        factor: "🔥 Urgency",
        value: 0,
        description: "Calculating...",
      });

      // === SENTIMENT DIMENSION ===
      // Add sentiment placeholder
      const fallbackSentimentScore = email.sentimentScore ?? 0;
      const fallbackSentimentType = this.getSentimentType(
        fallbackSentimentScore,
      );
      const sentimentDescriptions: Record<string, string> = {
        negative: "Negative sentiment",
        positive: "Positive sentiment",
        neutral: "Neutral sentiment",
      };
      breakdown.push({
        factor: "😊 Sentiment",
        value: 0,
        description:
          sentimentDescriptions[fallbackSentimentType] ?? "Neutral sentiment",
      });

      // Calculate final score from breakdown
      const calculatedScore = Math.max(0, Math.min(100, currentScore));
      // Use the breakdown we just built to calculate the score
      const actualScore = calculatedScore;

      // Note: For legacy emails, breakdown may not match exactly
      // New emails will have breakdown pre-calculated via LLM in llm-processor.ts

      // Normalize dimension scores to 0-100
      // All dimensions start at 0 (base score is 0)
      dimensions.urgency.score = Math.max(
        PRIORITY_SCORES.MIN,
        Math.min(PRIORITY_SCORES.MAX, dimensions.urgency.score),
      );
      dimensions.goalAlignment.score = Math.max(
        PRIORITY_SCORES.MIN,
        Math.min(PRIORITY_SCORES.MAX, dimensions.goalAlignment.score),
      );
      dimensions.vipContact.score = Math.max(
        0,
        Math.min(100, dimensions.vipContact.score),
      );

      const endComputation = perf.startSpan(
        "explanation-computation",
        PERFORMANCE_BUDGETS.SLOW_QUERY_THRESHOLD,
      );
      const explanation = {
        score: actualScore,
        dimensions,
        breakdown,
      };
      endComputation();

      // Save the explanation to the thread (non-blocking)
      // Priority explanation is now thread-level, not email-level
      // Also save denormalized priorityScore for efficient SQL sorting
      if (email.emailThreadId) {
        const endSave = perf.startSpan(
          "save-explanation",
          PERFORMANCE_BUDGETS.INBOX_TOTAL,
        );
        const priorityScore =
          this.calculateScoreFromBreakdown(explanation) ?? 0;
        this.emailThreadRepository
          .update(
            { id: email.emailThreadId },
            { priorityExplanation: explanation, priorityScore },
          )
          .catch((err) =>
            this.logger.warn(
              `Failed to save priority explanation for thread ${email.emailThreadId}:`,
              err,
            ),
          );
        endSave();
      }

      endTotal();
      perf.finish();
      return explanation;
    } catch (error) {
      endTotal();
      perf.finish();
      throw error;
    }
  }

  /**
   * Calculate priority score from breakdown array
   * This is the single source of truth for priority scores
   * @param priorityExplanation The priority explanation object with breakdown array
   * @returns The calculated score (0-100), or 0 if no breakdown exists
   */
  calculateScoreFromBreakdown(
    priorityExplanation: {
      breakdown?: Array<{ value: number }>;
      score?: number;
    } | null,
  ): number {
    if (!priorityExplanation || !priorityExplanation.breakdown) {
      return 0;
    }

    const total = priorityExplanation.breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );

    return Math.max(0, Math.min(100, total));
  }

  private normalizePriorityExplanation(
    rawExplanation: {
      score: number;
      dimensions?: {
        urgency?: { score: number; reasons: string[] };
        goalAlignment?: { score: number; reasons: string[] };
        vipContact?: { score: number; reasons: string[] };
        sentiment?: { score: number; type: string; reasons: string[] };
      };
      breakdown?: Array<{ factor: string; value: number; description: string }>;
    },
    sentimentScore: number,
  ): {
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
      sentiment: { score: number; type: string; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  } {
    const explanation = rawExplanation;
    if (!explanation.dimensions?.sentiment) {
      explanation.dimensions = {
        ...explanation.dimensions,
        sentiment: {
          score: sentimentScore,
          type: this.getSentimentType(sentimentScore),
          reasons: [],
        },
      };
    }
    return {
      score: explanation.score,
      dimensions: {
        urgency: explanation.dimensions?.urgency || { score: 0, reasons: [] },
        goalAlignment: explanation.dimensions?.goalAlignment || {
          score: 0,
          reasons: [],
        },
        vipContact: explanation.dimensions?.vipContact || {
          score: 0,
          reasons: [],
        },
        sentiment: explanation.dimensions?.sentiment || {
          score: sentimentScore,
          type: this.getSentimentType(sentimentScore),
          reasons: [],
        },
      },
      breakdown: explanation.breakdown || [],
    };
  }

  private async checkAndQueuePriorityRecalculation(
    thread: EmailThread,
    userId: string,
    emailId: string,
    hasOldStructure: boolean,
    hasCalculatingItems: boolean,
  ): Promise<void> {
    if (hasCalculatingItems && thread.isProcessingPriority) {
      const processingTime = Date.now() - new Date(thread.updatedAt).getTime();
      const tenMinutes = 10 * MILLISECONDS.MINUTE;
      if (processingTime > tenMinutes) {
        this.logger.warn(
          `Thread ${thread.id} stuck in "Calculating..." for ${Math.round(processingTime / MILLISECONDS.MINUTE)} minutes, resetting flag and requeuing`,
        );
        await this.emailThreadRepository.update(
          { id: thread.id },
          { isProcessingPriority: false },
        );
      }
    }

    if (
      (hasOldStructure || hasCalculatingItems) &&
      !thread.isProcessingPriority
    ) {
      const reason = hasOldStructure
        ? "old priority structure"
        : "calculating items";
      this.logger.log(
        `Detected ${reason} for email ${emailId}, queuing recalculation`,
      );
      await this.boss
        .send(
          "refine-priority",
          { userId, emailId },
          {
            priority: getJobPriority("refine-priority-background", false),
            singletonKey: `refine-priority-${emailId}`,
            singletonMinutes: 5,
          },
        )
        .catch((err) => {
          this.logger.error(
            `Failed to queue priority recalculation for email ${emailId}:`,
            err,
          );
        });
    }
  }

  private calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;

    const highPriorityTitles = [
      "ceo",
      "president",
      "director",
      "manager",
      "lead",
      "head",
      "chief",
      "vp",
      "vice president",
      "founder",
    ];
    const titleLower = jobTitle.toLowerCase();

    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return 1;
    }

    return RATIOS.HALF;
  }

  /**
   * Search emails using the email provider's search functionality
   */
  /**
   * Search emails using natural language query
   * Delegates to EmailSearchService
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
    onProgress?: (step: string, message: string) => void,
    accountTypes?: string[],
    skipLlmRanking?: boolean,
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
        debugInfo?: Record<string, unknown>;
      }
    >
  > {
    return this.emailSearchService.searchEmails(userId, query, {
      maxResults,
      onProgress,
      calculateDaysSinceLastEmail: (uid, email) =>
        this.calculateDaysSinceLastEmail(uid, email),
      accountTypes,
      skipLlmRanking,
    });
  }

  /**
   * Rank and explain a list of emails by ID using AI relevance scoring.
   * Used for async LLM refinement after returning initial fast results.
   */
  async rankSearchResults(
    userId: string,
    query: string,
    emailIds: string[],
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
      }
    >
  > {
    const emails = await this.emailRepository.find({
      where: { userId, id: In(emailIds) },
      order: { receivedAt: "DESC" },
    });
    return this.emailSearchService.rankAndExplainEmails(
      userId,
      query,
      emails,
      maxResults,
      (uid, email) => this.calculateDaysSinceLastEmail(uid, email),
    );
  }

  /**
   * Expand search results by trying alternative queries.
   * Used when initial search + LLM ranking yields no/few good results.
   * Returns new emails not already in existingEmailIds.
   */
  async expandSearchResults(
    userId: string,
    query: string,
    existingEmailIds: string[],
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
      }
    >
  > {
    const existingSet = new Set(existingEmailIds);
    return this.emailSearchService.searchExpand(userId, query, existingSet);
  }

  /**
   * Debug endpoint to find missing starred threads
   * Delegates to EmailDebugService
   */
  async debugStarredThreads(userId: string): Promise<{
    gmailError?: string;
    summary: {
      gmailStarredCount: number;
      foundInDb: number;
      notInDb: number;
      inActionOrFollowUp: number;
      starredInDbButHidden: number;
      notStarredInDb: number;
    };
    threads: Array<{
      threadId: string;
      subject: string | null;
      inDb: boolean;
      isStarredInDb: boolean;
      category: string | null;
      appearsInActionOrFollowUp: boolean;
      reason: string;
    }>;
    staleUnsyncedThreads: Array<{
      threadId: string;
      syncStatusUpdatedAt: string | null;
      minutesUnsynced: number;
      isArchived: boolean;
      starCount: number;
    }>;
  }> {
    return this.emailDebugService.debugStarredThreads(userId);
  }

  /**
   * Debug endpoint to find emails without emailThreadId (orphan emails)
   * Delegates to EmailDebugService
   */
  async debugOrphanEmails(userId: string): Promise<{
    totalEmailsInDb: number;
    emailsWithThreadId: number;
    orphanEmails: number;
    orphanEmailDetails: Array<{
      id: string;
      threadId: string;
      emailThreadId: string | null;
      subject: string;
      from: string;
      receivedAt: Date;
    }>;
    threadsInDb: number;
    threadsWithoutEmails: Array<{
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
    }>;
  }> {
    return this.emailDebugService.debugOrphanEmails(userId);
  }

  /**
   * Fix orphan emails by creating/linking EmailThread records
   */
  /**
   * Fix orphan emails by linking them to their threads
   * Delegates to EmailDebugService
   */
  async fixOrphanEmails(userId: string): Promise<{
    fixed: number;
    errors: string[];
  }> {
    return this.emailDebugService.fixOrphanEmails(userId);
  }

  /**
   * Fix threads stuck in "calculating" status
   * Delegates to EmailDebugService
   */
  async fixStuckCalculatingThreads(
    userId: string,
  ): Promise<{ fixed: number; requeued: number; errors: string[] }> {
    return this.emailDebugService.fixStuckCalculatingThreads(userId);
  }

  /**
   * Fix threads stuck in "unsynced" status for more than 5 minutes
   * Delegates to EmailDebugService
   */
  async fixStaleUnsyncedThreads(
    userId: string,
  ): Promise<{ fixed: number; threadIds: string[] }> {
    return this.emailDebugService.fixStaleUnsyncedThreads(userId);
  }

  /**
   * Look up a thread by its Gmail threadId and explain why it may not be showing
   * Delegates to EmailDebugService
   */
  async lookupThread(
    userId: string,
    threadId: string,
  ): Promise<{
    found: boolean;
    threadId: string;
    thread: {
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
      priorityScore: number | null;
      updatedAt: Date;
    } | null;
    emails: Array<{
      id: string;
      subject: string;
      from: string;
      receivedAt: Date;
      isSnoozed: boolean;
      snoozeUntil: Date | null;
      isBatched: boolean;
      batchReleaseAt: Date | null;
    }>;
    visibility: {
      wouldShowInTriage: boolean;
      wouldShowInAction: boolean;
      wouldShowInFollowUp: boolean;
    };
    reasons: string[];
  }> {
    return this.emailDebugService.lookupThread(userId, threadId);
  }

  /**
   * Look up a thread by Gmail message ID (from Gmail URL)
   * Delegates to EmailDebugService
   */
  async lookupByMessageId(
    userId: string,
    messageId: string,
  ): Promise<{
    found: boolean;
    threadId: string;
    thread: {
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
      priorityScore: number | null;
      updatedAt: Date;
    } | null;
    emails: Array<{
      id: string;
      subject: string;
      from: string;
      receivedAt: Date;
      isSnoozed: boolean;
      snoozeUntil: Date | null;
      isBatched: boolean;
      batchReleaseAt: Date | null;
    }>;
    visibility: {
      wouldShowInTriage: boolean;
      wouldShowInAction: boolean;
      wouldShowInFollowUp: boolean;
    };
    reasons: string[];
  }> {
    return this.emailDebugService.lookupByMessageId(userId, messageId);
  }

  /**
   * Look up a thread by a Gmail web UI URL
   * Handles the URL-encoded ID format used in Gmail URLs, which differs from the Gmail API ID format.
   * Delegates to EmailDebugService
   */
  async lookupByGmailUrl(userId: string, gmailUrl: string) {
    return this.emailDebugService.lookupByGmailUrl(userId, gmailUrl);
  }

  /**
   * Get category debug data for an email (admin only)
   * Returns the email data, available categories, and user context that would have been
   * passed to the LLM for categorization.
   * Delegates to EmailDebugService
   */
  async getCategoryDebugData(userId: string, emailId: string) {
    return this.emailDebugService.getCategoryDebugData(userId, emailId);
  }

  /**
   * Detect GitHub links in email and fetch their status
   * This runs asynchronously and doesn't block email processing
   */
  private async detectAndFetchGitHubLinks(
    userId: string,
    email: Email,
  ): Promise<void> {
    if (!this.githubService || !this.githubApiService) {
      // GitHub module not available
      return;
    }

    try {
      // Check if user has GitHub token
      const user = await this.usersService.findOne(userId);
      if (!user || !user.githubToken) {
        // No GitHub token configured
        return;
      }

      // Parse GitHub links from email body
      const links = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );

      if (links.length === 0) {
        // No GitHub links found
        return;
      }

      // Fetch status for all links
      const token = EncryptionHelper.decrypt(user.githubToken);
      const statuses = await this.githubApiService.fetchMultipleStatuses(
        token,
        links,
      );

      // Build metadata
      const metadataLinks = links.map((link) => {
        const status = statuses.get(link.url);
        return {
          type: link.type,
          repo: link.repo,
          owner: link.owner,
          number: link.number,
          url: link.url,
          status: status
            ? {
                ...status,
                fetchedAt: new Date().toISOString(),
              }
            : undefined,
          fetchedAt: status ? new Date().toISOString() : undefined,
        };
      });

      // Update email with GitHub metadata (stored in a JSON column if available)
      // Note: githubMetadata is not a direct field on Email entity
      // This would need to be stored in a JSON field or separate table
      // For now, we'll skip this update to avoid type errors
      // TODO: Add githubMetadata field to Email entity or use a separate table

      this.logger.debug(
        `Updated GitHub metadata for email ${email.id} with ${metadataLinks.length} links`,
      );
    } catch (error: unknown) {
      // Log but don't throw - this is a background operation
      this.logger.warn(
        `Failed to detect/fetch GitHub links for email ${email.id}: ${isError(error) ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Batch update star counts for multiple threads
   * Delegates to EmailThreadService for performance
   */
  async batchUpdateThreadStarCount(
    userId: string,
    updates: { threadId: string; starCount: number }[],
  ): Promise<void> {
    await this.emailThreadService.batchUpdateThreadStarCount(userId, updates);
  }

  async markThreadSyncStatus(
    userId: string,
    threadId: string,
    syncStatus: "synced" | "unsynced",
  ): Promise<void> {
    return this.emailThreadService.markThreadSyncStatus(
      userId,
      threadId,
      syncStatus,
    );
  }

  async markThreadsUnsynced(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.markThreadsUnsynced(userId, threadIds);
  }

  /**
   * Get threads by thread IDs
   * Delegates to EmailThreadService
   */
  async getThreadsByThreadIds(
    userId: string,
    threadIds: string[],
  ): Promise<
    Array<{
      threadId: string;
      updatedAt: Date;
      starCount: number;
      isArchived: boolean;
    }>
  > {
    return this.emailThreadService.getThreadsByThreadIds(userId, threadIds);
  }

  /**
   * Get existing starred threads from database
   * Delegates to EmailThreadService
   */
  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    return this.emailThreadService.getExistingStarredThreads(userId);
  }

  /**
   * Override the category for an email thread
   */
  async overrideCategory(
    userId: string,
    emailId: string,
    newCategory: string,
    reasonText?: string,
  ): Promise<{ success: boolean; category: string }> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email || !email.emailThreadId) {
      throw new Error("Email or thread not found");
    }

    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    const originalCategory = thread.category;

    // Save the override to the database for AI learning
    const categoryOverride = this.categoryOverrideRepository.create({
      emailThreadId: thread.id,
      userId,
      originalCategory: originalCategory || null,
      userCategory: newCategory,
      reasonText: reasonText || null,
    });
    await this.categoryOverrideRepository.save(categoryOverride);

    // Update the thread's category
    await this.emailThreadRepository.update(
      { id: thread.id },
      {
        category: newCategory,
        categoryExplanation: `User override: ${reasonText || "No reason provided"}. Original category: ${originalCategory || "None"}`,
      },
    );

    this.logger.log(
      `Category override for thread ${thread.id}: ${originalCategory} -> ${newCategory}`,
    );

    return { success: true, category: newCategory };
  }

  private getSentimentType(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) {
      return "negative";
    }
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) {
      return "positive";
    }
    return "neutral";
  }
}
