import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { parseCategoryName } from "../utils/category-name.util";
import {
  AutoResponseLogPriority,
  EmailClassification,
  QASearchResult,
} from "./types/auto-responder.types";

type AutoRespondedThread = {
  id: string;
  threadId: string;
  emailThreadId: string;
  from: string;
  fromName: string | null;
  subject: string;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil: Date | null;
  receivedAt: Date;
  summary: string | null;
  isProcessingSummary: boolean;
  priorityScore: number | null;
  priorityExplanation: Record<string, unknown> | null;
  isProcessingPriority: boolean;
  urgencyScore: number | null;
  category: string;
  categoryExplanation: string | null;
  protoCategoryName: string | null;
  protoCategoryDescription: string | null;
  starCount: number;
  isArchived: boolean;
  threadUpdatedAt: Date;
  labels: string[];
  githubMetadata: Record<string, unknown> | null;
  correspondentEmail: string | null;
  correspondentName: string | null;
  autoRespondedAt: Date | null;
  autoResponseCount: number;
};

type AutoRespondedThreadFilters = {
  categories?: string[];
  minPriority?: number;
  maxPriority?: number;
  accountIds?: string[];
  offset?: number;
  limit?: number;
};

interface AutoRespondedThreadQueryRow {
  id: string;
  threadId: string;
  emailThreadId: string;
  from: string;
  fromName: string | null;
  subject: string;
  isRead: boolean;
  isSnoozed: boolean;
  snoozeUntil: Date | null;
  receivedAt: Date;
  summary: string | null;
  isProcessingSummary: boolean;
  priorityScore: number | null;
  priorityExplanation: string | null;
  isProcessingPriority: boolean;
  urgencyScore: number | null;
  // resolved from user_contexts JOIN
  categoryName: string | null;
  categoryId: string | null;
  categoryExplanation: string | null;
  protoCategoryName: string | null;
  protoCategoryDescription: string | null;
  starCount: number;
  isArchived: boolean;
  threadUpdatedAt: Date;
  labels: string | null;
  githubMetadata: string | null;
  correspondentEmail: string | null;
  correspondentName: string | null;
  autoRespondedAt: Date | null;
  autoResponseCount: number;
}

/**
 * Service for auto-response analytics and logging
 */
@Injectable()
export class AutoResponderAnalyticsService {
  private readonly logger = new Logger(AutoResponderAnalyticsService.name);

  constructor(
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
  ) {}

  /**
   * Log an auto-response
   */
  async logAutoResponse(params: {
    userId: string;
    emailThreadId: string;
    senderEmailHash: string;
    priorityLevel: "low" | "medium" | "high";
    qaResult: QASearchResult | null;
    templateUsed: string;
    responseSubject: string;
    responseBody: string;
    classification: EmailClassification;
  }): Promise<void> {
    const {
      userId,
      emailThreadId,
      senderEmailHash,
      priorityLevel,
      qaResult,
      templateUsed,
      responseSubject,
      responseBody,
      classification,
    } = params;
    await this.autoResponseLogRepository.save({
      userId,
      emailThreadId,
      senderEmailHash,
      priorityLevel: priorityLevel as AutoResponseLogPriority,
      qaAnswerProvided: !!qaResult,
      confidenceScore: qaResult?.confidence || null,
      templateUsed,
      responseSubject,
      responseBody,
      classificationDetails: {
        isAutomated: classification.isAutomated,
        isNewsletter: classification.isNewsletter,
        isColdOutreach: classification.isColdOutreach,
        personalizationScore: classification.personalizationScore,
        reasons: classification.reasons,
      },
    });
  }

  /**
   * Check if auto-response was already sent to this thread
   */
  async hasExistingResponse(
    userId: string,
    emailThreadId: string,
  ): Promise<AutoResponseLog | null> {
    return this.autoResponseLogRepository.findOne({
      where: { userId, emailThreadId },
    });
  }

  /**
   * Build SQL filter clause and query params for auto-responded thread query.
   */
  private buildAutoRespondedFilters(
    filters: AutoRespondedThreadFilters | undefined,
    queryParams: unknown[],
  ): string {
    let additionalFilters = "";
    let paramIndex = queryParams.length + 1;

    if (filters?.minPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) >= $${paramIndex++}`;
      queryParams.push(filters.minPriority);
    }
    if (filters?.maxPriority !== undefined) {
      additionalFilters += ` AND COALESCE(thread."priorityScore", 0) < $${paramIndex++}`;
      queryParams.push(filters.maxPriority);
    }
    if (filters?.accountIds && filters.accountIds.length > 0) {
      const placeholders = filters.accountIds
        .map(() => `$${paramIndex++}`)
        .join(", ");
      additionalFilters += ` AND EXISTS (
        SELECT 1 FROM emails e
        WHERE e."emailThreadId" = thread.id
          AND (e."googleAccountId" IN (${placeholders})
               OR e."office365AccountId" IN (${placeholders})
               OR e."zohoAccountId" IN (${placeholders}))
      )`;
      queryParams.push(...filters.accountIds);
    }
    return additionalFilters;
  }

  /**
   * Get auto-responded threads for the autoresponded inbox mode.
   */
  async getAutoRespondedThreads(
    userId: string,
    filters?: AutoRespondedThreadFilters,
    userEmailHmac?: string,
  ): Promise<{
    emails: AutoRespondedThread[];
    total: number;
    hasMore: boolean;
  }> {
    const queryParams: unknown[] = [userId];
    const additionalFilters = this.buildAutoRespondedFilters(
      filters,
      queryParams,
    );

    let correspondentFilter: string;
    if (userEmailHmac) {
      const hmacParam = `$${queryParams.length + 1}`;
      queryParams.push(userEmailHmac);
      correspondentFilter = `AND cor."senderEmailHmac" IS DISTINCT FROM ${hmacParam}`;
    } else {
      correspondentFilter = "";
    }

    const rows = (await this.autoResponseLogRepository.query(
      `SELECT
          thread."starCount", thread."isArchived", thread."urgencyScore",
          thread."priorityExplanation", thread."priorityScore", thread."isProcessingPriority",
          thread."githubMetadata", thread."categoryExplanation",
          thread."protoCategoryId", thread."categoryId",
          uc."contextValue" AS "categoryName",
          thread."updatedAt" as "threadUpdatedAt",
          pc."name" as "protoCategoryName", pc."description" as "protoCategoryDescription",
          e.id, e."threadId", e."emailThreadId", e."from", e."fromName", e.subject,
          e."isSnoozed", e."snoozeUntil", e."isRead", e.summary, e."isProcessingSummary",
          e."receivedAt", e.labels,
          correspondent."from" as "correspondentEmail",
          correspondent."fromName" as "correspondentName",
          stats."autoResponseCount", stats."autoRespondedAt"
       FROM email_threads thread
       JOIN (
         SELECT
           arl."emailThreadId",
           COUNT(*)::int as "autoResponseCount",
           MAX(arl."sentAt") as "autoRespondedAt"
         FROM auto_response_logs arl
         WHERE arl."userId" = $1
           AND arl."emailThreadId" IS NOT NULL
         GROUP BY arl."emailThreadId"
       ) stats ON stats."emailThreadId" = thread.id
       CROSS JOIN LATERAL (
         SELECT em.id, em."threadId", em."emailThreadId", em."from", em."fromName", em.subject,
           em."isSnoozed", em."snoozeUntil", em."isRead", em.summary, em."isProcessingSummary",
           em."receivedAt", em.labels
         FROM emails em
         WHERE em."emailThreadId" = thread.id
           AND em."userId" = $1
         ORDER BY em."receivedAt" DESC, em.id DESC
         LIMIT 1
       ) e
       LEFT JOIN LATERAL (
         SELECT cor."from", cor."fromName"
         FROM emails cor
         WHERE cor."emailThreadId" = thread.id
           AND cor."userId" = $1
           ${correspondentFilter}
         ORDER BY cor."receivedAt" ASC
         LIMIT 1
       ) correspondent ON true
       LEFT JOIN proto_categories pc ON pc.id = thread."protoCategoryId"
       LEFT JOIN user_contexts uc ON uc."contextId" = thread."categoryId"
       WHERE thread."userId" = $1
         AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
         ${additionalFilters}
       ORDER BY stats."autoRespondedAt" DESC, thread."updatedAt" DESC, thread."threadId" ASC`,
      queryParams,
    )) as AutoRespondedThreadQueryRow[];

    const mappedRows = rows.map((row) => this.mapAutoRespondedRow(row));
    let filteredRows = mappedRows;
    if (filters?.categories && filters.categories.length > 0) {
      // Note: filters.categories uses display names for backward compatibility.
      filteredRows = mappedRows.filter((row) =>
        filters.categories!.includes(row.category || "Other"),
      );
    }

    const offset = Math.max(0, filters?.offset ?? 0);
    const limit = Math.max(1, filters?.limit ?? QUERY_LIMITS.INBOX_PAGE_SIZE);
    const total = filteredRows.length;
    const pageRows = filteredRows.slice(offset, offset + limit);
    return {
      emails: pageRows,
      total,
      hasMore: offset + pageRows.length < total,
    };
  }

  /**
   * One-time data fix: un-archive threads incorrectly archived by the
   * autoresponder (#857 regression). Safe to run multiple times — only
   * affects threads where:
   *   - isArchived = true
   *   - the thread has at least one auto_response_logs entry
   *   - there is no user-initiated archive timestamp (userArchivedAt IS NULL)
   *
   * After PR #860 fixed the false-archiving root cause, this endpoint
   * allows Jeremy to restore visibility for threads that were already
   * silently archived before the fix was deployed.
   */
  async fixAutoresponderArchivedThreads(userId: string): Promise<{
    fixed: number;
    message: string;
  }> {
    // Un-archive threads that are currently archived AND have an
    // auto_response_logs entry for this user. The #857 bug archived every
    // auto-responded thread immediately (user never saw them), so these
    // threads were effectively never manually archived by the user.
    const result = (await this.autoResponseLogRepository.query(
      `UPDATE email_threads
       SET "isArchived" = false
       WHERE "userId" = $1
         AND "isArchived" = true
         AND id IN (
           SELECT DISTINCT "emailThreadId"
           FROM auto_response_logs
           WHERE "userId" = $1
             AND "emailThreadId" IS NOT NULL
         )`,
      [userId],
    )) as { rowCount?: number } | [unknown, number];

    // pg returns [rows, rowCount] for raw queries; TypeORM wraps as result object
    const fixed = Array.isArray(result)
      ? (result[1] as number)
      : ((result as { rowCount?: number }).rowCount ?? 0);

    this.logger.log(
      `fix-autoresponder-archived-threads: un-archived ${fixed} threads for user ${userId}`,
    );

    return {
      fixed,
      message: `Un-archived ${fixed} thread(s) that were incorrectly archived by the autoresponder.`,
    };
  }

  /**
   * Get analytics for auto-responses
   */
  async getAnalytics(
    userId: string,
    dateRange?: { start: Date; end: Date },
  ): Promise<{
    totalSent: number;
    byPriority: { low: number; medium: number; high: number };
    qaAnswerRate: number;
    escalationRate: number;
    templateBreakdown: Record<string, number>;
  }> {
    const queryBuilder = this.autoResponseLogRepository
      .createQueryBuilder("log")
      .where("log.userId = :userId", { userId });

    if (dateRange) {
      queryBuilder
        .andWhere("log.sentAt >= :start", { start: dateRange.start })
        .andWhere("log.sentAt <= :end", { end: dateRange.end });
    }

    const logs = await queryBuilder.getMany();

    const totalSent = logs.length;
    const byPriority = {
      low: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.LOW,
      ).length,
      medium: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.MEDIUM,
      ).length,
      high: logs.filter(
        (log) => log.priorityLevel === AutoResponseLogPriority.HIGH,
      ).length,
    };
    const qaAnswerCount = logs.filter((log) => log.qaAnswerProvided).length;
    const escalationCount = logs.filter(
      (log) => log.escalationRequested,
    ).length;

    const templateBreakdown: Record<string, number> = {};
    for (const log of logs) {
      templateBreakdown[log.templateUsed] =
        (templateBreakdown[log.templateUsed] || 0) + 1;
    }

    return {
      totalSent,
      byPriority,
      qaAnswerRate: totalSent > 0 ? qaAnswerCount / totalSent : 0,
      escalationRate: totalSent > 0 ? escalationCount / totalSent : 0,
      templateBreakdown,
    };
  }

  private mapAutoRespondedRow(
    row: AutoRespondedThreadQueryRow,
  ): AutoRespondedThread {
    // categoryName comes from user_contexts JOIN — plain text, no decryption needed.
    const category = row.categoryName
      ? parseCategoryName(row.categoryName)
      : null;
    const categoryExplanation = row.categoryExplanation
      ? EncryptionHelper.tryDecrypt(row.categoryExplanation)
      : null;

    return {
      id: row.id,
      threadId: row.threadId,
      emailThreadId: row.emailThreadId,
      from: row.from ? EncryptionHelper.tryDecrypt(row.from) : "",
      fromName: row.fromName ? EncryptionHelper.tryDecrypt(row.fromName) : null,
      subject: row.subject ? EncryptionHelper.tryDecrypt(row.subject) : "",
      isRead: row.isRead,
      isSnoozed: row.isSnoozed,
      snoozeUntil: row.snoozeUntil,
      receivedAt: row.receivedAt,
      summary: row.summary ? EncryptionHelper.tryDecrypt(row.summary) : null,
      isProcessingSummary: row.isProcessingSummary,
      priorityScore: row.priorityScore,
      priorityExplanation: this.decryptEncryptedJsonField<
        Record<string, unknown>
      >(row.priorityExplanation),
      isProcessingPriority: row.isProcessingPriority,
      urgencyScore: row.urgencyScore,
      category: category || "Other",
      categoryExplanation,
      protoCategoryName: row.protoCategoryName,
      protoCategoryDescription: row.protoCategoryDescription,
      starCount: row.starCount,
      isArchived: row.isArchived,
      threadUpdatedAt: row.threadUpdatedAt,
      labels: this.decryptLabels(row.labels),
      githubMetadata: this.decryptEncryptedJsonField<Record<string, unknown>>(
        row.githubMetadata,
      ),
      correspondentEmail: row.correspondentEmail
        ? EncryptionHelper.tryDecrypt(row.correspondentEmail)
        : null,
      correspondentName: row.correspondentName
        ? EncryptionHelper.tryDecrypt(row.correspondentName)
        : null,
      autoRespondedAt: row.autoRespondedAt,
      autoResponseCount: Number(row.autoResponseCount || 0),
    };
  }

  private decryptEncryptedJsonField<T>(encrypted: string | null): T | null {
    if (!encrypted) return null;

    try {
      const decrypted = EncryptionHelper.tryDecrypt(encrypted);
      return decrypted ? (JSON.parse(decrypted) as T) : null;
    } catch (error) {
      this.logger.warn("Failed to decrypt auto-responder JSON field", error);
      return null;
    }
  }

  private decryptLabels(labels: string | null): string[] {
    if (!labels) return [];

    try {
      const decrypted = EncryptionHelper.tryDecrypt(labels);
      const parsed = decrypted ? JSON.parse(decrypted) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
