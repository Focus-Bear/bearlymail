import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as fs from "fs";
import * as path from "path";
import { Repository } from "typeorm";

import {
  STAR_COUNTS,
  TRIAGE_THRESHOLDS,
} from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";
import { calculateScoreFromBreakdown } from "../utils/priority.utils";
import { PriorityService } from "./priority.service";

export interface TriageSuggestion {
  emailId: string;
  suggestedStarCount: number;
  // 0-3
  suggestedArchive: boolean;
  confidence: number;
  // 0-100
  reasoning: string;
}

/**
 * Raw result from email query with thread join
 * Used for SQL queries that select email and thread columns
 */
interface EmailQueryRow {
  id: string;
  userId: string;
  threadId: string;
  emailThreadId: string;
  from: string;
  fromName: string | null;
  subject: string;
  priorityExplanation?: string;
  receivedAt: Date;
  starCount: number | null;
  isArchived: boolean | null;
}

/**
 * Email-like object with thread properties attached
 * Used when mapping raw SQL results to Email-like objects
 * Contains properties needed for triage suggestions
 */
interface EmailWithThreadProps {
  id: string;
  userId: string;
  threadId: string;
  emailThreadId?: string;
  from: string;
  fromName: string | null;
  subject: string;
  priorityExplanation?: unknown;
  receivedAt: Date;
  starCount: number;
  isArchived: boolean;
}

// Performance budgets in milliseconds
const TRIAGE_PERF_BUDGETS = {
  // 1 second total
  TRIAGE_TOTAL: 1000,
  EMAIL_QUERY: 200,
  CONTEXT_QUERY: 100,
  HISTORY_QUERY: 300,
  PATTERN_ANALYSIS: 100,
  SUGGESTION_GENERATION: 300,
};

interface PerfSpan {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  budget: number;
  exceeded?: boolean;
}

class TriagePerformanceTracker {
  private spans: PerfSpan[] = [];
  private startTime: number;
  private logger = new Logger("TriagePerformanceTracker");
  private logFile = path.join(LOGS_DIR, "performance.log");

  constructor(private operation: string) {
    this.startTime = Date.now();
    ensureLogsDirSync();
  }

  startSpan(name: string, budget: number): () => void {
    const span: PerfSpan = { name, start: Date.now(), budget };
    this.spans.push(span);
    return () => {
      span.end = Date.now();
      span.duration = span.end - span.start;
      span.exceeded = span.duration > budget;
    };
  }

  finish(): void {
    const totalDuration = Date.now() - this.startTime;
    const exceededSpans = this.spans.filter((span) => span.exceeded);
    const totalExceeded = totalDuration > TRIAGE_PERF_BUDGETS.TRIAGE_TOTAL;

    if (totalExceeded || exceededSpans.length > 0) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: this.operation,
        totalDuration,
        totalBudget: TRIAGE_PERF_BUDGETS.TRIAGE_TOTAL,
        totalExceeded,
        spans: this.spans.map((span) => ({
          name: span.name,
          duration: span.duration,
          budget: span.budget,
          exceeded: span.exceeded,
        })),
        exceededSpans: exceededSpans.map(
          (span) =>
            `${span.name}: ${span.duration}ms (budget: ${span.budget}ms)`,
        ),
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;

      this.logger.warn(
        `⚠️ PERF ISSUE: ${this.operation} took ${totalDuration}ms (budget: ${TRIAGE_PERF_BUDGETS.TRIAGE_TOTAL}ms)`,
      );
      exceededSpans.forEach((span) => {
        this.logger.warn(
          `   - ${span.name}: ${span.duration}ms exceeded budget of ${span.budget}ms`,
        );
      });

      // Development only. In production the container filesystem is read-only,
      // so the write throws ENOENT every time and the error log itself becomes
      // high-volume CloudWatch spam.
      if (isDevelopment) {
        try {
          fs.appendFileSync(this.logFile, logLine);
        } catch (err) {
          this.logger.error("Failed to write to performance log file:", err);
        }
      }
    }
  }
}

@Injectable()
export class TriageSuggestionsService {
  private readonly logger = new Logger(TriageSuggestionsService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private llmService: LLMService,
    private priorityService: PriorityService,
    private emailsService: EmailsService,
  ) {}

  /**
   * Generate triage suggestions for a list of emails
   */
  async generateSuggestions(
    userId: string,
    emailIds: string[],
  ): Promise<TriageSuggestion[]> {
    const perf = new TriagePerformanceTracker(`triage-suggestions-${userId}`);

    const emails = await this.fetchEmailsWithThreadData(userId, emailIds, perf);

    if (emails.length === 0) {
      perf.finish();
      return [];
    }

    const contexts = await this.fetchUserContexts(userId, perf);
    const recentEmails = await this.fetchRecentEmailHistory(userId, perf);

    // Analyze patterns from recent behavior
    const endPatternAnalysis = perf.startSpan(
      "pattern_analysis",
      TRIAGE_PERF_BUDGETS.PATTERN_ANALYSIS,
    );
    const senderPatterns = this.analyzeSenderPatterns(recentEmails);
    endPatternAnalysis();

    const suggestions = await this.generateSuggestionsForBatches(
      userId,
      emails,
      contexts,
      senderPatterns,
      perf,
    );

    perf.finish();
    return suggestions;
  }

  /**
   * Generate suggestion for a single email
   */
  private async suggestForEmail(
    userId: string,
    email: EmailWithThreadProps,
    contexts: UserContext[],
    senderPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
  ): Promise<TriageSuggestion> {
    try {
      const priorityScore = await this.getPriorityScoreForEmail(email);
      const suggestedStarCountFromPriority =
        this.priorityScoreToStarCount(priorityScore);

      const vipResult = this.checkVipStatus(email, contexts);
      if (vipResult) {
        return {
          ...vipResult,
          suggestedStarCount: Math.max(
            STAR_COUNTS.MEDIUM,
            suggestedStarCountFromPriority,
          ),
        };
      }

      const patternResult = this.checkSenderPatternResult(
        email,
        senderPatterns,
      );
      if (patternResult) {
        return patternResult;
      }

      // Use simple heuristics instead of LLM for performance
      // LLM calls are too slow (3+ seconds each) for real-time suggestions
      // Only use priority score and basic rules for now
      return {
        emailId: email.id,
        suggestedStarCount: suggestedStarCountFromPriority,
        suggestedArchive: false,
        confidence: TRIAGE_THRESHOLDS.DEFAULT_CONFIDENCE,
        reasoning: this.buildPriorityReasoning(priorityScore),
      };

      // NOTE: LLM suggestions disabled for performance (14s+ delay)
      // If needed, these should be generated asynchronously in background jobs
      // and cached in the database, not called in real-time
    } catch (error) {
      this.logger.error(
        `Error generating suggestion for email ${email.id}`,
        error,
      );
      return {
        emailId: email.id,
        suggestedStarCount: 0,
        suggestedArchive: false,
        confidence: 0,
        reasoning: "Unable to generate suggestion",
      };
    }
  }

  /**
   * Use LLM to generate suggestion
   */
  private async llmSuggest(
    userId: string,
    email: Email,
    senderPattern: { avgStarCount: number; archiveRate: number } | undefined,
    priorityScore: number,
  ): Promise<TriageSuggestion> {
    const patternContext = senderPattern
      ? `\nHistorical pattern: You typically give ${senderPattern.avgStarCount.toFixed(1)} stars to emails from this sender, and archive ${(senderPattern.archiveRate * 100).toFixed(0)}% of them.`
      : "";

    let priorityBasedStars: number;
    if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_HIGH) {
      priorityBasedStars = STAR_COUNTS.HIGH;
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_MEDIUM) {
      priorityBasedStars = STAR_COUNTS.MEDIUM;
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_LOW) {
      priorityBasedStars = STAR_COUNTS.LOW;
    } else {
      priorityBasedStars = STAR_COUNTS.NONE;
    }

    const prompt = `Analyze this email and suggest a triage action based on priority and importance.

Email from: ${email.fromName || email.from}
Subject: ${email.subject || "(no subject)"}
Body preview: ${(email.body || "").substring(0, QUERY_LIMITS.SUBSTRING_BODY_PREVIEW)}${patternContext}

IMPORTANT: This email has a priority score of ${priorityScore.toFixed(1)} (on a scale of 0-100).
Based on the priority score, it should have approximately ${priorityBasedStars} star(s):
- Priority 80+ = 3 stars (very important)
- Priority 60-80 = 2 stars (important)
- Priority 40-60 = 1 star (somewhat important)
- Priority <40 = 0 stars (not important)

Based on the email content AND the priority score, suggest:
1. Star count (0-3): Should align with the priority score unless content indicates otherwise
2. Whether to archive immediately (true/false)

Respond with ONLY a JSON object:
{
  "suggestedStarCount": 0-3,
  "suggestedArchive": true/false,
  "confidence": 0-100,
  "reasoning": "brief explanation mentioning priority score"
}`;

    try {
      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt:
            "You are an email triage assistant. Suggest appropriate priority and archive actions based on email importance.",
          temperature: 0.3,
          maxTokens: 300,
          userId,
        },
        undefined,
        userId,
      );

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          emailId: email.id,
          suggestedStarCount: Math.max(
            0,
            Math.min(3, parsed.suggestedStarCount || 0),
          ),
          suggestedArchive: parsed.suggestedArchive || false,
          confidence: Math.max(
            0,
            Math.min(
              100,
              parsed.confidence || TRIAGE_THRESHOLDS.FALLBACK_CONFIDENCE,
            ),
          ),
          reasoning: parsed.reasoning || "AI-generated suggestion",
        };
      }
    } catch (error) {
      this.logger.error(
        "Error parsing LLM response for triage suggestion",
        error,
      );
    }

    return {
      emailId: email.id,
      suggestedStarCount: STAR_COUNTS.NONE,
      suggestedArchive: false,
      confidence: TRIAGE_THRESHOLDS.FALLBACK_CONFIDENCE,
      reasoning: "Unable to analyze email",
    };
  }

  /**
   * Analyze sender patterns from recent emails
   * Uses EmailWithThreadProps since we need starCount and isArchived from the join
   */
  private analyzeSenderPatterns(
    emails: EmailWithThreadProps[],
  ): Map<string, { avgStarCount: number; archiveRate: number }> {
    const patterns = new Map<
      string,
      { starCounts: number[]; archived: number; total: number }
    >();

    for (const email of emails) {
      const sender = email.from.toLowerCase();
      if (!patterns.has(sender)) {
        patterns.set(sender, { starCounts: [], archived: 0, total: 0 });
      }

      const pattern = patterns.get(sender)!;
      pattern.total++;
      const starCount = email.starCount ?? 0;
      if (starCount > 0) {
        pattern.starCounts.push(starCount);
      }
      if (email.isArchived) {
        pattern.archived++;
      }
    }

    const result = new Map<
      string,
      { avgStarCount: number; archiveRate: number }
    >();
    for (const [sender, pattern] of patterns.entries()) {
      if (pattern.total >= TRIAGE_THRESHOLDS.MIN_PATTERN_EMAILS) {
        result.set(sender, {
          avgStarCount:
            pattern.starCounts.length > 0
              ? pattern.starCounts.reduce(
                  (sum, starCount) => sum + starCount,
                  0,
                ) / pattern.starCounts.length
              : 0,
          archiveRate: pattern.archived / pattern.total,
        });
      }
    }

    return result;
  }

  /**
   * Track when user overrides a suggestion (for learning)
   */
  async trackOverride(
    userId: string,
    emailId: string,
    suggestion: TriageSuggestion,
    userAction: { starCount: number; archived: boolean },
  ): Promise<void> {
    this.logger.log(
      `User overrode suggestion for email ${emailId}: suggested ${suggestion.suggestedStarCount} stars/${suggestion.suggestedArchive} archive, user chose ${userAction.starCount} stars/${userAction.archived} archive`,
    );
  }

  /**
   * Fetch the target emails joined with their thread data via raw SQL
   */
  private async fetchEmailsWithThreadData(
    userId: string,
    emailIds: string[],
    perf: TriagePerformanceTracker,
  ): Promise<EmailWithThreadProps[]> {
    const endEmailQuery = perf.startSpan(
      "email_query",
      TRIAGE_PERF_BUDGETS.EMAIL_QUERY,
    );
    const rawResult = await this.emailRepository.query(
      `SELECT
        email.id,
        email."userId",
        email."threadId",
        email."emailThreadId",
        email."from",
        email."fromName",
        email.subject,
        thread."priorityExplanation",
        email."receivedAt",
        thread."starCount",
        thread."isArchived"
      FROM emails email
      INNER JOIN email_threads thread ON thread.id = email."emailThreadId"
      WHERE email.id = ANY($1::uuid[]) AND email."userId" = $2`,
      [emailIds, userId],
    );
    endEmailQuery();

    // Map raw results to Email-like objects (Partial<Email> with thread properties)
    return (rawResult as EmailQueryRow[]).map((row) =>
      this.mapEmailQueryRowToEmailWithThreadProps(row),
    );
  }

  /**
   * Map a raw SQL email+thread query row to an EmailWithThreadProps object,
   * decrypting encrypted fields as needed
   */
  private mapEmailQueryRowToEmailWithThreadProps(
    row: EmailQueryRow,
  ): EmailWithThreadProps {
    // Parse priorityExplanation (stored as encrypted JSON)
    let priorityExplanation: unknown = null;
    if (row.priorityExplanation) {
      try {
        const decryptedExplanation = EncryptionHelper.tryDecrypt(
          row.priorityExplanation,
        );
        if (decryptedExplanation) {
          priorityExplanation = JSON.parse(decryptedExplanation);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt/parse priorityExplanation for thread (email ${row.id}):`,
          error,
        );
        priorityExplanation = null;
      }
    }

    return {
      id: row.id,
      userId: row.userId,
      threadId: row.threadId,
      emailThreadId: row.emailThreadId,
      from: EncryptionHelper.tryDecrypt(row.from) ?? "",
      fromName: EncryptionHelper.tryDecrypt(row.fromName ?? "") ?? null,
      subject: EncryptionHelper.tryDecrypt(row.subject) ?? "",
      priorityExplanation,
      receivedAt: row.receivedAt,
      starCount: row.starCount ?? 0,
      isArchived: row.isArchived ?? false,
    };
  }

  /**
   * Fetch user context entries using raw SQL for speed
   */
  private async fetchUserContexts(
    userId: string,
    perf: TriagePerformanceTracker,
  ): Promise<UserContext[]> {
    const endContextQuery = perf.startSpan(
      "context_query",
      TRIAGE_PERF_BUDGETS.CONTEXT_QUERY,
    );
    const rawContexts = (await this.userContextRepository.query(
      `SELECT "contextId", "userId", "contextKey", "contextValue", priority, explanation
       FROM user_contexts WHERE "userId" = $1`,
      [userId],
    )) as UserContext[];
    endContextQuery();

    // Decrypt contextValue — raw SQL bypasses the TypeORM encryptedColumnTransformer.
    // Also decrypt explanation so callers get readable values.
    return rawContexts.map((ctx) => ({
      ...ctx,
      contextValue:
        EncryptionHelper.tryDecrypt(ctx.contextValue) ?? ctx.contextValue,
      explanation: ctx.explanation
        ? (EncryptionHelper.tryDecrypt(ctx.explanation) ?? ctx.explanation)
        : ctx.explanation,
    }));
  }

  /**
   * Fetch the 50 most recent emails for the user to analyze sender patterns
   */
  private async fetchRecentEmailHistory(
    userId: string,
    perf: TriagePerformanceTracker,
  ): Promise<EmailWithThreadProps[]> {
    const endHistoryQuery = perf.startSpan(
      "history_query",
      TRIAGE_PERF_BUDGETS.HISTORY_QUERY,
    );
    const historyRaw = await this.emailRepository.query(
      `SELECT
        email.id,
        email."userId",
        email."threadId",
        email."from",
        email."fromName",
        email.subject,
        email."receivedAt",
        thread."starCount",
        thread."isArchived"
      FROM emails email
      INNER JOIN email_threads thread ON thread.id = email."emailThreadId"
      WHERE email."userId" = $1
      ORDER BY email."receivedAt" DESC
      LIMIT 50`,
      [userId],
    );
    endHistoryQuery();

    return (historyRaw as EmailQueryRow[]).map((row) => ({
      id: row.id,
      userId: row.userId,
      threadId: row.threadId,
      from: row.from,
      fromName: row.fromName,
      subject: row.subject,
      receivedAt: row.receivedAt,
      starCount: row.starCount ?? 0,
      isArchived: row.isArchived ?? false,
    }));
  }

  /**
   * Process emails in batches and collect suggestions
   */
  private async generateSuggestionsForBatches(
    userId: string,
    emails: EmailWithThreadProps[],
    contexts: UserContext[],
    senderPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
    perf: TriagePerformanceTracker,
  ): Promise<TriageSuggestion[]> {
    const suggestions: TriageSuggestion[] = [];
    const endSuggestionGen = perf.startSpan(
      "suggestion_generation",
      TRIAGE_PERF_BUDGETS.SUGGESTION_GENERATION,
    );
    const batchSize = 5;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchSuggestions = await Promise.all(
        batch.map((email) =>
          this.suggestForEmail(userId, email, contexts, senderPatterns),
        ),
      );
      suggestions.push(...batchSuggestions);
    }
    endSuggestionGen();
    return suggestions;
  }

  /**
   * Look up the priority score for an email via its thread
   */
  private async getPriorityScoreForEmail(
    email: EmailWithThreadProps,
  ): Promise<number> {
    let thread = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }
    return (
      calculateScoreFromBreakdown(thread?.priorityExplanation) ||
      TRIAGE_THRESHOLDS.DEFAULT_PRIORITY
    );
  }

  /**
   * Convert a priority score to a recommended star count (0-3)
   */
  private priorityScoreToStarCount(priorityScore: number): number {
    if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_HIGH) {
      return STAR_COUNTS.HIGH;
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_MEDIUM) {
      return STAR_COUNTS.MEDIUM;
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_LOW) {
      return STAR_COUNTS.LOW;
    } else {
      return STAR_COUNTS.NONE;
    }
  }

  /**
   * Check if the email sender is a VIP contact.
   * Returns a partial TriageSuggestion if VIP (caller fills in suggestedStarCount),
   * or null if not a VIP.
   */
  private checkVipStatus(
    email: EmailWithThreadProps,
    contexts: UserContext[],
  ): Omit<TriageSuggestion, "suggestedStarCount"> | null {
    const vipContacts = contexts.filter(
      (contact) => contact.contextKey === ContextKey.VIP_CONTACT,
    );
    const isVip = vipContacts.some(
      (vip) =>
        email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );

    if (!isVip) {
      return null;
    }

    return {
      emailId: email.id,
      suggestedArchive: false,
      confidence: TRIAGE_THRESHOLDS.VIP_CONFIDENCE,
      reasoning: `VIP contact - always prioritize`,
    };
  }

  /**
   * Check sender history patterns and return a suggestion if patterns are strong enough.
   * Returns null if no sufficient pattern exists.
   */
  private checkSenderPatternResult(
    email: EmailWithThreadProps,
    senderPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
  ): TriageSuggestion | null {
    const senderPattern = senderPatterns.get(email.from.toLowerCase());

    if (
      senderPattern &&
      senderPattern.avgStarCount >= TRIAGE_THRESHOLDS.HIGH_STAR_AVG
    ) {
      return {
        emailId: email.id,
        suggestedStarCount: Math.round(senderPattern.avgStarCount),
        suggestedArchive:
          senderPattern.archiveRate > TRIAGE_THRESHOLDS.HIGH_ARCHIVE_RATE,
        confidence: TRIAGE_THRESHOLDS.PATTERN_CONFIDENCE,
        reasoning: `You typically star emails from this sender`,
      };
    }

    if (
      senderPattern &&
      senderPattern.archiveRate > TRIAGE_THRESHOLDS.HIGH_ARCHIVE_RATE
    ) {
      return {
        emailId: email.id,
        suggestedStarCount: STAR_COUNTS.NONE,
        suggestedArchive: true,
        confidence: TRIAGE_THRESHOLDS.ARCHIVE_CONFIDENCE,
        reasoning: `You typically archive emails from this sender`,
      };
    }

    return null;
  }

  /**
   * Build a human-readable reasoning string from a priority score
   */
  private buildPriorityReasoning(priorityScore: number): string {
    let priorityLevel: string;
    if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_HIGH) {
      priorityLevel = "High priority";
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_MEDIUM) {
      priorityLevel = "Medium priority";
    } else if (priorityScore >= TRIAGE_THRESHOLDS.PRIORITY_LOW) {
      priorityLevel = "Low priority";
    } else {
      priorityLevel = "Very low priority";
    }
    return `Based on priority score: ${priorityScore.toFixed(1)}. ${priorityLevel}`;
  }
}
