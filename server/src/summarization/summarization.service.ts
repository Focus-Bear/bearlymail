import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { EmailsService } from "../emails/emails.service";
import { decryptSummarizationRuleEntityForApi } from "../encryption/entity-api-decrypt.util";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { LLMProvider, LLMService } from "../llm/llm.service";
import { extractPlainSummary } from "../llm/llm-summary-utils";
import { getPrompt, SUMMARY_PROMPT_IDS, SUMMARY_TYPES } from "../llm/prompts";
import { SchedulingPreferencesService } from "../scheduling-preferences/scheduling-preferences.service";
import { UsersService } from "../users/users.service";
import { logError } from "../utils/logger";
import { matchAny } from "./pattern-matcher";
import { PhishingSignal, PhishingSignals } from "./phishing-detection.service";
import {
  buildPhishingCacheKey,
  buildPhishingContext,
  buildSummaryDebug,
  buildThreadText,
  isEmailFromUser,
} from "./summarization.helpers";
import {
  EmailWithHtmlBody,
  SummarizationRule,
  SummarizeWithPhishingResult,
  SummarizeWithPhishingResultFull,
  ThreadData,
} from "./summarization.types";

export type { SummarizationRule } from "./summarization.types";

// Cap how many of a thread's messages are sent to the LLM for a summary. We
// take the most recent N (the prompt prioritises recent state) so very long
// threads — e.g. hundreds of notification emails — can't exhaust the context
// window or spike token cost.
const SUMMARY_THREAD_EMAIL_LIMIT = 100;

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
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private errorTrackingService: ErrorTrackingService,
    private usersService: UsersService,
    private schedulingPreferencesService: SchedulingPreferencesService,
  ) {}

  private async getUserEmail(userId: string): Promise<string> {
    const user = await this.usersService.findOneForAuth(userId);
    return user?.email?.toLowerCase() || "";
  }

  /**
   * The account owner's email + display name for the summary prompt. The name
   * lets the prompt anchor "you" to the real person so the summary never
   * refers to the account owner by name or says "you sent an email to
   * <yourself>".
   */
  private async getUserIdentity(
    userId: string,
  ): Promise<{ email: string; name: string }> {
    const user = await this.usersService.findOneForSummary(userId);
    return {
      email: user?.email?.toLowerCase() || "",
      name: (user?.displayName || user?.name || "").trim(),
    };
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
    const { name: userName } = await this.getUserIdentity(userId);
    return this.llmService.summarizeEmail(
      body,
      subject,
      rule.type,
      llmProvider,
      userId,
      userName,
    );
  }

  private async prepareThreadDataEntry(
    email: NonNullable<Awaited<ReturnType<EmailsService["getEmailById"]>>>,
    emailId: string,
    userId: string,
    userRules: SummarizationRuleEntity[],
    userEmail: string,
  ): Promise<ThreadData> {
    const allThreadEmails = await this.getRecentThreadEmailsChronological(
      userId,
      email.threadId,
    );

    const messagesToSummarize = allThreadEmails;
    const threadText = buildThreadText(
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

    const allThreadEmails = await this.getRecentThreadEmailsChronological(
      userId,
      email.threadId,
    );

    const messagesToSummarize = allThreadEmails;
    const threadText = buildThreadText(
      messagesToSummarize,
      allThreadEmails,
      userEmail,
    );
    const emailWithHtml = email as EmailWithHtmlBody;
    const mostRecentEmail = allThreadEmails[allThreadEmails.length - 1];
    const subject =
      allThreadEmails.length > 1
        ? mostRecentEmail?.subject || email.subject || ""
        : email.subject || "";

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
  ): Promise<SummarizeWithPhishingResultFull> {
    const email =
      prefetchedEmail ||
      (await this.emailsService.getEmailById(userId, emailId));
    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
    }

    const { email: userEmail, name: userName } =
      await this.getUserIdentity(userId);
    const allThreadEmails = await this.getRecentThreadEmailsChronological(
      userId,
      email.threadId,
    );

    const messagesToSummarize = allThreadEmails;

    const threadText = buildThreadText(
      messagesToSummarize,
      allThreadEmails,
      userEmail,
    );
    const emailWithHtml = email as EmailWithHtmlBody;
    // For threads use the most recent email's subject so the LLM isn't anchored
    // to whichever email the user happened to click — the summary should reflect
    // the current state of the thread, not the entry point.
    const mostRecent = allThreadEmails[allThreadEmails.length - 1];
    const subject =
      allThreadEmails.length > 1
        ? mostRecent?.subject || email.subject || ""
        : email.subject || "";

    const { phishingSignals } = buildPhishingContext(allThreadEmails);

    const cacheKey = buildPhishingCacheKey(email.from, email.subject);
    const cached = this.phishingCache.get(cacheKey);
    const { threadId } = email;
    const emailThreadId = email.emailThreadId ?? null;

    // Record exactly which emails were fed to the LLM so the admin debug panel
    // can reveal whether the most-recent thread messages were included (#summary-stale).
    const summaryDebug = buildSummaryDebug(
      threadId,
      allThreadEmails,
      messagesToSummarize,
    );

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
        actionItems: null,
        meetingProposal: null,
        threadId,
        emailThreadId,
        summaryDebug,
      };
    }

    const llmProvider: LLMProvider | undefined = rule.provider ?? undefined;
    const isUserSender = isEmailFromUser(email.from, userEmail);
    const bodyForLLM =
      messagesToSummarize.length > 1
        ? threadText
        : cleanEmailContent(emailWithHtml.body, emailWithHtml.htmlBody);

    const result = await this.summarizeEmailWithCombinedPhishing(
      emailWithHtml,
      {
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
        userName,
      },
    );
    return { ...result, threadId, emailThreadId, summaryDebug };
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
      userName?: string;
      existingActions?: string[];
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
      userName = "",
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
        userName,
        existingActions,
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
        actionItems: result.actionItems ?? null,
        meetingProposal: result.meetingProposal ?? null,
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
    userName: string;
    existingActions: string[];
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
    // Fetch the recipient's IANA timezone so the prompt can extract meeting
    // proposals against the right local time (the conversion to UTC is done
    // deterministically in code, not by the LLM).
    const prefs = await this.schedulingPreferencesService.getPreferences(
      params.userId,
    );
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
      userName: params.userName,
      existingActions: params.existingActions,
      userTimezone: prefs.timezone,
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
        actionItems: null,
        meetingProposal: null,
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

  /**
   * Fetch the most recent messages of a thread in chronological (ASC) order,
   * capped at SUMMARY_THREAD_EMAIL_LIMIT. We query newest-first then reverse so
   * long threads surface their latest state rather than the oldest messages.
   */
  private async getRecentThreadEmailsChronological(
    userId: string,
    threadId: string,
  ): Promise<Email[]> {
    const emails = await this.emailsService.getThreadEmails(userId, threadId, {
      order: "DESC",
      limit: SUMMARY_THREAD_EMAIL_LIMIT,
    });
    return emails.reverse();
  }

  /**
   * Persists a freshly-generated summary to every email in the thread and
   * stamps `EmailThread.lastSummarizedAt` so future staleness checks work.
   *
   * Called fire-and-forget after a manual summary refresh so the UI does not
   * wait for the DB write but the stored summary stays in sync.
   *
   * `threadId` is the provider's thread ID (e.g. Gmail thread ID).
   * `emailThreadId` is the DB UUID of the EmailThread row.
   * Using the latest email's `receivedAt` (rather than `new Date()`) ensures
   * that any email arriving after that timestamp is still detected as stale.
   */
  async persistSummaryForThread(
    userId: string,
    threadId: string,
    emailThreadId: string | null,
    summary: string,
  ): Promise<void> {
    const threadEmails = await this.emailsService.getThreadEmails(
      userId,
      threadId,
    );

    const threadEmailIds = threadEmails.map((email) => email.id);
    if (threadEmailIds.length === 0) return;

    const plainSummary = extractPlainSummary(summary);

    await this.emailRepository.update(
      { id: In(threadEmailIds) },
      { summary: plainSummary, summarySource: "llm" as const },
    );

    if (emailThreadId) {
      const latestReceivedAt = threadEmails.reduce<Date>(
        (latest, threadEmail) => {
          const receivedAt = new Date(threadEmail.receivedAt);
          return receivedAt > latest ? receivedAt : latest;
        },
        new Date(0),
      );
      await this.emailThreadRepository.update(
        { id: emailThreadId },
        { lastSummarizedAt: latestReceivedAt },
      );
    }
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
