import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { PriorityService } from "./priority.service";
import { EmailsService } from "../emails/emails.service";
import { calculateScoreFromBreakdown } from "../utils/priority.utils";
import { EncryptionHelper } from "../encryption/encryption.helper";
import * as fs from "fs";
import * as path from "path";

export interface TriageSuggestion {
  emailId: string;
  suggestedStarCount: number;
  // 0-3
  suggestedArchive: boolean;
  confidence: number;
  // 0-100
  reasoning: string;
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
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(
    TriagePerformanceTracker.logsDir,
    "performance.log",
  );

  constructor(private operation: string) {
    this.startTime = Date.now();
    if (!fs.existsSync(TriagePerformanceTracker.logsDir)) {
      fs.mkdirSync(TriagePerformanceTracker.logsDir, { recursive: true });
    }
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

      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
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
  // eslint-disable-next-line max-lines-per-function
  async generateSuggestions(
    userId: string,
    emailIds: string[],
  ): Promise<TriageSuggestion[]> {
    const perf = new TriagePerformanceTracker(`triage-suggestions-${userId}`);

    // Join with email_threads to get thread-level properties using raw SQL for speed
    const endEmailQuery = perf.startSpan(
      "email_query",
      TRIAGE_PERF_BUDGETS.EMAIL_QUERY,
    );
    const rawResult = await this.emailRepository.query(
      `SELECT
        email.id,
        email."userId",
        email."threadId",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = rawResult.map((row: any) => {
      // Parse priorityExplanation (stored as encrypted JSON)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let priorityExplanation: any = null;
      if (row.priorityExplanation) {
        try {
          const decryptedExplanation = EncryptionHelper.decrypt(
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
        from: EncryptionHelper.decrypt(row.from),
        fromName: EncryptionHelper.decrypt(row.fromName),
        subject: EncryptionHelper.decrypt(row.subject),
        priorityExplanation,
        receivedAt: row.receivedAt,
        starCount: row.starCount ?? 0,
        isArchived: row.isArchived ?? false,
      } as unknown as Email;
    });

    if (emails.length === 0) {
      perf.finish();
      return [];
    }

    // Get user's context for prioritization using raw query for speed
    const endContextQuery = perf.startSpan(
      "context_query",
      TRIAGE_PERF_BUDGETS.CONTEXT_QUERY,
    );
    const contexts = (await this.userContextRepository.query(
      `SELECT "contextId", "userId", "contextKey", "contextValue", priority, explanation
       FROM user_contexts WHERE "userId" = $1`,
      [userId],
    )) as UserContext[];
    endContextQuery();

    // Get user's email history for pattern analysis using raw SQL for speed
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

    const recentEmails = historyRaw.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) =>
        ({
          id: row.id,
          userId: row.userId,
          threadId: row.threadId,
          from: row.from,
          fromName: row.fromName,
          subject: row.subject,
          receivedAt: row.receivedAt,
          starCount: row.starCount ?? 0,
          isArchived: row.isArchived ?? false,
        }) as unknown as Email,
    );

    // Analyze patterns from recent behavior
    const endPatternAnalysis = perf.startSpan(
      "pattern_analysis",
      TRIAGE_PERF_BUDGETS.PATTERN_ANALYSIS,
    );
    const senderPatterns = this.analyzeSenderPatterns(recentEmails);
    endPatternAnalysis();

    const suggestions: TriageSuggestion[] = [];

    // Process emails in batches
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

    perf.finish();
    return suggestions;
  }

  /**
   * Generate suggestion for a single email
   */
  private async suggestForEmail(
    userId: string,
    email: Email,
    contexts: UserContext[],
    senderPatterns: Map<string, { avgStarCount: number; archiveRate: number }>,
  ): Promise<TriageSuggestion> {
    try {
      // Get priority explanation from thread
      let thread = null;
      if (email.emailThreadId) {
        thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId },
        });
      }
      
      const priorityScore =
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        calculateScoreFromBreakdown(thread?.priorityExplanation) || 50;
      let suggestedStarCountFromPriority: number;
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      if (priorityScore >= 80) {
        suggestedStarCountFromPriority = 3;
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      } else if (priorityScore >= 60) {
        suggestedStarCountFromPriority = 2;
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      } else if (priorityScore >= 40) {
        suggestedStarCountFromPriority = 1;
      } else {
        suggestedStarCountFromPriority = 0;
      }

      // Check if sender is VIP
      const vipContacts = contexts.filter(
        (c) => c.contextKey === ContextKey.VIP_CONTACT,
      );
      const isVip = vipContacts.some(
        (vip) =>
          email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
          email.fromName
            ?.toLowerCase()
            .includes(vip.contextValue.toLowerCase()),
      );

      if (isVip) {
        return {
          emailId: email.id,
          suggestedStarCount: Math.max(2, suggestedStarCountFromPriority),
          suggestedArchive: false,
          confidence: 90,
          reasoning: `VIP contact - always prioritize`,
        };
      }

      // Check historical patterns
      const senderPattern = senderPatterns.get(email.from.toLowerCase());

      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      if (senderPattern && senderPattern.avgStarCount >= 2.5) {
        return {
          emailId: email.id,
          suggestedStarCount: Math.round(senderPattern.avgStarCount),
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          suggestedArchive: senderPattern.archiveRate > 0.7,
          confidence: 75,
          reasoning: `You typically star emails from this sender`,
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      if (senderPattern && senderPattern.archiveRate > 0.7) {
        return {
          emailId: email.id,
          suggestedStarCount: 0,
          suggestedArchive: true,
          confidence: 70,
          reasoning: `You typically archive emails from this sender`,
        };
      }

      // Use simple heuristics instead of LLM for performance
      // LLM calls are too slow (3+ seconds each) for real-time suggestions
      // Only use priority score and basic rules for now
      return {
        emailId: email.id,
        suggestedStarCount: suggestedStarCountFromPriority,
        suggestedArchive: false,
        confidence: 65,
        reasoning: (() => {
          let priorityLevel: string;
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          if (priorityScore >= 80) {
            priorityLevel = "High priority";
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          } else if (priorityScore >= 60) {
            priorityLevel = "Medium priority";
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          } else if (priorityScore >= 40) {
            priorityLevel = "Low priority";
          } else {
            priorityLevel = "Very low priority";
          }
          return `Based on priority score: ${priorityScore.toFixed(1)}. ${priorityLevel}`;
        })(),
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
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    if (priorityScore >= 80) {
      priorityBasedStars = 3;
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    } else if (priorityScore >= 60) {
      priorityBasedStars = 2;
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    } else if (priorityScore >= 40) {
      priorityBasedStars = 1;
    } else {
      priorityBasedStars = 0;
    }

    const prompt = `Analyze this email and suggest a triage action based on priority and importance.

Email from: ${email.fromName || email.from}
Subject: ${email.subject || "(no subject)"}
Body preview: ${(email.body || "").substring(0, 500)}${patternContext}

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
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          confidence: Math.max(0, Math.min(100, parsed.confidence || 50)),
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
      suggestedStarCount: 0,
      suggestedArchive: false,
      confidence: 50,
      reasoning: "Unable to analyze email",
    };
  }

  /**
   * Analyze sender patterns from recent emails
   */
  private analyzeSenderPatterns(
    emails: Email[],
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const starCount = (email as any).starCount ?? 0;
      if (starCount > 0) {
        pattern.starCounts.push(starCount);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((email as any).isArchived) {
        pattern.archived++;
      }
    }

    const result = new Map<
      string,
      { avgStarCount: number; archiveRate: number }
    >();
    for (const [sender, pattern] of patterns.entries()) {
      if (pattern.total >= 2) {
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
}
