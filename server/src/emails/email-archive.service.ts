import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { getJobPriority } from "../queue/job-priorities";
import { parseCategoryName } from "../utils/category-name.util";
import { EmailCrudService } from "./email-crud.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailThreadService } from "./email-thread.service";

/**
 * Handles archive, bulk archive, delete, and category override operations.
 * Extracted from EmailsService (Phase 4).
 */
@Injectable()
export class EmailArchiveService {
  private readonly logger = new Logger(EmailArchiveService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(CategoryOverride)
    private categoryOverrideRepository: Repository<CategoryOverride>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private emailCrudService: EmailCrudService,
    private emailThreadService: EmailThreadService,
    private emailReadService: EmailReadService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
  ) {}

  /**
   * Archive email — updates DB first, then queues provider sync.
   */
  async archiveEmail(userId: string, emailId: string): Promise<void> {
    this.logger.log(
      `[Archive] archiveEmail called: userId=${userId}, emailId=${emailId}`,
    );
    const email = await this.emailCrudService.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(
        `[Archive] Email not found: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }
    if (!email.threadId) {
      this.logger.warn(
        `[Archive] Email has no threadId: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error("Email has no threadId");
    }

    const { threadId } = email;
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });
    const isStarred = thread && thread.starCount > 0;

    this.logger.log(
      `[Archive] Thread info: threadId=${threadId}, isStarred=${isStarred}, currentIsArchived=${thread?.isArchived || false}`,
    );

    if (isStarred)
      await this.emailThreadService.updateThreadStarCount(userId, threadId, 0);

    const threadEmails = await this.emailRepository.find({
      where: { userId, threadId, isRead: false },
      select: {
        id: true,
      },
    });
    if (threadEmails.length > 0) {
      await this.emailReadService.bulkMarkAsRead(
        userId,
        threadEmails.map((threadEmail) => threadEmail.id),
      );
    }

    await this.emailThreadService.updateThreadArchivedStatus(
      userId,
      threadId,
      true,
      true,
    );
    this.logger.log(
      `[Archive] DB update completed: userId=${userId}, emailId=${emailId}, threadId=${threadId}`,
    );

    this.boss
      .send(
        JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC,
        { userId, threadId, wasStarred: isStarred },
        {
          priority: getJobPriority(JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC, true),
          singletonKey: `archive-provider-sync-${threadId}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      )
      .then((jobId) => {
        if (jobId)
          this.logger.log(
            `[Archive] Queued provider sync job ${jobId}: userId=${userId}, threadId=${threadId}`,
          );
      })
      .catch((err) =>
        this.logger.error(
          `[Archive] Failed to queue provider sync job: userId=${userId}, threadId=${threadId}`,
          err,
        ),
      );
  }

  /**
   * Bulk archive emails — updates DB first, then queues provider sync per thread.
   */
  async bulkArchiveEmails(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    this.logger.log(
      `[Archive] bulkArchiveEmails called: userId=${userId}, emailCount=${emailIds.length}`,
    );

    const emails = await this.emailRepository.find({
      where: { userId, id: In(emailIds) },
      select: {
        id: true,
        threadId: true,
      },
    });
    if (emails.length === 0) {
      this.logger.warn(
        `[Archive] No emails found for bulk archive: userId=${userId}`,
      );
      return;
    }

    const threadIds = [
      ...new Set(emails.map((email) => email.threadId).filter(Boolean)),
    ];
    this.logger.log(
      `[Archive] Found ${emails.length} emails in ${threadIds.length} threads`,
    );

    const threads = await this.emailThreadRepository.find({
      where: { userId, threadId: In(threadIds) },
    });
    const starredThreadIds = threads
      .filter((thread) => thread.starCount > 0)
      .map((thread) => thread.threadId);
    if (starredThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(starredThreadIds) },
        { starCount: 0 },
      );
    }

    const unreadEmails = await this.emailRepository.find({
      where: { userId, threadId: In(threadIds), isRead: false },
      select: {
        id: true,
      },
    });
    if (unreadEmails.length > 0) {
      await this.emailReadService.bulkMarkAsRead(
        userId,
        unreadEmails.map((unread) => unread.id),
      );
    }

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

    const starredSet = new Set(starredThreadIds);
    for (const threadId of threadIds) {
      this.boss
        .send(
          JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC,
          { userId, threadId, wasStarred: starredSet.has(threadId) },
          {
            priority: getJobPriority(
              JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC,
              true,
            ),
            singletonKey: `archive-provider-sync-${threadId}`,
            singletonSeconds: SECONDS.FIVE_MINUTES,
          },
        )
        .catch((err) =>
          this.logger.error(
            `[Archive] Failed to queue provider sync job for thread ${threadId}:`,
            err,
          ),
        );
    }
    this.logger.log(
      `[Archive] Queued ${threadIds.length} provider sync jobs: userId=${userId}`,
    );
  }

  /**
   * Archive a single thread by its EmailThread primary key (UUID).
   *
   * Unlike {@link archiveEmail} (which takes an email id), this takes the
   * thread's own id — the identifier the workflow engine carries in its
   * context. Mirrors the archive path: unstar, mark unread emails read, flag
   * archived, and queue the provider sync. No-op if the thread is missing or
   * already archived.
   */
  async archiveThreadById(
    userId: string,
    emailThreadId: string,
    options?: { viaWorkflow?: boolean },
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { id: emailThreadId, userId },
    });
    if (!thread || thread.isArchived) return;

    if (options?.viaWorkflow) {
      // Flag workflow archives so they surface in the Blocked view (mirrors
      // hasBlockedLabel for blocked-sender/keyword archives).
      await this.emailThreadRepository.update(
        { id: emailThreadId, userId },
        { archivedByWorkflow: true },
      );
    }

    const { threadId } = thread;
    const isStarred = thread.starCount > 0;
    if (isStarred)
      await this.emailThreadService.updateThreadStarCount(userId, threadId, 0);

    const unreadEmails = await this.emailRepository.find({
      where: { userId, threadId, isRead: false },
      select: { id: true },
    });
    if (unreadEmails.length > 0) {
      await this.emailReadService.bulkMarkAsRead(
        userId,
        unreadEmails.map((unread) => unread.id),
      );
    }

    await this.emailThreadService.updateThreadArchivedStatus(
      userId,
      threadId,
      true,
      true,
    );

    this.boss
      .send(
        JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC,
        { userId, threadId, wasStarred: isStarred },
        {
          priority: getJobPriority(JOB_NAMES.ARCHIVE_EMAIL_PROVIDER_SYNC, true),
          singletonKey: `archive-provider-sync-${threadId}`,
          singletonSeconds: SECONDS.FIVE_MINUTES,
        },
      )
      .catch((err) =>
        this.logger.error(
          `[Archive] Failed to queue provider sync for thread ${threadId}:`,
          err,
        ),
      );
  }

  /**
   * Delete/trash an email thread via provider, then mark archived in DB.
   */
  async deleteEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.emailCrudService.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const { threadId } = email;
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "trashThread" in provider) {
        await provider.trashThread(userId, threadId);
      } else {
        throw new Error("No email provider available to delete thread");
      }
      await this.emailThreadService.updateThreadArchivedStatus(
        userId,
        threadId,
        true,
      );
    }
  }

  /**
   * Override the category for an email thread.
   *
   * Fixes #1293, #1327: sets categoryId (UUID) only — the denormalized
   * category name column has been removed. The categoryId is resolved by
   * looking up the newCategory name in user_contexts (EMAIL_CATEGORY).
   */
  async overrideCategory(
    userId: string,
    emailId: string,
    newCategory: string,
    reasonText?: string,
    categoryId?: string,
  ): Promise<{ success: boolean; category: string }> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
    if (!email || !email.emailThreadId)
      throw new Error("Email or thread not found");

    const thread = await this.emailThreadRepository.findOne({
      where: { id: email.emailThreadId, userId },
    });
    if (!thread) throw new Error(ERROR_MESSAGES.THREAD_NOT_FOUND);

    // Fetch all email category contexts once — used for both new and original name resolution.
    const allCtxs = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextId: true,
        contextValue: true,
      },
    });
    for (const ctx of allCtxs) {
      decryptUserContextEntityForApi(ctx);
    }

    const resolveLocalCategoryName = (
      categoryId: string | null,
    ): string | null => {
      if (!categoryId) return null;
      const found = allCtxs.find((ctx) => ctx.contextId === categoryId);
      return found ? parseCategoryName(found.contextValue) : null;
    };

    // Resolve to a UUID for the DB update.
    // Fast path: caller provided categoryId directly (new client behaviour) — no name lookup needed.
    // Fallback: reverse-lookup by name in user_contexts (legacy / new custom categories).
    // "Other" → null categoryId (uncategorized).
    let newCategoryId: string | null = null;
    if (categoryId) {
      // UUID provided directly — use it and skip the fragile name lookup
      newCategoryId = categoryId;
    } else if (newCategory && newCategory !== "Other") {
      const matched = allCtxs.find(
        (ctx) =>
          parseCategoryName(ctx.contextValue).toLowerCase() ===
          newCategory.toLowerCase().trim(),
      );
      newCategoryId = matched?.contextId ?? null;
      if (!newCategoryId) {
        this.logger.warn(
          `overrideCategory: no user_contexts entry found for category "${newCategory}" (userId=${userId}) — setting categoryId=null`,
        );
      }
    }

    const originalCategoryId = thread.categoryId;
    // Resolve human-readable name for audit log — category_overrides.originalCategory is a text field.
    const originalCategoryName = resolveLocalCategoryName(originalCategoryId);

    const categoryOverride = this.categoryOverrideRepository.create({
      emailThreadId: thread.id,
      userId,
      originalCategory: originalCategoryName,
      userCategory: newCategory,
      reasonText: reasonText || null,
    });
    await this.categoryOverrideRepository.save(categoryOverride);

    await this.emailThreadRepository.update(
      { id: thread.id },
      {
        categoryId: newCategoryId,
        categoryExplanation: `User override: ${reasonText || "No reason provided"}. Original categoryId: ${originalCategoryId || "None"}`,
        // 'user' is the top-ranked categorySource: the precedence guard stops
        // every automated writer (rule/local/LLM/proto promotion) from moving
        // a category the user set by hand — including an explicit "Other".
        categorySource: "user" as const,
      },
    );

    this.logger.log(
      `Category override for thread ${thread.id}: categoryId ${originalCategoryId} -> ${newCategoryId} (name: ${newCategory})`,
    );
    return { success: true, category: newCategory };
  }
}
