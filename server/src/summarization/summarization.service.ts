import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsService } from "../emails/emails.service";
import { LLMService, LLMProvider } from "../llm/llm.service";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import {
  cleanEmailContent,
  cleanEmailForThread,
} from "../llm/email-content-cleaner";
import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { logError, logWarn } from "../utils/logger";
import { UsersService } from "../users/users.service";
import {
  detectPhishingSignal,
  mergePhishingSignals,
  PhishingSignal,
} from "./phishing-detection.service";

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
  type: "bullet-points" | "action-items" | "sender-request" | "tldr" | "custom";
  customPrompt?: string;
  provider?: "gemini" | "openai";
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
      .map((e, idx) => {
        const emailWithHtml = e as EmailWithHtmlBody;
        const isFromUser = this.isEmailFromUser(e.from, userEmail);
        const sender = isFromUser ? "You" : e.fromName || e.from;
        const date = new Date(e.receivedAt).toLocaleString();
        const cleanedBody = cleanEmailForThread(e.body, emailWithHtml.htmlBody);
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
      llmProvider =
        rule.provider === "gemini" ? LLMProvider.GEMINI : LLMProvider.OPENAI;
    }

    const cleanedBody = cleanEmailContent(email.body, email.htmlBody);

    if (rule.type === "custom" && rule.customPrompt) {
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
            type: rule ? "custom" : "tldr",
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
   * Summarize an email AND detect phishing signals in one call.
   * Returns both the summary string and an optional PhishingSignal.
   * This is the preferred method for callers that need phishing detection.
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

    // Compute phishing signal across all thread messages
    const phishingSignal = allThreadEmails.reduce(
      (merged, threadEmail) =>
        mergePhishingSignals(
          merged,
          detectPhishingSignal(threadEmail.from, threadEmail.body ?? ""),
        ),
      null as PhishingSignal | null,
    );

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
      return { summary, phishingSignal };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
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
      const keywords = whenToUseLower.split(/\s+/).filter((w) => w.length > 3);
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
        type: "custom",
        customPrompt: matchedRule.howToSummarize,
      };
    } else {
      rule = { type: "tldr" };
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

  private async matchRuleWithLLM(
    email: { subject?: string; from?: string; fromName?: string },
    cleanedBody: string,
    rules: SummarizationRuleEntity[],
    userId: string,
  ): Promise<SummarizationRuleEntity | null | undefined> {
    const emailPreview = cleanedBody.substring(
      0,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );
    const emailText = `Subject: ${email.subject || "(no subject)"}\nFrom: ${email.fromName || email.from || "(unknown sender)"} <${email.from || ""}>\n\nEmail Body:\n"""\n${emailPreview}${cleanedBody.length > QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH ? "\n\n[... email continues ...]" : ""}\n"""`;
    const ruleDescriptions = rules
      .map((rule, index) => `Rule ${index + 1}: "${rule.whenToUse}"`)
      .join("\n");

    const prompt = `You are evaluating which summarization rule should be applied to an email based on the "whenToUse" criteria for each rule.

Email to evaluate:
${emailText}

Available summarization rules (each has a "whenToUse" description that explains when it should be applied):
${ruleDescriptions}

Your task:
1. Carefully read the "whenToUse" criteria for each rule
2. Determine if the email matches any of the rules based on their "whenToUse" descriptions
3. Consider the email's subject, sender, and content when evaluating matches
4. If the email clearly matches a rule's "whenToUse" criteria, return that rule's number (1-${rules.length})
5. If no rule clearly matches, return "0"

Examples:
- If a rule says "Github emails" and the email is from GitHub (e.g., notifications@github.com, noreply@github.com) or contains GitHub-related content, it matches
- If a rule says "emails from @company.com" and the sender's domain is company.com, it matches
- If a rule says "newsletter emails" and the email is clearly a newsletter, it matches

Respond with ONLY the rule number (1-${rules.length}) or "0" if no match. Do not include any explanation or other text.`;

    const response = await this.llmService.generateText(
      {
        prompt,
        systemPrompt:
          "You are a precise assistant that evaluates whether emails match rule criteria. You respond with only a number: the rule number (1-N) if a match is found, or 0 if no rule matches.",
        temperature: 0.1,
        maxTokens: 5,
        userId,
      },
      undefined,
      userId,
    );

    const cleanedResponse = response.trim().replace(/[^0-9]/g, "");
    const ruleIndex = parseInt(cleanedResponse, 10) - 1;

    if (ruleIndex >= 0 && ruleIndex < rules.length) {
      return rules[ruleIndex];
    }
    if (cleanedResponse === "0") {
      return null;
    }

    logWarn(
      `LLM returned invalid rule index: "${response.trim()}", parsed as: ${ruleIndex}`,
    );
    // signals fallback needed
    return undefined;
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
      const llmResult = await this.matchRuleWithLLM(
        email,
        cleanedBody,
        rules,
        userId,
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

  private fallbackSummary(
    text: string,
    subject: string,
    type: string,
    sender: string,
  ): string {
    const sentences = text
      .split(/[.!?]+/)
      .filter((sentence) => sentence.trim().length > 0);

    switch (type) {
      case "bullet-points":
        return (
          sentences
            .slice(0, 5)
            .map((sentence) => `• ${sentence.trim()}`)
            .join("\n") || "• No key points found"
        );
      case "action-items":
        const actionKeywords = [
          "please",
          "need",
          "should",
          "must",
          "action",
          "do",
          "complete",
        ];
        const actionSentences = sentences
          .filter((sentence) =>
            actionKeywords.some((keyword) =>
              sentence.toLowerCase().includes(keyword),
            ),
          )
          .slice(0, 5)
          .map((sentence) => `• ${sentence.trim()}`)
          .join("\n");
        return actionSentences || "• No action items found";
      case "sender-request":
        return `From ${sender}: ${sentences[0]?.trim() || "No specific request found."}`;
      case "tldr":
      default:
        const summary =
          sentences[0]?.substring(0, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH) ||
          text.substring(0, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH);
        return `TL;DR: ${summary}${summary.length >= QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH ? "..." : ""}`;
    }
  }
}
