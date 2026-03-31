import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EmailsService } from "../emails/emails.service";
import {
  decryptSummarizationRuleEntityForApi,
  decryptUserContextEntityForApi,
} from "../encryption/entity-api-decrypt.util";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import {
  cleanEmailContent,
  cleanEmailForThread,
} from "../llm/email-content-cleaner";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { getPrompt, SUMMARY_PROMPT_IDS, SUMMARY_TYPES } from "../llm/prompts";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { matchAny } from "./pattern-matcher";
import { PhishingSignal, PhishingSignals } from "./phishing-detection.service";
import {
  buildPhishingCacheKey,
  buildPhishingContext,
} from "./summarization.helpers";
import {
  EmailWithHtmlBody,
  SummarizationRule,
  SummarizeWithPhishingResult,
  ThreadData,
} from "./summarization.types";

export type { SummarizationRule } from "./summarization.types";

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
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private errorTrackingService: ErrorTrackingService,
    private usersService: UsersService,
  ) {}

  /**
   * Fetch user email categories and format them as a prompt-ready string.
   * Returns an empty string when no custom categories exist (prompts fall back to defaults).
   */
  private async buildEmailCategoriesPromptText(
    userId: string,
  ): Promise<string> {
    const categories = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    });
    if (categories.length === 0) return "";
    for (const ctx of categories) {
      decryptUserContextEntityForApi(ctx);
    }
    return categories
      .map((ctx) => {
        const parts = ctx.contextValue.split(" - ");
        const name = parts[0].trim();
        const description =
          parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";
        return description ? `- ${name}: ${description}` : `- ${name}`;
      })
      .join("\n");
  }

  private async getUserEmail(userId: string): Promise<string> {
    const user = await this.usersService.findOneForAuth(userId);
    return user?.email?.toLowerCase() || "";
  }

  private extractEmailAddress(from: string | undefined): string {
    if (!from) return "";
    const match = from.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase();
    return from.toLowerCase().trim();
  }

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

  private async generateLLMSummary(options: {
    email: EmailWithHtmlBody & { subject?: string };
    subject: string;
    threadText: string;
    messagesToSummarize: Array<unknown>;
    allThreadEmails: Array<unknown>;
    rule: SummarizationRule;
    userId: string;
    emailId: string;
  }): Promise<string> {
    const {
      email,
      subject,
      threadText,
      messagesToSummarize,
      allThreadEmails,
      rule,
      userId,
    } = options;
    const llmProvider: LLMProvider | undefined = rule.provider ?? undefined;
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
      const customPromptConfig = getPrompt(SUMMARY_PROMPT_IDS.CUSTOM);
      const systemPrompt = customPromptConfig?.systemPrompt ?? "";
      return this.llmService.generateText(
        {
          prompt,
          systemPrompt,
          temperature: 0.5,
          maxTokens: 500,
          userId,
        },
        llmProvider,
        userId,
      );
    }

    const body = messagesToSummarize.length > 1 ? threadText : cleanedBody;
    return this.llmService.summarizeEmail(
      body,
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
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
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

    try {
      return await this.generateLLMSummary({
        email: { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      });
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

  private resolvePhishingSignalFromLLM(
    llmPhishing:
      | import("./phishing-detection.service").PhishingLLMResult
      | null,
  ): PhishingSignal | null {
    if (!llmPhishing || !llmPhishing.is_phishing) return null;
    return { confidence: llmPhishing.confidence, reason: llmPhishing.reason };
  }

  /** Summarize an email + check for phishing in one LLM call. LLM verdict only — keyword signals are hints, not verdicts. */
  async summarizeEmailWithPhishing(
    userId: string,
    emailId: string,
    rule: SummarizationRule,
    prefetchedEmail?: Awaited<ReturnType<EmailsService["getEmailById"]>>,
  ): Promise<SummarizeWithPhishingResult> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
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

    const { phishingSignals } = buildPhishingContext(allThreadEmails);

    const cacheKey = buildPhishingCacheKey(email.from, email.subject);
    const cached = this.phishingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const summary = await this.generateLLMSummary({
        email: { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      });
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

    const llmProvider: LLMProvider | undefined = rule.provider ?? undefined;
    const isUserSender = this.isEmailFromUser(email.from, userEmail);
    const bodyForLLM =
      messagesToSummarize.length > 1
        ? threadText
        : cleanEmailContent(emailWithHtml.body, emailWithHtml.htmlBody);
    const emailCategories = await this.buildEmailCategoriesPromptText(userId);

    return this.summarizeEmailWithCombinedPhishing(emailWithHtml, {
      subject,
      threadText,
      bodyForLLM,
      messagesToSummarize,
      allThreadEmails,
      phishingSignals,
      cacheKey,
      rule,
      llmProvider,
      userId,
      emailId,
      isUserSender,
      from: email.from || "",
      fromName: email.fromName || "",
      emailCategories,
    });
  }

  private async summarizeEmailWithCombinedPhishing(
    emailWithHtml: EmailWithHtmlBody,
    options: {
      subject: string;
      threadText: string;
      bodyForLLM: string;
      messagesToSummarize: Array<unknown>;
      allThreadEmails: Array<unknown>;
      phishingSignals: PhishingSignals;
      cacheKey: string;
      rule: SummarizationRule;
      llmProvider: LLMProvider | undefined;
      userId: string;
      emailId: string;
      isUserSender?: boolean;
      from?: string;
      fromName?: string;
      existingActions?: string[];
      emailCategories?: string;
    },
  ): Promise<SummarizeWithPhishingResult> {
    const {
      subject,
      threadText,
      bodyForLLM,
      messagesToSummarize,
      allThreadEmails,
      phishingSignals,
      cacheKey,
      rule,
      llmProvider,
      userId,
      emailId,
      isUserSender = false,
      from = "",
      fromName = "",
      existingActions = [],
      emailCategories = "",
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
        emailCategories,
      });

      const phishingSignal = this.resolvePhishingSignalFromLLM(result.phishing);

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
      return this.summarizeEmailFallback({
        emailWithHtml,
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      });
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
    emailCategories: string;
  }) {
    if (params.rule.type === SUMMARY_TYPES.CUSTOM) {
      if (!params.rule.customPrompt) {
        throw new Error(
          `Summarization rule is type "custom" but has no customPrompt — cannot summarize`,
        );
      }
      return this.llmService.summarizeCustomPromptWithPhishing({
        emailBody: params.bodyForLLM,
        emailSubject: params.subject,
        customPrompt: params.rule.customPrompt,
        phishingSignals: params.phishingSignals,
        isThread: params.messagesToSummarize.length > 1,
        totalMessageCount: params.allThreadEmails.length,
        provider: params.llmProvider,
        userId: params.userId,
      });
    }
    const summaryType =
      params.rule.type === SUMMARY_TYPES.SENDER_REQUEST
        ? SUMMARY_TYPES.TLDR
        : params.rule.type;
    return this.llmService.summarizeEmailWithPhishingCheck({
      emailBody: params.bodyForLLM,
      emailSubject: params.subject,
      summaryType,
      phishingSignals: params.phishingSignals,
      provider: params.llmProvider,
      userId: params.userId,
      isUserSender: params.isUserSender,
      from: params.from,
      fromName: params.fromName,
      existingActions: params.existingActions,
      emailCategories: params.emailCategories,
    });
  }

  private async summarizeEmailFallback(options: {
    emailWithHtml: EmailWithHtmlBody;
    subject: string;
    threadText: string;
    messagesToSummarize: Array<unknown>;
    allThreadEmails: Array<unknown>;
    rule: SummarizationRule;
    userId: string;
    emailId: string;
  }): Promise<SummarizeWithPhishingResult> {
    const {
      emailWithHtml,
      subject,
      threadText,
      messagesToSummarize,
      allThreadEmails,
      rule,
      userId,
      emailId,
    } = options;
    try {
      const summary = await this.generateLLMSummary({
        email: { ...emailWithHtml, subject },
        subject,
        threadText,
        messagesToSummarize,
        allThreadEmails,
        rule,
        userId,
        emailId,
      });
      return {
        summary,
        // fail-safe: no phishing alert without LLM verdict
        phishingSignal: null,
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

  /** Batch summarize threads in parallel (one LLM call per thread). */
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
    const userRules = await this.getSummarizationRules(userId);
    const userEmail = await this.getUserEmail(userId);
    const threadsToSummarize: ThreadData[] = [];
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
    const rules = await this.summarizationRuleRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    for (const rule of rules) {
      decryptSummarizationRuleEntityForApi(rule);
    }
    return rules;
  }

  /** Deterministic rule matching (fromPatterns + subjectPatterns). First match wins. No LLM call. */
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

  /** Summarize with automatic rule matching (recommended for job processing). */
  async summarizeEmailWithAutoRule(
    userId: string,
    emailId: string,
    prefetchedEmail?: Awaited<ReturnType<EmailsService["getEmailById"]>>,
    prefetchedRules?: SummarizationRuleEntity[],
  ): Promise<SummarizeWithPhishingResult> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const userRules =
      prefetchedRules || (await this.getSummarizationRules(userId));
    const matchedRule = this.matchRuleDeterministic(
      { from: email.from, subject: email.subject },
      userRules,
    );
    const rule: SummarizationRule = matchedRule
      ? { type: SUMMARY_TYPES.CUSTOM, customPrompt: matchedRule.howToSummarize }
      : { type: SUMMARY_TYPES.TLDR };
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

  /** Match a rule for a specific email. No LLM call. */
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
