import { Injectable } from "@nestjs/common";
import { In } from "typeorm";

import {
  EMAIL_PROVIDER_TYPES,
  type EmailProviderType,
} from "../constants/domain-types";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { STAR_COUNTS } from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { decryptEmailEntityForApi } from "../encryption/entity-api-decrypt.util";
import { EmailServiceDeps } from "./email-service-dependencies.provider";

type EmailAttachmentMeta = NonNullable<Email["attachments"]>[number];

/**
 * Same hardening as GET /emails/:id — attachments may be ciphertext strings (partial
 * hydration) or legacy non-array JSON; both break `.find()` on download.
 */
function normaliseEmailAttachmentsList(raw: unknown): EmailAttachmentMeta[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as EmailAttachmentMeta[];
  if (typeof raw === "object" && raw !== null && "attachmentId" in raw) {
    return [raw as EmailAttachmentMeta];
  }
  return [];
}
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
 *
 * Dependencies are grouped via EmailServiceDeps to stay within max-params limits.
 * See issue #939 for details.
 */
@Injectable()
export class EmailsService {
  constructor(private readonly emailServiceDeps: EmailServiceDeps) {}

  // ── Priority batch buffer ─────────────────────────────────────────────────

  async queueBatchPriorityRefinement(
    userId: string,
    emailId: string,
  ): Promise<void> {
    return this.emailServiceDeps.emailLifecycleService.queueBatchPriorityRefinement(
      userId,
      emailId,
    );
  }

  // ── Categories & accounts ──────────────────────────────────────────────────

  async getCategories(userId: string): Promise<string[]> {
    return this.emailServiceDeps.emailStatusService.getCategories(userId);
  }

  async getPriorityCounts(
    userId: string,
    mode: "triage" | "action" | "follow-up" = "triage",
  ): Promise<{
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
    unprioritised: number;
  }> {
    return this.emailServiceDeps.emailStatusService.getPriorityCounts(
      userId,
      mode,
    );
  }

  async getPrioritisationStatus(userId: string): Promise<{
    totalThreads: number;
    prioritisedCount: number;
    unprioritisedCount: number;
    isAnalysisRunning: boolean;
  }> {
    return this.emailServiceDeps.emailStatusService.getPrioritisationStatus(
      userId,
    );
  }

  async getPriorityDebugInfo(userId: string) {
    return this.emailServiceDeps.emailStatusService.getPriorityDebugInfo(
      userId,
    );
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
    return this.emailServiceDeps.emailStatusService.getConnectedAccounts(
      userId,
    );
  }

  /**
   * Provider types ("gmail" | "office365" | "zoho") the user actually searches
   * across — resolved via the same EmailProviderManager source the search uses
   * (provider.isConnected), NOT the google_accounts/office365_accounts tables.
   *
   * Routing decisions (e.g. instant vs legacy search) must use this so they
   * agree with what the search actually queries. The account tables can disagree
   * with isConnected for SSO-login / token-only connections.
   */
  async getConnectedProviderTypes(userId: string): Promise<string[]> {
    const providerTypes = [
      EMAIL_PROVIDER_TYPES.GMAIL,
      EMAIL_PROVIDER_TYPES.OFFICE365,
      EMAIL_PROVIDER_TYPES.ZOHO,
    ];
    const results = await Promise.all(
      providerTypes.map(async (type) => {
        const provider =
          await this.emailServiceDeps.emailProviderManager.getProvider(
            userId,
            type,
          );
        return provider ? type : null;
      }),
    );
    return results.filter((type): type is EmailProviderType => type !== null);
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
    return this.emailServiceDeps.emailInboxService.getInboxSummary(
      userId,
      mode,
      filters,
    );
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
      /** Filter by assignee userId, or "unassigned" for threads with no assignee. */
      assigneeId?: string;
    },
    pagination?: { offset?: number; limit?: number },
  ): Promise<{ emails: Email[]; total: number; hasMore: boolean }> {
    return this.emailServiceDeps.emailInboxService.getInbox({
      userId,
      includeBatched: _includeBatched,
      mode,
      filters,
      pagination,
      fixStuckCalculatingThreads: (uid) => this.fixStuckCalculatingThreads(uid),
    });
  }

  // ── Single email lookups ───────────────────────────────────────────────────

  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailServiceDeps.emailCrudService.getEmailById(userId, emailId);
  }

  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailServiceDeps.emailCrudService.getEmailByMessageId(
      userId,
      messageId,
    );
  }

  async getGmailStarStatus(userId: string, emailId: string) {
    return this.emailServiceDeps.emailGmailService.getGmailStarStatus(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
    );
  }

  async getGmailLabels(userId: string, emailId: string) {
    return this.emailServiceDeps.emailGmailService.getGmailLabels(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
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
    if (!email) throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    decryptEmailEntityForApi(email);
    const attachmentsList = normaliseEmailAttachmentsList(email.attachments);
    if (attachmentsList.length === 0)
      throw new Error("Email has no attachments");
    const attachment = attachmentsList.find(
      (att) => att.attachmentId === attachmentId,
    );
    if (!attachment) throw new Error("Attachment not found in email");
    // Inline attachments (e.g. text/calendar parts with no Gmail attachment ID)
    // store their content directly in inlineData. Return it without a provider call.
    if (typeof attachment.inlineData === "string") {
      return {
        attachmentBuffer: Buffer.from(attachment.inlineData, "base64url"),
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      };
    }
    const provider =
      await this.emailServiceDeps.emailProviderManager.getPrimaryProvider(
        userId,
      );
    if (!provider) throw new Error(ERROR_MESSAGES.NO_EMAIL_PROVIDER);
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
    return this.emailServiceDeps.emailThreadService.getThreadEmails(
      userId,
      threadId,
      options,
    );
  }

  async getThreadIdsByReceivedRange(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
  ): Promise<string[]> {
    return this.emailServiceDeps.emailThreadService.getThreadIdsByReceivedRange(
      userId,
      after,
      before,
      limit,
    );
  }

  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS.WEEK,
  ): Promise<string[]> {
    return this.emailServiceDeps.emailThreadService.getRecentNonArchivedThreadIds(
      userId,
      days,
    );
  }

  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    return this.emailServiceDeps.emailThreadService.getAllNonArchivedThreadIds(
      userId,
    );
  }

  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = QUERY_LIMITS.INBOX_PAGE_SIZE,
  ): Promise<string[]> {
    return this.emailServiceDeps.emailThreadService.getNonArchivedThreadsNeedingCheck(
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
    const results = await this.emailServiceDeps.emailThreadRepository
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
    return this.emailServiceDeps.emailThreadService.updateThreadArchivedStatus(
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
    return this.emailServiceDeps.emailThreadService.updateThreadsLastCheckedAt(
      userId,
      threadIds,
    );
  }

  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    return this.emailServiceDeps.emailThreadService.batchUpdateThreadArchivedStatuses(
      userId,
      updates,
    );
  }

  async updateThreadStarCount(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    return this.emailServiceDeps.emailThreadService.updateThreadStarCount(
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
    return this.emailServiceDeps.emailThreadService.batchUpdateThreadStatus(
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
    return this.emailServiceDeps.emailThreadService.getOrCreateEmailThread(
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
    return this.emailServiceDeps.emailThreadService.batchUpdateThreadStarCount(
      userId,
      updates,
    );
  }

  async markThreadSyncStatus(
    userId: string,
    threadId: string,
    syncStatus: "synced" | "unsynced",
  ): Promise<void> {
    return this.emailServiceDeps.emailThreadService.markThreadSyncStatus(
      userId,
      threadId,
      syncStatus,
    );
  }

  async markThreadsUnsynced(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    return this.emailServiceDeps.emailThreadService.markThreadsUnsynced(
      userId,
      threadIds,
    );
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
    return this.emailServiceDeps.emailThreadService.getThreadsByThreadIds(
      userId,
      threadIds,
    );
  }

  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    return this.emailServiceDeps.emailThreadService.getExistingStarredThreads(
      userId,
    );
  }

  // ── Email creation & lifecycle ─────────────────────────────────────────────

  async createEmail(
    userId: string,
    emailData: EmailDataWithOptionalThreadProps,
    options?: { skipBatching?: boolean; countTowardVolume?: boolean },
  ): Promise<Email> {
    return this.emailServiceDeps.emailLifecycleService.createEmail(
      userId,
      emailData,
      options,
      (uid, eid) => this.queueBatchPriorityRefinement(uid, eid),
    );
  }

  async updateEmail(
    userId: string,
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    return this.emailServiceDeps.emailCrudService.updateEmail(
      userId,
      emailId,
      updates,
    );
  }

  // ── Read / unread ──────────────────────────────────────────────────────────

  async markAsRead(userId: string, emailId: string): Promise<Email> {
    return this.emailServiceDeps.emailReadService.markAsRead(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
    );
  }

  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    return this.emailServiceDeps.emailReadService.markAsUnread(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
    );
  }

  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    return this.emailServiceDeps.emailReadService.bulkMarkAsRead(
      userId,
      emailIds,
    );
  }

  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    return this.emailServiceDeps.emailReadService.bulkMarkAsUnread(
      userId,
      emailIds,
    );
  }

  // ── Stars ──────────────────────────────────────────────────────────────────

  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<Email> {
    return this.emailServiceDeps.emailStarService.setStarCount(
      userId,
      emailId,
      starCount,
      (uid, eid) => this.getEmailById(uid, eid),
      (uid, tid, sc) => this.updateThreadStarCount(uid, tid, sc),
    );
  }

  async toggleStar(userId: string, emailId: string): Promise<Email> {
    return this.emailServiceDeps.emailStarService.toggleStar(
      userId,
      emailId,
      (uid, eid) => this.getEmailById(uid, eid),
      (uid, tid, sc) => this.updateThreadStarCount(uid, tid, sc),
    );
  }

  // ── Archive & delete ───────────────────────────────────────────────────────

  async archiveEmail(userId: string, emailId: string): Promise<void> {
    return this.emailServiceDeps.emailArchiveService.archiveEmail(
      userId,
      emailId,
    );
  }

  async bulkArchiveEmails(userId: string, emailIds: string[]): Promise<void> {
    return this.emailServiceDeps.emailArchiveService.bulkArchiveEmails(
      userId,
      emailIds,
    );
  }

  async deleteEmail(userId: string, emailId: string): Promise<void> {
    return this.emailServiceDeps.emailArchiveService.deleteEmail(
      userId,
      emailId,
    );
  }

  async overrideCategory(
    userId: string,
    emailId: string,
    newCategory: string,
    reasonText?: string,
    categoryId?: string,
  ): Promise<{ success: boolean; category: string }> {
    return this.emailServiceDeps.emailArchiveService.overrideCategory(
      userId,
      emailId,
      newCategory,
      reasonText,
      categoryId,
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
    return this.emailServiceDeps.emailPriorityExplanationService.getPriorityExplanation(
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
    return this.emailServiceDeps.emailPriorityExplanationService.calculateScoreFromBreakdown(
      priorityExplanation,
    );
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getSyncStatus(
    userId: string,
  ): Promise<{ lastSyncAt: Date | null; isSyncing: boolean }> {
    return this.emailServiceDeps.emailStatusService.getSyncStatus(userId);
  }

  async getSyncHistory(userId: string, limit?: number) {
    return this.emailServiceDeps.emailDebugService.getSyncHistory(
      userId,
      limit,
    );
  }

  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    return this.emailServiceDeps.emailStatusService.forceCheckNewEmails(
      userId,
      (uid, inc, mode) => this.getInbox(uid, inc, mode),
    );
  }

  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    return this.emailServiceDeps.emailStatusService.getNextBatchReleaseTime(
      userId,
    );
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
    return this.emailServiceDeps.emailStatusService.checkForUrgentEmails(
      userId,
    );
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  async searchEmails(
    userId: string,
    query: string,
    options: {
      maxResults?: number;
      onProgress?: (step: string, message: string) => void;
      accountTypes?: string[];
      skipLlmRanking?: boolean;
      skipLlmFallback?: boolean;
      skipSync?: boolean;
    } = {},
  ) {
    const {
      maxResults = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
      onProgress,
      accountTypes,
      skipLlmRanking,
      skipLlmFallback,
      skipSync,
    } = options;
    return this.emailServiceDeps.emailSearchService.searchEmails(
      userId,
      query,
      {
        maxResults,
        onProgress,
        calculateDaysSinceLastEmail: (uid, email) =>
          this.emailServiceDeps.emailPriorityExplanationService.calculateDaysSinceLastEmail(
            uid,
            email,
          ),
        accountTypes,
        skipLlmRanking,
        skipLlmFallback,
        skipSync,
      },
    );
  }

  async rankSearchResults(
    userId: string,
    query: string,
    emailIds: string[],
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
  ) {
    const emails = await this.emailServiceDeps.emailRepository.find({
      where: { userId, id: In(emailIds) },
      order: { receivedAt: "DESC" },
    });
    return this.emailServiceDeps.emailSearchService.rankAndExplainEmails(
      userId,
      query,
      emails,
      maxResults,
      (uid, email) =>
        this.emailServiceDeps.emailPriorityExplanationService.calculateDaysSinceLastEmail(
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
    return this.emailServiceDeps.emailSearchService.searchExpand(
      userId,
      query,
      new Set(existingEmailIds),
    );
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  async debugStarredThreads(userId: string) {
    return this.emailServiceDeps.emailDebugService.debugStarredThreads(userId);
  }

  async debugOrphanEmails(userId: string) {
    return this.emailServiceDeps.emailDebugService.debugOrphanEmails(userId);
  }

  async fixOrphanEmails(userId: string) {
    return this.emailServiceDeps.emailDebugService.fixOrphanEmails(userId);
  }

  async fixStuckCalculatingThreads(userId: string) {
    return this.emailServiceDeps.emailDebugService.fixStuckCalculatingThreads(
      userId,
    );
  }

  async fixStaleUnsyncedThreads(userId: string) {
    return this.emailServiceDeps.emailDebugService.fixStaleUnsyncedThreads(
      userId,
    );
  }

  async lookupThread(userId: string, threadId: string) {
    return this.emailServiceDeps.emailDebugService.lookupThread(
      userId,
      threadId,
    );
  }

  async lookupByMessageId(userId: string, messageId: string) {
    return this.emailServiceDeps.emailDebugService.lookupByMessageId(
      userId,
      messageId,
    );
  }

  async lookupByGmailUrl(userId: string, gmailUrl: string) {
    return this.emailServiceDeps.emailDebugService.lookupByGmailUrl(
      userId,
      gmailUrl,
    );
  }

  async getCategoryDebugData(
    userId: string,
    emailId: string,
    options?: { deep?: boolean },
  ) {
    return this.emailServiceDeps.emailDebugService.getCategoryDebugData(
      userId,
      emailId,
      options,
    );
  }
}
