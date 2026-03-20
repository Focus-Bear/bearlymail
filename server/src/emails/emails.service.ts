import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailArchiveService } from "./email-archive.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailInboxService } from "./email-inbox.service";
import { EmailLifecycleService } from "./email-lifecycle.service";
import { EmailPriorityExplanationService } from "./email-priority-explanation.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailSearchService } from "./email-search.service";
import { EmailStarService } from "./email-star.service";
import { EmailStatusService } from "./email-status.service";
import { EmailThreadService } from "./email-thread.service";
import { EmailDataWithOptionalThreadProps } from "./interfaces/email-data.interface";

export { EmailDataWithOptionalThreadProps } from "./interfaces/email-data.interface";

/**
 * Thin facade — delegates all calls to focused sub-services.
 * Maintains the public API surface for external consumers.
 *
 * Business logic lives in:
 *   - EmailInboxService       — inbox queries, filtering, decryption
 *   - EmailLifecycleService   — creation, batch priority buffer, post-save jobs
 *   - EmailStatusService      — sync status, categories, priority counts, connected accounts
 *   - EmailArchiveService     — archive, bulk archive, delete, category override
 *   - EmailCrudService        — basic CRUD
 *   - EmailReadService        — mark read/unread
 *   - EmailStarService        — star operations
 *   - EmailThreadService      — thread-level queries and updates
 *   - EmailSearchService      — search and ranking
 *   - EmailPriorityExplanationService — priority score explanations
 *   - EmailMigrationService   — startup repair/backfill (OnModuleInit)
 *   - EmailDebugService       — debug helpers
 */
@Injectable()
export class EmailsService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private emailThreadService: EmailThreadService,
    private emailSearchService: EmailSearchService,
    private emailStarService: EmailStarService,
    private emailDebugService: EmailDebugService,
    private emailReadService: EmailReadService,
    private emailCrudService: EmailCrudService,
    private emailGmailService: EmailGmailService,
    private emailStatusService: EmailStatusService,
    private emailInboxService: EmailInboxService,
    private emailPriorityExplanationService: EmailPriorityExplanationService,
    private emailLifecycleService: EmailLifecycleService,
    private emailArchiveService: EmailArchiveService,
  ) {}

  // ── Priority batch buffer ─────────────────────────────────────────────────

  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    return this.emailLifecycleService.queueBatchPriorityRefinement(
      userId,
      emailId,
    );
  }

  // ── Categories & accounts ──────────────────────────────────────────────────

  async getCategories(userId: string): Promise<string[]> {
    return this.emailStatusService.getCategories(userId);
  }

  async getPriorityCounts(
    userId: string,
  ): Promise<{ high: number; medium: number; low: number }> {
    return this.emailStatusService.getPriorityCounts(userId);
  }

  async getConnectedAccounts(userId: string): Promise<
    Array<{
      id: string;
      email: string;
      provider: "gmail" | "office365" | "zoho";
      isPrimary: boolean;
      isActive: boolean;
    }>
  > {
    return this.emailStatusService.getConnectedAccounts(userId);
  }

  // ── Inbox ──────────────────────────────────────────────────────────────────

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
    return this.emailInboxService.getInboxSummary(userId, mode, filters);
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
  ): Promise<{ emails: Email[]; total: number; hasMore: boolean }> {
    return this.emailInboxService.getInbox(
      userId,
      _includeBatched,
      mode,
      filters,
      pagination,
      (uid) => this.fixStuckCalculatingThreads(uid),
    );
  }

  // ── Single email lookups ───────────────────────────────────────────────────

  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailCrudService.getEmailById(userId, emailId);
  }

  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailCrudService.getEmailByMessageId(userId, messageId);
  }

  async getGmailStarStatus(userId: string, emailId: string) {
    return this.emailGmailService.getGmailStarStatus(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
    );
  }

  async getGmailLabels(userId: string, emailId: string) {
    return this.emailGmailService.getGmailLabels(userId, emailId, (uid, eid) =>
      this.getEmailById(uid, eid),
    );
  }

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
    const email = await this.getEmailById(userId, emailId);
    if (!email) throw new Error("Email not found");
    if (!email.attachments || email.attachments.length === 0)
      throw new Error("Email has no attachments");
    const attachment = email.attachments.find(
      (att) => att.attachmentId === attachmentId,
    );
    if (!attachment) throw new Error("Attachment not found in email");
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) throw new Error("No email provider connected");
    return provider.getAttachment(userId, email.messageId, attachmentId, {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    });
  }

  // ── Thread operations ──────────────────────────────────────────────────────

  async getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]> {
    return this.emailThreadService.getThreadEmails(userId, threadId, options);
  }

  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS.WEEK,
  ): Promise<string[]> {
    return this.emailThreadService.getRecentNonArchivedThreadIds(userId, days);
  }

  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    return this.emailThreadService.getAllNonArchivedThreadIds(userId);
  }

  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = QUERY_LIMITS.INBOX_PAGE_SIZE,
  ): Promise<string[]> {
    return this.emailThreadService.getNonArchivedThreadsNeedingCheck(
      userId,
      limit,
    );
  }

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
      .limit(QUERY_LIMITS.INBOX_TOTAL)
      .getMany();
    return results
      .map((thread) => ({
        threadId: thread.threadId,
        isArchived: thread.isArchived,
        starCount: thread.starCount,
        syncStatus: thread.syncStatus,
      }))
      .filter((thread) => thread.threadId);
  }

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

  async updateThreadsLastCheckedAt(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.updateThreadsLastCheckedAt(
      userId,
      threadIds,
    );
  }

  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadArchivedStatuses(
      userId,
      updates,
    );
  }

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

  async batchUpdateThreadStarCount(
    userId: string,
    updates: { threadId: string; starCount: number }[],
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadStarCount(userId, updates);
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

  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    return this.emailThreadService.getExistingStarredThreads(userId);
  }

  // ── Email creation & lifecycle ─────────────────────────────────────────────

  async createEmail(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    options?: { skipBatching?: boolean },
  ): Promise<Email> {
    return this.emailLifecycleService.createEmail(
      userId,
      emailData,
      options,
      (uid, eid) => this.queueBatchPriorityRefinement(uid, eid),
    );
  }

  async updateEmail(
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    return this.emailCrudService.updateEmail(emailId, updates);
  }

  // ── Read / unread ──────────────────────────────────────────────────────────

  async markAsRead(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsRead(userId, emailId, (uid, eid) =>
      this.getEmailById(uid, eid),
    );
  }

  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsUnread(userId, emailId, (uid, eid) =>
      this.getEmailById(uid, eid),
    );
  }

  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsRead(userId, emailIds);
  }

  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsUnread(userId, emailIds);
  }

  // ── Stars ──────────────────────────────────────────────────────────────────

  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<Email> {
    return this.emailStarService.setStarCount(
      userId,
      emailId,
      starCount,
      (uid, eid) => this.getEmailById(uid, eid),
      (uid, tid, sc) => this.updateThreadStarCount(uid, tid, sc),
    );
  }

  async toggleStar(userId: string, emailId: string): Promise<Email> {
    return this.emailStarService.toggleStar(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
      (uid, tid, sc) => this.updateThreadStarCount(uid, tid, sc),
    );
  }

  // ── Archive & delete ───────────────────────────────────────────────────────

  async archiveEmail(userId: string, emailId: string): Promise<void> {
    return this.emailArchiveService.archiveEmail(userId, emailId);
  }

  async bulkArchiveEmails(userId: string, emailIds: string[]): Promise<void> {
    return this.emailArchiveService.bulkArchiveEmails(userId, emailIds);
  }

  async deleteEmail(userId: string, emailId: string): Promise<void> {
    return this.emailArchiveService.deleteEmail(userId, emailId);
  }

  async overrideCategory(
    userId: string,
    emailId: string,
    newCategory: string,
    reasonText?: string,
  ): Promise<{ success: boolean; category: string }> {
    return this.emailArchiveService.overrideCategory(
      userId,
      emailId,
      newCategory,
      reasonText,
    );
  }

  // ── Priority explanation ───────────────────────────────────────────────────

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
    return this.emailPriorityExplanationService.getPriorityExplanation(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
    );
  }

  calculateScoreFromBreakdown(
    priorityExplanation: {
      breakdown?: Array<{ value: number }>;
      score?: number;
    } | null,
  ): number {
    return this.emailPriorityExplanationService.calculateScoreFromBreakdown(
      priorityExplanation,
    );
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getSyncStatus(
    userId: string,
  ): Promise<{ lastSyncAt: Date | null; isSyncing: boolean }> {
    return this.emailStatusService.getSyncStatus(userId);
  }

  async getSyncHistory(userId: string, limit?: number) {
    return this.emailDebugService.getSyncHistory(userId, limit);
  }

  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    return this.emailStatusService.forceCheckNewEmails(
      userId,
      (uid, inc, mode) => this.getInbox(uid, inc, mode),
    );
  }

  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    return this.emailStatusService.getNextBatchReleaseTime(userId);
  }

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

  // ── Search ─────────────────────────────────────────────────────────────────

  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
    onProgress?: (step: string, message: string) => void,
    accountTypes?: string[],
    skipLlmRanking?: boolean,
    skipLlmFallback?: boolean,
    skipSync?: boolean,
  ) {
    return this.emailSearchService.searchEmails(userId, query, {
      maxResults,
      onProgress,
      calculateDaysSinceLastEmail: (uid, email) =>
        this.emailPriorityExplanationService.calculateDaysSinceLastEmail(
          uid,
          email,
        ),
      accountTypes,
      skipLlmRanking,
      skipLlmFallback,
      skipSync,
    });
  }

  async rankSearchResults(
    userId: string,
    query: string,
    emailIds: string[],
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
  ) {
    const emails = await this.emailRepository.find({
      where: { userId, id: In(emailIds) },
      order: { receivedAt: "DESC" },
    });
    return this.emailSearchService.rankAndExplainEmails(
      userId,
      query,
      emails,
      maxResults,
      (uid, email) =>
        this.emailPriorityExplanationService.calculateDaysSinceLastEmail(
          uid,
          email,
        ),
    );
  }

  async expandSearchResults(
    userId: string,
    query: string,
    existingEmailIds: string[],
  ) {
    return this.emailSearchService.searchExpand(
      userId,
      query,
      new Set(existingEmailIds),
    );
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  async debugStarredThreads(userId: string) {
    return this.emailDebugService.debugStarredThreads(userId);
  }

  async debugOrphanEmails(userId: string) {
    return this.emailDebugService.debugOrphanEmails(userId);
  }

  async fixOrphanEmails(userId: string) {
    return this.emailDebugService.fixOrphanEmails(userId);
  }

  async fixStuckCalculatingThreads(userId: string) {
    return this.emailDebugService.fixStuckCalculatingThreads(userId);
  }

  async fixStaleUnsyncedThreads(userId: string) {
    return this.emailDebugService.fixStaleUnsyncedThreads(userId);
  }

  async lookupThread(userId: string, threadId: string) {
    return this.emailDebugService.lookupThread(userId, threadId);
  }

  async lookupByMessageId(userId: string, messageId: string) {
    return this.emailDebugService.lookupByMessageId(userId, messageId);
  }

  async lookupByGmailUrl(userId: string, gmailUrl: string) {
    return this.emailDebugService.lookupByGmailUrl(userId, gmailUrl);
  }

  async getCategoryDebugData(userId: string, emailId: string) {
    return this.emailDebugService.getCategoryDebugData(userId, emailId);
  }
}
