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
import { matchAny } from "./pattern-matcher";
import { PhishingSignal, PhishingSignals } from "./phishing-detection.service";
import {
  buildPhishingCacheKey,
  buildPhishingContext,
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
    const matchedRule = this.matchRuleDeterministic(
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
  ): Promise<{
    summary: string;
    phishingSignal: PhishingSignal | null;
    sentimentScore: number | null;
    sentimentExplanation: string | null;
    category: string | null;
    categoryExplanation: string | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
  }> {
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
      return {
        summary,
        phishingSignal: cached.signal,
        sentimentScore: null,
        sentimentExplanation: null,
        category: null,
        categoryExplanation: null,
        actionItems: null,
      };
    }

    let llmProvider: LLMProvider | undefined;
    if (rule.provider) {
      llmProvider = rule.provider;
    }

    const isUserSender = this.isEmailFromUser(email.from, userEmail);
    const from = email.from || "";
    const fromName = email.fromName || "";

    const bodyForLLM =
      messagesToSummarize.length > 1
        ? threadText
        : cleanEmailContent(emailWithHtml.body, emailWithHtml.htmlBody);

    return this.summarizeEmailWithCombinedPhishing(emailWithHtml, {
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
      isUserSender,
      from,
      fromName,
    });
  }

  /**
   * Run summary + phishing analysis in a single combined LLM call.
   *
   * For standard types (tldr, bullet-points, action-items, sender-request)
   * the prompt templates already embed phishing instructions.
   *
   * For custom prompts the phishing footer is injected at build time by
   * `llmService.summarizeCustomPromptWithPhishing()`, so a single call still
   * covers both concerns — no separate `checkPhishingOnly()` is needed.
   */
  private async summarizeEmailWithCombinedPhishing(
    emailWithHtml: EmailWithHtmlBody,
    options: {
      subject: string;
      threadText: string;
      bodyForLLM: string;
      messagesToSummarize: Array<unknown>;
      allThreadEmails: Array<unknown>;
      phishingSignals: PhishingSignals;
      keywordFallbackSignal: PhishingSignal | null;
      cacheKey: string;
      rule: SummarizationRule;
      llmProvider: LLMProvider | undefined;
      userId: string;
      emailId: string;
      isUserSender?: boolean;
      from?: string;
      fromName?: string;
      existingActions?: string[];
    },
  ): Promise<{
    summary: string;
    phishingSignal: PhishingSignal | null;
    sentimentScore: number | null;
    sentimentExplanation: string | null;
    category: string | null;
    categoryExplanation: string | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
  }> {
    const {
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
      isUserSender = false,
      from = "",
      fromName = "",
      existingActions = [],
    } = options;
    try {
      const result = await this.runLLMSummarize({
        rule,
        bodyForLLM,
        subject,
        phishingSignals,
        messagesToSummarize,
        allThreadEmails,
        llmProvider,
        userId,
        isUserSender,
        from,
        fromName,
        existingActions,
      });

      const phishingSignal = this.resolvePhishingSignalFromLLM(
        result.phishing,
        keywordFallbackSignal,
      );

      this.phishingCache.set(cacheKey, {
        signal: phishingSignal,
        expiresAt: Date.now() + MILLISECONDS.HOUR,
      });

      return {
        summary: result.summary,
        phishingSignal,
        sentimentScore: result.sentiment?.score ?? null,
        sentimentExplanation: result.sentiment?.explanation ?? null,
        category: result.category,
        categoryExplanation: result.categoryExplanation,
        actionItems: result.actionItems ?? null,
      };
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

  /** Dispatch to the appropriate LLM summarization path based on rule type. */
  private async runLLMSummarize(params: {
    rule: SummarizationRule;
    bodyForLLM: string;
    subject: string;
    phishingSignals: PhishingSignals;
    messagesToSummarize: Array<unknown>;
    allThreadEmails: Array<unknown>;
    llmProvider: LLMProvider | undefined;
    userId: string;
    isUserSender: boolean;
    from: string;
    fromName: string;
    existingActions: string[];
  }) {
    if (params.rule.type === SUMMARY_TYPES.CUSTOM) {
      if (!params.rule.customPrompt) {
        throw new Error(
          `Summarization rule is type "custom" but has no customPrompt — cannot summarize`,
        );
      }
      return this.llmService.summarizeCustomPromptWithPhishing(
        params.bodyForLLM,
        params.subject,
        params.rule.customPrompt,
        params.phishingSignals,
        params.messagesToSummarize.length > 1,
        params.allThreadEmails.length,
        params.llmProvider,
        params.userId,
      );
    }
    const summaryType =
      params.rule.type === SUMMARY_TYPES.SENDER_REQUEST
        ? SUMMARY_TYPES.TLDR
        : params.rule.type;
    return this.llmService.summarizeEmailWithPhishingCheck(
      params.bodyForLLM,
      params.subject,
      summaryType,
      params.phishingSignals,
      params.llmProvider,
      params.userId,
      params.isUserSender,
      params.from,
      params.fromName,
      params.existingActions,
    );
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
  ): Promise<{
    summary: string;
    phishingSignal: PhishingSignal | null;
    sentimentScore: number | null;
    sentimentExplanation: string | null;
    category: string | null;
    categoryExplanation: string | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
  }> {
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
      return {
        summary,
        phishingSignal: keywordFallbackSignal,
        sentimentScore: null,
        sentimentExplanation: null,
        category: null,
        categoryExplanation: null,
        actionItems: null,
      };
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
   * Deterministic rule matching using structured `fromPatterns` and
   * `subjectPatterns` columns. No LLM call. First match (sorted by ascending
   * priority, then by ascending `createdAt`) wins.
   *
   * Pattern semantics:
   *  - Empty `fromPatterns` array   → matches any sender
   *  - Empty `subjectPatterns` array → matches any subject
   *  - `/regex/flags`               → JavaScript RegExp
   *  - `*@domain.com`               → glob wildcard (prefix only)
   *  - `plain text`                 → case-insensitive substring
   *
   * @param email The email to match rules against
   * @param rules Array of user's summarization rules
   * @returns Matched rule or null if no rule matches
   */
  matchRuleDeterministic(
    email: { from?: string; subject?: string },
    rules: SummarizationRuleEntity[],
  ): SummarizationRuleEntity | null {
    if (rules.length === 0) {
      return null;
    }

    const sorted = [...rules].sort(
      (ruleA, ruleB) =>
        ruleA.priority - ruleB.priority ||
        new Date(ruleA.createdAt).getTime() -
          new Date(ruleB.createdAt).getTime(),
    );

    for (const rule of sorted) {
      const fromOk = matchAny(email.from ?? "", rule.fromPatterns);
      const subjectOk = matchAny(email.subject ?? "", rule.subjectPatterns);
      if (fromOk && subjectOk) {
        return rule;
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
  ): Promise<{
    summary: string;
    phishingSignal: PhishingSignal | null;
    sentimentScore: number | null;
    sentimentExplanation: string | null;
    category: string | null;
    categoryExplanation: string | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
  }> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error("Email not found");
    }

    // Fetch user's summarization rules (or use prefetched)
    const userRules =
      prefetchedRules || (await this.getSummarizationRules(userId));

    // Deterministic match using structured patterns (no LLM call)
    const matchedRule = this.matchRuleDeterministic(
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
    rule: {
      whenToUse: string;
      howToSummarize: string;
      fromPatterns?: string[];
      subjectPatterns?: string[];
      priority?: number;
    },
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
    updates: {
      whenToUse?: string;
      howToSummarize?: string;
      fromPatterns?: string[];
      subjectPatterns?: string[];
      priority?: number;
    },
  ): Promise<SummarizationRuleEntity> {
    await this.summarizationRuleRepository.update({ ruleId, userId }, updates);
    return this.summarizationRuleRepository.findOne({
      where: { ruleId, userId },
    });
  }

  async deleteSummarizationRule(userId: string, ruleId: string): Promise<void> {
    await this.summarizationRuleRepository.delete({ ruleId, userId });
  }

  /**
   * Match a rule for a specific email using deterministic pattern matching.
   * Used by the `POST /summarize/match-rule/:id` endpoint for debugging.
   * No LLM call — fully deterministic.
   */
  async matchRuleForEmail(
    userId: string,
    emailId: string,
  ): Promise<SummarizationRuleEntity | null> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      return null;
    }

    const rules = await this.getSummarizationRules(userId);
    return this.matchRuleDeterministic(
      { from: email.from, subject: email.subject },
      rules,
    );
  }
}
