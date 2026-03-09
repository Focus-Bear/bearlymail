import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { EmailsService } from "../emails/emails.service";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import {
  cleanEmailContent,
  cleanEmailForThread,
} from "../llm/email-content-cleaner";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { SUMMARY_TYPES, SummaryType } from "../llm/prompts";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { PhishingSignal, PhishingSignals } from "./phishing-detection.service";
import {
  buildPhishingCacheKey,
  buildPhishingContext,
  matchRuleWithLLM,
} from "./summarization.helpers";

interface ThreadData {
  emailId: string;
  email: {
    body: string;
    subject?: string;
    from?: string;
    fromName?: string;
    threadId: string;
    receivedAt: Date | string;
  };
  threadText: string;
  isThread: boolean;
  messageCount: number;
  matchedRule: SummarizationRuleEntity | null;
}

export interface SummarizationRule {
  type: SummaryType;
  customPrompt?: string;
  provider?: LLMProvider;
}

/**
 * Email with optional htmlBody for summarization
 * (The Email entity has htmlBody but it may not be in the return type)
 */
interface EmailWithHtmlBody {
  body: string;
  htmlBody?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  threadId?: string;
  receivedAt?: Date | string;
}

@Injectable()
export class SummarizationService {
  private readonly phishingCache = new Map<
    string,
    { signal: PhishingSignal | null; expiresAt: number }
  >();

  constructor(
    private emailsService: EmailsService,
    private llmService: LLMService,
    @InjectRepository(SummarizationRuleEntity)
    private summarizationRuleRepository: Repository<SummarizationRuleEntity>,
    private errorTrackingService: ErrorTrackingService,
    private usersService: UsersService,
  ) {}

  /**
   * Get user email address for identifying user's messages in threads.
   * Extracted as helper method per DRY principle.
   */
  private async getUserEmail(userId: string): Promise<string> {
    const user = await this.usersService.findOneForAuth(userId);
    return user?.email?.toLowerCase() || "";
  }

  /**
   * Extract email address from a "from" field for comparison.
   * Handles formats like "Name <email@example.com>" or just "email@example.com"
   */
  private extractEmailAddress(from: string | undefined): string {
    if (!from) return "";
    const match = from.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase();
    return from.toLowerCase().trim();
  }

  /**
   * Check if an email is from the user using strict equality.
   * Uses exact match to prevent sender spoofing attacks.
   */
  private isEmailFromUser(
    emailFrom: string | undefined,
    userEmail: string,
  ): boolean {
    if (!userEmail || !emailFrom) return false;
    const senderEmail = this.extractEmailAddress(emailFrom);
    return senderEmail === userEmail;
  }

  private buildThreadText(
    messagesToSummarize: Array<{
      body: string;
      fromName?: string;
      from?: string;
      receivedAt: Date | string;
    }>,
    allThreadEmails: Array<unknown>,
    userEmail: string = "",
  ): string {
    const sliceCount = Math.abs(CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE);
    return messagesToSummarize
      .map((emailEntry, idx) => {
        const emailWithHtml = emailEntry as EmailWithHtmlBody;
        const isFromUser = this.isEmailFromUser(emailEntry.from, userEmail);
        const sender = isFromUser
          ? "You"
          : emailEntry.fromName || emailEntry.from;
        const date = new Date(emailEntry.receivedAt).toLocaleString();
        const cleanedBody = cleanEmailForThread(
          emailEntry.body,
          emailWithHtml.htmlBody,
        );
        const messageLabel =
          idx === 0 && allThreadEmails.length > sliceCount + 1
            ? "Original"
            : `Message ${idx + 1}`;
        return `[${messageLabel} from ${sender} on ${date}]:\n"""\n${cleanedBody}\n"""`;
      })
      .join("\n\n---\n\n");
  }

  private async generateLLMSummary(
    email: EmailWithHtmlBody & { subject?: string },
    subject: string,
    threadText: string,
    messagesToSummarize: Array<unknown>,
    allThreadEmails: Array<unknown>,
    rule: SummarizationRule,
    userId: string,
    _emailId: string,
  ): Promise<string> {
    let llmProvider: LLMProvider | undefined;
    if (rule.provider) {
      llmProvider = rule.provider;
    }

    const cleanedBody = cleanEmailContent(email.body, email.htmlBody);

    if (rule.type === SUMMARY_TYPES.CUSTOM) {
      if (!rule.customPrompt) {
        throw new Error(
          `Summarization rule is type "custom" but has no customPrompt — cannot summarize`,
        );
      }
      const prompt =
        messagesToSummarize.length > 1
          ? `Email Thread Subject: ${subject}\n\nThis thread contains ${allThreadEmails.length} messages. Here are the key messages (first + last few):\n\n${threadText}\n\n${rule.customPrompt}`
          : `Email Subject: ${subject}\n\nEmail Body:\n"""\n${cleanedBody}\n"""\n\n${rule.customPrompt}`;

      return this.llmService.generateText(
        {
          prompt,
          systemPrompt:
            "You are a helpful assistant that summarizes email threads according to user instructions.",
          temperature: 0.5,
          maxTokens: 500,
          userId,
        },
        llmProvider,
        userId,
      );
    }

    if (messagesToSummarize.length > 1) {
      return this.llmService.summarizeEmail(
        threadText,
        subject,
        rule.type,
        llmProvider,
        userId,
      );
    }
    return this.llmService.summarizeEmail(
      cleanedBody,
      subject,
      rule.type,
      llmProvider,
      userId,
    );
  }

  private async prepareThreadDataEntry(
    email: NonNullable<Awaited<ReturnType<EmailsService["getEmailById"]>>>,
    emailId: string,
    userId: string,
    userRules: SummarizationRuleEntity[],
    userEmail: string,
  ): Promise<ThreadData> {
    const allThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 20, order: "ASC" },
    );

    const sliceCount = Math.abs(CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE);
    let messagesToSummarize: typeof allThreadEmails;
    if (allThreadEmails.length <= sliceCount + 1) {
      messagesToSummarize = allThreadEmails;
    } else {
      const firstEmail = allThreadEmails[0];
      const lastNEmails = allThreadEmails.slice(
        CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE,
      );
      messagesToSummarize = [firstEmail, ...lastNEmails];
    }

    const threadText = this.buildThreadText(
      messagesToSummarize,
      allThreadEmails,
      userEmail,
    );
    const matchedRule = this.matchRuleFast(
      { from: email.from, subject: email.subject },
      userRules,
    );

    return {
      emailId,
      email,
      threadText:
        threadText ||
        cleanEmailContent(email.body, (email as EmailWithHtmlBody).htmlBody),
      isThread: messagesToSummarize.length > 1,
      messageCount: messagesToSummarize.length,
      matchedRule,
    };
  }

  private async processBatchRuleGroup(
    ruleKey: string | null,
    threads: ThreadData[],
    userId: string,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const rule = threads[0].matchedRule;
    const batchData = threads.map((item, idx) => ({
      index: idx,
      subject: item.email.subject || "",
      body: item.threadText,
      isThread: item.isThread,
      messageCount: item.messageCount,
    }));

    try {
      const threadEmailIds = threads.map((item) => item.emailId);
      const summaryMap = await this.llmService.summarizeThreads(
        batchData,
        undefined,
        userId,
        rule?.howToSummarize,
        threadEmailIds,
      );
      threads.forEach((item, idx) => {
        const summary = summaryMap.get(idx);
        if (summary) {
          result.set(item.emailId, summary);
        }
      });
    } catch (error) {
      logError(
        `Thread summarization failed for rule ${ruleKey || "default"}, falling back to individual calls`,
        error instanceof Error ? error : new Error(String(error)),
      );
      for (const item of threads) {
        try {
          const summary = await this.summarizeEmail(userId, item.emailId, {
            type: rule ? SUMMARY_TYPES.CUSTOM : SUMMARY_TYPES.TLDR,
            customPrompt: rule?.howToSummarize,
          });
          result.set(item.emailId, summary);
        } catch (summaryError) {
          logError(
            `Failed to summarize thread for email ${item.emailId}`,
            summaryError instanceof Error
              ? summaryError
              : new Error(String(summaryError)),
          );
        }
      }
    }

    return result;
  }

  async summarizeEmail(
    userId: string,
    emailId: string,
    rule: SummarizationRule,
    prefetchedEmail?: Awaited<ReturnType<EmailsService["getEmailById"]>>,
  ): Promise<string> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error("Email not found");
    }

    const userEmail = await this.getUserEmail(userId);

    const allThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 20, order: "ASC" },
    );

    const sliceCount = Math.abs(CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE);
    let messagesToSummarize: typeof allThreadEmails;
    if (allThreadEmails.length <= sliceCount + 1) {
      messagesToSummarize = allThreadEmails;
    } else {
      const firstEmail = allThreadEmails[0];
      const lastNEmails = allThreadEmails.slice(
        CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE,
      );
      messagesToSummarize = [firstEmail, ...lastNEmails];
    }

    const threadText = this.buildThreadText(
      messagesToSummarize,
      allThreadEmails,
      userEmail,
    );
    const emailWithHtml = email as EmailWithHtmlBody;
    const subject = email.subject || "";

    try {
      return await this.generateLLMSummary(
        { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorTrackingService.captureException(err, userId, {
        operation: "summarize_email",
        ruleType: rule.type,
        emailId,
      });
      throw err;
    }
  }

  /**
   * Convert a PhishingLLMResult (or null) to a PhishingSignal for the caller.
   * If LLM verdict is null (no JSON / no phishing field), returns keyword fallback.
   * If LLM says safe (is_phishing: false), returns null, clearing keyword false-positives.
   */
  private resolvePhishingSignalFromLLM(
    llmPhishing:
      | import("./phishing-detection.service").PhishingLLMResult
      | null,
    keywordFallback: PhishingSignal | null,
  ): PhishingSignal | null {
    if (llmPhishing === null) {
      return keywordFallback;
    }
    if (!llmPhishing.is_phishing) {
      return null;
    }
    return { confidence: llmPhishing.confidence, reason: llmPhishing.reason };
  }

  /**
   * Summarize an email AND check for phishing using a single LLM call.
   *
   * LLM phishing analysis always runs. Keyword signals from
   * extractPhishingSignals() are passed as context to help the LLM reason,
   * but they do NOT gate whether LLM analysis runs — the LLM always decides.
   *
   * Graceful degradation:
   * - LLM call throws → falls back to generateLLMSummary + keyword signal
   * - LLM returns invalid JSON → null phishing field → keyword fallback
   * - LLM returns phishing: null → keyword signal used as fallback
   * - LLM returns is_phishing: false → keyword signal suppressed (fixes false positives)
   * - LLM returns is_phishing: true → LLM signal returned with LLM's confidence + reason
   */
  async summarizeEmailWithPhishing(
    userId: string,
    emailId: string,
    rule: SummarizationRule,
    prefetchedEmail?: Awaited<ReturnType<EmailsService["getEmailById"]>>,
  ): Promise<{ summary: string; phishingSignal: PhishingSignal | null }> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error("Email not found");
    }

    const userEmail = await this.getUserEmail(userId);
    const allThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 20, order: "ASC" },
    );

    const sliceCount = Math.abs(CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE);
    const messagesToSummarize =
      allThreadEmails.length <= sliceCount + 1
        ? allThreadEmails
        : [
            allThreadEmails[0],
            ...allThreadEmails.slice(CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE),
          ];

    const threadText = this.buildThreadText(
      messagesToSummarize,
      allThreadEmails,
      userEmail,
    );
    const emailWithHtml = email as EmailWithHtmlBody;
    const subject = email.subject || "";

    const { phishingSignals, keywordFallbackSignal } =
      buildPhishingContext(allThreadEmails);

    const cacheKey = buildPhishingCacheKey(email.from, email.subject);
    const cached = this.phishingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const summary = await this.generateLLMSummary(
        { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      );
      return { summary, phishingSignal: cached.signal };
    }

    let llmProvider: LLMProvider | undefined;
    if (rule.provider) {
      llmProvider = rule.provider;
    }

    const bodyForLLM =
      messagesToSummarize.length > 1
        ? threadText
        : cleanEmailContent(emailWithHtml.body, emailWithHtml.htmlBody);

    // Custom prompts do not include phishing analysis instructions — delegate
    // to the dedicated helper that runs summary + phishing as separate calls.
    // Guard on rule.type alone (not rule.customPrompt) so that a custom rule
    // without a prompt is never silently downgraded to tldr — it errors loudly.
    if (rule.type === SUMMARY_TYPES.CUSTOM) {
      if (!rule.customPrompt) {
        throw new Error(
          `Summarization rule is type "custom" but has no customPrompt — cannot summarize`,
        );
      }
      return this.summarizeEmailWithCustomPromptAndPhishing(
        emailWithHtml,
        subject,
        threadText,
        bodyForLLM,
        messagesToSummarize,
        allThreadEmails,
        phishingSignals,
        keywordFallbackSignal,
        cacheKey,
        rule,
        llmProvider,
        userId,
        emailId,
      );
    }

    return this.summarizeEmailWithCombinedPhishing(
      emailWithHtml,
      subject,
      threadText,
      bodyForLLM,
      messagesToSummarize,
      allThreadEmails,
      phishingSignals,
      keywordFallbackSignal,
      cacheKey,
      rule,
      llmProvider,
      userId,
      emailId,
    );
  }

  /**
   * Run the user's custom prompt for summarisation, then run a SEPARATE
   * lightweight phishing-only LLM call. Custom prompts do not embed phishing
   * instructions, so the two concerns are kept independent.
   */
  private async summarizeEmailWithCustomPromptAndPhishing(
    emailWithHtml: EmailWithHtmlBody,
    subject: string,
    threadText: string,
    bodyForLLM: string,
    messagesToSummarize: Array<unknown>,
    allThreadEmails: Array<unknown>,
    phishingSignals: PhishingSignals,
    keywordFallbackSignal: PhishingSignal | null,
    cacheKey: string,
    rule: SummarizationRule,
    llmProvider: LLMProvider | undefined,
    userId: string,
    emailId: string,
  ): Promise<{ summary: string; phishingSignal: PhishingSignal | null }> {
    try {
      const [summary, llmPhishing] = await Promise.all([
        this.generateLLMSummary(
          { ...emailWithHtml, subject },
          subject,
          threadText,
          messagesToSummarize,
          allThreadEmails,
          rule,
          userId,
          emailId,
        ),
        this.llmService.checkPhishingOnly(
          bodyForLLM,
          subject,
          phishingSignals,
          llmProvider,
          userId,
        ),
      ]);

      const phishingSignal = this.resolvePhishingSignalFromLLM(
        llmPhishing,
        keywordFallbackSignal,
      );

      this.phishingCache.set(cacheKey, {
        signal: phishingSignal,
        expiresAt: Date.now() + MILLISECONDS.HOUR,
      });

      return { summary, phishingSignal };
    } catch (error) {
      logError(
        "Custom prompt summarization with phishing check failed, falling back",
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.summarizeEmailFallback(
        emailWithHtml,
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
        keywordFallbackSignal,
      );
    }
  }

  /**
   * Run summary + phishing analysis in a single combined LLM call.
   * Used for all non-custom prompt types (tldr, bullet-points, action-items,
   * sender-request). The prompt templates for these types embed phishing
   * analysis instructions so a single call covers both concerns.
   */
  private async summarizeEmailWithCombinedPhishing(
    emailWithHtml: EmailWithHtmlBody,
    subject: string,
    threadText: string,
    bodyForLLM: string,
    messagesToSummarize: Array<unknown>,
    allThreadEmails: Array<unknown>,
    phishingSignals: PhishingSignals,
    keywordFallbackSignal: PhishingSignal | null,
    cacheKey: string,
    rule: SummarizationRule,
    llmProvider: LLMProvider | undefined,
    userId: string,
    emailId: string,
  ): Promise<{ summary: string; phishingSignal: PhishingSignal | null }> {
    const summaryType =
      rule.type === SUMMARY_TYPES.SENDER_REQUEST
        ? SUMMARY_TYPES.TLDR
        : rule.type;

    try {
      const result = await this.llmService.summarizeEmailWithPhishingCheck(
        bodyForLLM,
        subject,
        summaryType,
        phishingSignals,
        llmProvider,
        userId,
      );

      const phishingSignal = this.resolvePhishingSignalFromLLM(
        result.phishing,
        keywordFallbackSignal,
      );

      this.phishingCache.set(cacheKey, {
        signal: phishingSignal,
        expiresAt: Date.now() + MILLISECONDS.HOUR,
      });

      return { summary: result.summary, phishingSignal };
    } catch (error) {
      logError(
        "LLM summarization with phishing check failed, falling back",
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.summarizeEmailFallback(
        emailWithHtml,
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
        keywordFallbackSignal,
      );
    }
  }

  /**
   * Fallback path when the combined LLM summarize+phishing call fails.
   * Uses separate summary generation and returns the keyword-only phishing signal.
   */
  private async summarizeEmailFallback(
    emailWithHtml: EmailWithHtmlBody,
    subject: string,
    threadText: string,
    messagesToSummarize: Array<unknown>,
    allThreadEmails: Array<unknown>,
    rule: SummarizationRule,
    userId: string,
    emailId: string,
    keywordFallbackSignal: PhishingSignal | null,
  ): Promise<{ summary: string; phishingSignal: PhishingSignal | null }> {
    try {
      const summary = await this.generateLLMSummary(
        { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      );
      return { summary, phishingSignal: keywordFallbackSignal };
    } catch (fallbackError) {
      const err =
        fallbackError instanceof Error
          ? fallbackError
          : new Error(String(fallbackError));
      this.errorTrackingService.captureException(err, userId, {
        operation: "summarize_email_with_phishing",
        ruleType: rule.type,
        emailId,
      });
      throw err;
    }
  }

  /**
   * Batch summarize multiple threads in parallel.
   * Each thread gets its own LLM call, but calls are fired concurrently for efficiency.
   * Note: This method is called with emailIds but summarizes at the THREAD level -
   * each email's thread is summarized, and the summary is applied to all emails in that thread.
   * @param userId User ID
   * @param emailIds Array of email IDs (one per thread to summarize)
   * @returns Map of email ID to thread summary string
   */
  async summarizeThreadBatch(
    userId: string,
    emailIds: string[],
  ): Promise<Map<string, string>> {
    if (emailIds.length === 0) {
      return new Map();
    }

    // Fetch all emails to get their thread information
    const emailPromises = emailIds.map((emailId) =>
      this.emailsService.getEmailById(userId, emailId),
    );
    const emails = await Promise.all(emailPromises);

    // Get user's summarization rules once (shared across all threads)
    const userRules = await this.getSummarizationRules(userId);

    // Get user email to identify which messages are from the user
    const userEmail = await this.getUserEmail(userId);

    const threadsToSummarize: ThreadData[] = [];

    // Fetch all messages in each thread and match summarization rules
    const threadPromises = emails.map(async (email, idx) => {
      if (!email) return null;
      return this.prepareThreadDataEntry(
        email,
        emailIds[idx],
        userId,
        userRules,
        userEmail,
      );
    });

    const threadResults = await Promise.all(threadPromises);
    for (const threadResult of threadResults) {
      if (threadResult) {
        threadsToSummarize.push(threadResult);
      }
    }

    if (threadsToSummarize.length === 0) {
      return new Map();
    }

    // Group threads by their matched summarization rule (or null for default)
    const threadsByRule = new Map<string | null, ThreadData[]>();
    for (const threadData of threadsToSummarize) {
      const ruleKey = threadData.matchedRule?.ruleId || null;
      if (!threadsByRule.has(ruleKey)) {
        threadsByRule.set(ruleKey, []);
      }
      threadsByRule.get(ruleKey)!.push(threadData);
    }

    const result = new Map<string, string>();

    // Process each rule group separately
    for (const [ruleKey, threads] of threadsByRule) {
      const groupResult = await this.processBatchRuleGroup(
        ruleKey,
        threads,
        userId,
      );
      for (const [emailId, summary] of groupResult) {
        result.set(emailId, summary);
      }
    }

    return result;
  }

  async getSummarizationRules(
    userId: string,
  ): Promise<SummarizationRuleEntity[]> {
    return this.summarizationRuleRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Fast rule matching using domain and keyword matching (no LLM call).
   * Used for automated summarization to avoid extra LLM overhead.
   * @param email The email to match rules against
   * @param rules Array of user's summarization rules
   * @returns Matched rule or null if no match
   */
  matchRuleFast(
    email: { from?: string; subject?: string },
    rules: SummarizationRuleEntity[],
  ): SummarizationRuleEntity | null {
    if (rules.length === 0) {
      return null;
    }

    const fromLower = (email.from || "").toLowerCase();
    const subjectLower = (email.subject || "").toLowerCase();

    for (const rule of rules) {
      const whenToUseLower = rule.whenToUse.toLowerCase();

      // Check for domain match (e.g., "emails from @company.com")
      const domainMatch = whenToUseLower.match(/@([a-z0-9.-]+)/i);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();
        const emailDomain = fromLower
          .match(/@([a-z0-9.-]+)/i)?.[1]
          ?.toLowerCase();
        if (emailDomain === domain) {
          return rule;
        }
      }

      // Check for keyword matches in the rule (simple fast matching)
      const keywords = whenToUseLower
        .split(/\s+/)
        .filter((word) => word.length > 3);
      for (const keyword of keywords) {
        if (subjectLower.includes(keyword) || fromLower.includes(keyword)) {
          return rule;
        }
      }
    }

    return null;
  }

  /**
   * Summarize an email with automatic rule matching.
   * Uses fast domain/keyword matching to find appropriate summarization rules.
   * This is the recommended method for automated job processing.
   * @param userId User ID
   * @param emailId Email ID
   * @param prefetchedEmail Optional pre-fetched email to avoid redundant DB query
   * @param prefetchedRules Optional pre-fetched rules to avoid redundant DB query
   * @returns Summary string
   */
  async summarizeEmailWithAutoRule(
    userId: string,
    emailId: string,
    prefetchedEmail?: Awaited<ReturnType<EmailsService["getEmailById"]>>,
    prefetchedRules?: SummarizationRuleEntity[],
  ): Promise<{ summary: string; phishingSignal: PhishingSignal | null }> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error("Email not found");
    }

    // Fetch user's summarization rules (or use prefetched)
    const userRules =
      prefetchedRules || (await this.getSummarizationRules(userId));

    // Fast match using domain/keyword (no LLM call)
    const matchedRule = this.matchRuleFast(
      { from: email.from, subject: email.subject },
      userRules,
    );

    // Build the SummarizationRule based on matched rule
    let rule: SummarizationRule;
    if (matchedRule) {
      rule = {
        type: SUMMARY_TYPES.CUSTOM,
        customPrompt: matchedRule.howToSummarize,
      };
    } else {
      rule = { type: SUMMARY_TYPES.TLDR };
    }

    // Pass prefetched email to avoid re-fetching; return both summary and phishing signal
    return this.summarizeEmailWithPhishing(userId, emailId, rule, email);
  }

  async createSummarizationRule(
    userId: string,
    rule: { whenToUse: string; howToSummarize: string },
  ): Promise<SummarizationRuleEntity> {
    const newRule = this.summarizationRuleRepository.create({
      ...rule,
      userId,
    });
    return this.summarizationRuleRepository.save(newRule);
  }

  async updateSummarizationRule(
    userId: string,
    ruleId: string,
    updates: { whenToUse?: string; howToSummarize?: string },
  ): Promise<SummarizationRuleEntity> {
    await this.summarizationRuleRepository.update({ ruleId, userId }, updates);
    return this.summarizationRuleRepository.findOne({
      where: { ruleId, userId },
    });
  }

  async deleteSummarizationRule(userId: string, ruleId: string): Promise<void> {
    await this.summarizationRuleRepository.delete({ ruleId, userId });
  }

  async matchRuleForEmail(
    userId: string,
    emailId: string,
  ): Promise<SummarizationRuleEntity | null> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      return null;
    }

    const rules = await this.getSummarizationRules(userId);
    if (rules.length === 0) {
      return null;
    }

    const emailWithHtml = email as EmailWithHtmlBody;
    const cleanedBody = cleanEmailContent(email.body, emailWithHtml.htmlBody);

    // Fast path: Check for exact domain matches
    const fromLower = (email.from || "").toLowerCase();
    for (const rule of rules) {
      const domainMatch = rule.whenToUse.toLowerCase().match(/@([a-z0-9.-]+)/i);
      if (domainMatch) {
        const emailDomain = fromLower
          .match(/@([a-z0-9.-]+)/i)?.[1]
          ?.toLowerCase();
        if (emailDomain === domainMatch[1].toLowerCase()) {
          return rule;
        }
      }
    }

    // LLM-based matching
    try {
      const llmResult = await matchRuleWithLLM(
        email,
        cleanedBody,
        rules,
        userId,
        this.llmService,
      );
      if (llmResult !== undefined) {
        return llmResult;
      }
    } catch (error) {
      logError(
        "LLM rule matching failed",
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Fallback: return first rule
    return rules[0];
  }
}
