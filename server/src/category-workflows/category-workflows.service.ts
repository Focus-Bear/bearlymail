import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import {
  CATEGORY_ARCHIVE_SUGGESTION_STATE,
  CategoryArchiveStat,
} from "../database/entities/category-archive-stat.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailArchiveService } from "../emails/email-archive.service";
import { parseCategoryName } from "../utils/category-name.util";
import {
  ArchiveAllResult,
  CategoryArchiveSuggestion,
} from "./category-workflows.types";

/**
 * Number of consecutive "blind" archive-alls (unread AND untouched) in a
 * category before we suggest an auto-archive workflow for it.
 */
export const ARCHIVE_ALL_SUGGESTION_THRESHOLD = 3;

/**
 * Tracks how often a user bulk-archives a whole category without engaging with
 * the emails, and — once that crosses the threshold — suggests an auto-archive
 * workflow for the category. Part of feature: category auto-archive workflows.
 */
@Injectable()
export class CategoryWorkflowsService {
  private readonly logger = new Logger(CategoryWorkflowsService.name);

  constructor(
    @InjectRepository(CategoryArchiveStat)
    private readonly statRepo: Repository<CategoryArchiveStat>,
    @InjectRepository(Email)
    private readonly emailRepo: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly threadRepo: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private readonly userContextRepo: Repository<UserContext>,
    private readonly emailArchiveService: EmailArchiveService,
  ) {}

  /**
   * Archive every email in a category "archive all" action, then update the
   * blind-archive counter. Returns whether we should suggest an auto-archive
   * workflow for the category.
   *
   * Blindness is computed BEFORE archiving (archiving marks emails read).
   */
  async archiveAllInCategory(
    userId: string,
    emailIds: string[],
  ): Promise<ArchiveAllResult> {
    if (emailIds.length === 0) {
      return { archived: 0, suggestion: null };
    }

    const emails = await this.emailRepo.find({
      where: { userId, id: In(emailIds) },
      select: { id: true, isRead: true, emailThreadId: true },
    });

    const threadPks = [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ] as string[];
    const threads =
      threadPks.length > 0
        ? await this.threadRepo.find({
            where: { id: In(threadPks), userId },
            select: {
              id: true,
              categoryId: true,
              starCount: true,
              isSnoozed: true,
            },
          })
        : [];

    const blind = this.isBlindArchiveAll(emails, threads);
    const categoryId = this.resolveSingleCategoryId(threads);

    // Archive first — this is the user's primary intent regardless of tracking.
    await this.emailArchiveService.bulkArchiveEmails(userId, emailIds);

    // Only categories (not "Other"/uncategorized) can be scoped by a workflow.
    if (!categoryId) {
      return { archived: emails.length, suggestion: null };
    }

    // Tracking is best-effort: the emails are already archived, so a stats
    // failure must not fail the request (which would make the client revert
    // the optimistic archive even though it succeeded server-side).
    try {
      const stat = await this.upsertAfterArchiveAll(userId, categoryId, blind);
      const suggestion = await this.buildSuggestion(userId, categoryId, stat);
      return { archived: emails.length, suggestion };
    } catch (error) {
      this.logger.error(
        `Failed to update archive stats for category ${categoryId}`,
        error as Error,
      );
      return { archived: emails.length, suggestion: null };
    }
  }

  /**
   * Record the user's response ("accepted" — they created the workflow — or
   * "dismissed") so we stop suggesting for this category.
   */
  async respondToSuggestion(
    userId: string,
    categoryId: string,
    response: "accepted" | "dismissed",
  ): Promise<void> {
    const stat = await this.getOrCreateStat(userId, categoryId);
    stat.suggestionState = response;
    await this.statRepo.save(stat);
  }

  /**
   * A batch is a "blind" archive-all only if NOT a single email was read and
   * NOT a single thread was starred or snoozed — i.e. the user never engaged.
   */
  private isBlindArchiveAll(
    emails: Pick<Email, "isRead">[],
    threads: Pick<EmailThread, "starCount" | "isSnoozed">[],
  ): boolean {
    const anyRead = emails.some((email) => email.isRead);
    const anyActioned = threads.some(
      (thread) => thread.starCount > 0 || thread.isSnoozed === true,
    );
    return !anyRead && !anyActioned;
  }

  /** Returns the category id shared by all threads, or null if mixed/none. */
  private resolveSingleCategoryId(
    threads: Pick<EmailThread, "categoryId">[],
  ): string | null {
    const categoryIds = [
      ...new Set(threads.map((thread) => thread.categoryId).filter(Boolean)),
    ] as string[];
    return categoryIds.length === 1 ? categoryIds[0] : null;
  }

  private async upsertAfterArchiveAll(
    userId: string,
    categoryId: string,
    blind: boolean,
  ): Promise<CategoryArchiveStat> {
    const stat = await this.getOrCreateStat(userId, categoryId);
    // Engaging with the category resets the streak; a blind sweep extends it.
    stat.blindArchiveAllCount = blind ? stat.blindArchiveAllCount + 1 : 0;
    stat.lastArchiveAllAt = new Date();
    return this.statRepo.save(stat);
  }

  private async buildSuggestion(
    userId: string,
    categoryId: string,
    stat: CategoryArchiveStat,
  ): Promise<CategoryArchiveSuggestion | null> {
    const shouldSuggest =
      stat.suggestionState === CATEGORY_ARCHIVE_SUGGESTION_STATE.NONE &&
      stat.blindArchiveAllCount >= ARCHIVE_ALL_SUGGESTION_THRESHOLD;
    if (!shouldSuggest) return null;

    const categoryName = await this.resolveCategoryName(userId, categoryId);
    if (!categoryName) return null;

    this.logger.log(
      `Suggesting auto-archive workflow for category ${categoryId} (user ${userId}, ${stat.blindArchiveAllCount} blind archive-alls)`,
    );
    return { categoryId, categoryName };
  }

  private async getOrCreateStat(
    userId: string,
    categoryId: string,
  ): Promise<CategoryArchiveStat> {
    const existing = await this.statRepo.findOne({
      where: { userId, categoryId },
    });
    if (existing) return existing;
    return this.statRepo.create({
      userId,
      categoryId,
      blindArchiveAllCount: 0,
      suggestionState: CATEGORY_ARCHIVE_SUGGESTION_STATE.NONE,
      lastArchiveAllAt: null,
    });
  }

  private async resolveCategoryName(
    userId: string,
    categoryId: string,
  ): Promise<string | null> {
    const context = await this.userContextRepo.findOne({
      where: {
        contextId: categoryId,
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    });
    if (!context) return null;
    return parseCategoryName(context.contextValue);
  }
}
