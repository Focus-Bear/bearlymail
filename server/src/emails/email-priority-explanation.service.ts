import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { RATIOS } from "../constants/percentages";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import {
  PRIORITY_BOOSTS,
  PRIORITY_SCORES,
  SENTIMENT_THRESHOLDS,
} from "../constants/priority-constants";
import { MILLISECONDS, SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { getJobPriority } from "../queue/job-priorities";
import { UsersService } from "../users/users.service";
import { PerformanceTracker } from "./performance-tracker";

type PriorityExplanationResult = {
  score: number;
  dimensions: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment: { score: number; type: string; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
};

/** Shape stored on EmailThread.priorityExplanation (may arrive as JSON string from DB edge cases). */
type PriorityExplanationPayload = {
  score: number;
  dimensions?: {
    urgency?: { score: number; reasons: string[] };
    goalAlignment?: { score: number; reasons: string[] };
    vipContact?: { score: number; reasons: string[] };
    sentiment?: { score: number; type: string; reasons: string[] };
  };
  breakdown?: Array<{ factor: string; value: number; description: string }>;
  calculatedAt?: string;
};

/**
 * Handles priority score explanation, computation, and recalculation queueing.
 * Extracted from EmailsService (Phase 2).
 */
@Injectable()
export class EmailPriorityExplanationService {
  private readonly logger = new Logger(EmailPriorityExplanationService.name);

  /**
   * `priorityExplanation` is normally a parsed object (encryptedJsonTransformer) but can
   * surface as a JSON string in production; never mutate the raw value in place.
   */
  private parsePriorityExplanationPayload(
    raw: unknown,
  ): PriorityExplanationPayload | null {
    if (raw == null) {
      return null;
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        return null;
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && "score" in parsed) {
          return parsed as PriorityExplanationPayload;
        }
      } catch {
        this.logger.warn(
          "priorityExplanation: stored value is not valid JSON; falling back",
        );
      }
      return null;
    }
    if (typeof raw === "object" && raw !== null && "score" in raw) {
      return raw as PriorityExplanationPayload;
    }
    return null;
  }

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private usersService: UsersService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @Optional() private cloudWatchService?: CloudWatchService,
  ) {}

  /**
   * Resolve an EmailThread for an email.
   * Primary: look up by emailThreadId FK (UUID).
   * Fallback: look up by (userId, threadId) string — handles the known TypeORM edge
   * case where the FK column is not persisted, which would otherwise cause
   * getPriorityExplanation to skip stored priorityExplanation and fall back to
   * computeFallbackExplanation (returning "Calculating..." placeholders).
   */
  private async resolveThreadForEmail(
    email: Email,
  ): Promise<EmailThread | null> {
    if (email.emailThreadId) {
      const byId = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
      if (byId) return byId;
    }
    if (email.threadId && email.userId) {
      return this.emailThreadRepository.findOne({
        where: { userId: email.userId, threadId: email.threadId },
      });
    }
    return null;
  }

  /**
   * Get priority score explanation breakdown for an email.
   */
  async getPriorityExplanation(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<PriorityExplanationResult> {
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
      const email = await getEmailById(userId, emailId);
      endEmailQuery();

      if (!email) throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);

      const thread = await this.resolveThreadForEmail(email);

      const parsedExplanation = thread?.priorityExplanation
        ? this.parsePriorityExplanationPayload(thread.priorityExplanation)
        : null;

      if (parsedExplanation) {
        const hasOldStructure =
          parsedExplanation.breakdown?.some(
            (item) =>
              item.factor === "Base Score" ||
              item.factor === "🤖 AI Analysis" ||
              item.factor === "AI Analysis",
          ) ?? false;
        const hasCalculatingItems =
          parsedExplanation.breakdown?.some(
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
            parsedExplanation,
            email.sentimentScore ?? 0,
          );
        } else if (!hasOldStructure && !hasCalculatingItems) {
          endTotal();
          perf.finish();
          return this.normalizePriorityExplanation(
            parsedExplanation,
            email.sentimentScore ?? 0,
          );
        }
      }

      // Fallback: compute on demand for legacy emails
      const explanation = await this.computeFallbackExplanation(
        userId,
        email,
        perf,
      );
      endTotal();
      perf.finish();
      return explanation;
    } catch (error) {
      endTotal();
      perf.finish();
      throw error;
    }
  }

  private async computeFallbackExplanation(
    userId: string,
    email: Email,
    perf: PerformanceTracker,
  ): Promise<PriorityExplanationResult> {
    const endContextQuery = perf.startSpan(
      "context-query",
      PERFORMANCE_BUDGETS.PRIORITY_CALC,
    );
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });
    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }
    endContextQuery();

    const endDaysCalc = perf.startSpan(
      "days-since-last-email",
      PERFORMANCE_BUDGETS.INBOX_TOTAL,
    );
    await this.calculateDaysSinceLastEmail(userId, email);
    endDaysCalc();

    const { breakdown, dimensions, calculatedScore } =
      this.buildExplanationDimensions(email, contexts);

    const endComputation = perf.startSpan(
      "explanation-computation",
      PERFORMANCE_BUDGETS.SLOW_QUERY_THRESHOLD,
    );
    const explanation = { score: calculatedScore, dimensions, breakdown };
    endComputation();

    if (email.emailThreadId) {
      const endSave = perf.startSpan(
        "save-explanation",
        PERFORMANCE_BUDGETS.INBOX_TOTAL,
      );
      const priorityScore = this.calculateScoreFromBreakdown(explanation) ?? 0;
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
    return explanation;
  }

  private buildExplanationDimensions(
    email: Email,
    contexts: UserContext[],
  ): {
    breakdown: Array<{ factor: string; value: number; description: string }>;
    dimensions: PriorityExplanationResult["dimensions"];
    calculatedScore: number;
  } {
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

    const vipContacts = contexts.filter(
      (ctx) => ctx.contextKey === ContextKey.VIP_CONTACT,
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

    breakdown.push({
      factor: "🎯 Goal Alignment",
      value: 0,
      description: "Calculating...",
    });
    breakdown.push({
      factor: "🔥 Urgency",
      value: 0,
      description: "Calculating...",
    });

    const sentimentType = this.getSentimentType(email.sentimentScore ?? 0);
    const sentimentDescriptions: Record<string, string> = {
      negative: "Negative sentiment",
      positive: "Positive sentiment",
      neutral: "Neutral sentiment",
    };
    breakdown.push({
      factor: "😊 Sentiment",
      value: 0,
      description: sentimentDescriptions[sentimentType] ?? "Neutral sentiment",
    });

    const calculatedScore = Math.max(0, Math.min(100, currentScore));
    this.clampDimensionScores(dimensions);
    return { breakdown, dimensions, calculatedScore };
  }

  private clampDimensionScores(
    dimensions: PriorityExplanationResult["dimensions"],
  ): void {
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
  }

  /**
   * Calculate priority score from breakdown array.
   * Single source of truth for priority scores.
   */
  calculateScoreFromBreakdown(
    priorityExplanation: {
      breakdown?: Array<{ value: number }>;
      score?: number;
    } | null,
  ): number {
    if (!priorityExplanation || !priorityExplanation.breakdown) return 0;
    const total = priorityExplanation.breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );
    return Math.max(0, Math.min(100, total));
  }

  normalizePriorityExplanation(
    rawExplanation: unknown,
    sentimentScore: number,
  ): PriorityExplanationResult {
    const explanation = this.parsePriorityExplanationPayload(rawExplanation);
    if (!explanation || typeof explanation.score !== "number") {
      return {
        score: 0,
        dimensions: {
          urgency: { score: 0, reasons: [] },
          goalAlignment: { score: 0, reasons: [] },
          vipContact: { score: 0, reasons: [] },
          sentiment: {
            score: sentimentScore,
            type: this.getSentimentType(sentimentScore),
            reasons: [],
          },
        },
        breakdown: [],
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

  async checkAndQueuePriorityRecalculation(
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
          `Thread ${thread.id} stuck in "Calculating..." for ${Math.round(processingTime / MILLISECONDS.MINUTE)} minutes, resetting`,
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
            singletonSeconds: SECONDS.FIVE_MINUTES,
          },
        )
        .catch((err) =>
          this.logger.error(
            `Failed to queue priority recalculation for email ${emailId}:`,
            err,
          ),
        );
    }
  }

  calculateJobTitleScore(jobTitle: string): number {
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

  getSentimentType(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) return "negative";
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) return "positive";
    return "neutral";
  }

  /**
   * Batch calculate days since last email for multiple emails.
   */
  async batchCalculateDaysSinceLastEmail(
    userId: string,
    emails: Partial<Email>[],
  ): Promise<Map<string, number | undefined>> {
    const resultMap = new Map<string, number | undefined>();
    const validEmails = emails.filter(
      (emailItem) =>
        emailItem.threadId &&
        emailItem.from &&
        emailItem.receivedAt &&
        emailItem.id,
    );

    if (validEmails.length === 0) {
      emails.forEach((emailItem) => {
        if (emailItem.id) resultMap.set(emailItem.id, undefined);
      });
      return resultMap;
    }

    const threadMap = new Map<string, Partial<Email>[]>();
    validEmails.forEach((email) => {
      const threadId = email.threadId!;
      if (!threadMap.has(threadId)) threadMap.set(threadId, []);
      threadMap.get(threadId)!.push(email);
    });

    try {
      const threadIds = Array.from(threadMap.keys());
      if (threadIds.length === 0) {
        validEmails.forEach((emailItem) => {
          if (emailItem.id) resultMap.set(emailItem.id, undefined);
        });
        return resultMap;
      }

      const promises = Array.from(threadMap.entries()).map(
        async ([threadId, threadEmails]) => {
          const earliestReceivedAt = threadEmails.reduce((earliest, email) => {
            if (!earliest || !email.receivedAt)
              return earliest || email.receivedAt;
            return email.receivedAt < earliest ? email.receivedAt : earliest;
          }, threadEmails[0]?.receivedAt);

          if (!earliestReceivedAt) return;

          const previousEmailsRaw = await this.emailRepository.query(
            `SELECT id, "from", "receivedAt" FROM emails
           WHERE "userId" = $1 AND "threadId" = $2 AND "receivedAt" < $3
           ORDER BY "receivedAt" DESC`,
            [userId, threadId, earliestReceivedAt],
          );

          const previousEmails = previousEmailsRaw.map(
            (row: { id: string; from: string; receivedAt: Date }) => ({
              id: row.id,
              from: EncryptionHelper.tryDecrypt(row.from),
              receivedAt: row.receivedAt,
            }),
          );

          threadEmails.forEach((email) => {
            if (!email.id || !email.from || !email.receivedAt) {
              resultMap.set(email.id || "", undefined);
              return;
            }
            const lastEmail = previousEmails.find(
              (prevEmail) =>
                prevEmail.from === email.from &&
                prevEmail.receivedAt < email.receivedAt!,
            );
            if (!lastEmail) {
              resultMap.set(email.id, undefined);
              return;
            }
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
      validEmails.forEach((emailItem) => {
        if (emailItem.id) resultMap.set(emailItem.id, undefined);
      });
    }

    emails.forEach((emailItem) => {
      if (emailItem.id && !resultMap.has(emailItem.id))
        resultMap.set(emailItem.id, undefined);
    });
    return resultMap;
  }

  /**
   * Calculate days since the last email in the thread from the same sender.
   * @deprecated Use batchCalculateDaysSinceLastEmail for multiple emails.
   */
  async calculateDaysSinceLastEmail(
    userId: string,
    email: Partial<Email>,
  ): Promise<number | undefined> {
    if (!email.threadId || !email.from || !email.receivedAt) return undefined;
    try {
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

      if (!lastEmail) return undefined;
      const daysDiff =
        (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
        MILLISECONDS.DAY;
      return Math.max(0, Math.round(daysDiff * 10) / 10);
    } catch (error) {
      this.logger.error("Error calculating days since last email:", error);
      return undefined;
    }
  }
}
