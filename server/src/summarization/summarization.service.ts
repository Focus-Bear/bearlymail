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
  ) {}

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

    // For thread summaries, get the first email (for context) + last 3 messages (current state)
    // Fetch all emails in ASC order to get first email, then determine which to include
    const allThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 20, order: "ASC" }, // ASC to get oldest first
    );

    // Build the messages to summarize: first email + last 3
    // If thread has 4 or fewer emails, just use all of them
    let messagesToSummarize: typeof allThreadEmails;
    if (allThreadEmails.length <= 4) {
      messagesToSummarize = allThreadEmails;
    } else {
      // First email + last 3 (skip middle ones)
      const firstEmail = allThreadEmails[0];
      const last3Emails = allThreadEmails.slice(
        CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE,
      );
      messagesToSummarize = [firstEmail, ...last3Emails];
    }

    // Combine messages for thread context (clean each message)
    const threadText = messagesToSummarize
      .map((e, idx) => {
        // Cast to EmailWithHtmlBody to access htmlBody which exists on the entity
        const emailWithHtml = e as EmailWithHtmlBody;
        const sender = e.fromName || e.from;
        const date = new Date(e.receivedAt).toLocaleString();
        // Clean each message: strip HTML, remove signatures, limit to 800 chars per message
        const cleanedBody = cleanEmailForThread(e.body, emailWithHtml.htmlBody);
        // Indicate if this is the original email vs recent messages
        const messageLabel =
          idx === 0 && allThreadEmails.length > 4
            ? "Original"
            : `Message ${idx + 1}`;
        return `[${messageLabel} from ${sender} on ${date}]:\n${cleanedBody}`;
      })
      .join("\n\n---\n\n");

    // Cast to EmailWithHtmlBody to access htmlBody which exists on the entity
    const emailWithHtml = email as EmailWithHtmlBody;
    const subject = email.subject || "";
    const text =
      threadText || cleanEmailContent(email.body, emailWithHtml.htmlBody);

    // Use LLM for all summarization types
    try {
      // Convert string provider to LLMProvider enum
      let llmProvider: LLMProvider | undefined;
      if (rule.provider) {
        llmProvider =
          rule.provider === "gemini" ? LLMProvider.GEMINI : LLMProvider.OPENAI;
      }

      if (rule.type === "custom" && rule.customPrompt) {
        // Custom prompt using LLM - use cleaned content
        const cleanedBody = cleanEmailContent(
          email.body,
          emailWithHtml.htmlBody,
        );
        const prompt =
          messagesToSummarize.length > 1
            ? `Email Thread Subject: ${subject}\n\nThis thread contains ${allThreadEmails.length} messages. Here are the key messages (first + last 3):\n\n${threadText}\n\n${rule.customPrompt}`
            : `Email Subject: ${subject}\n\nEmail Body:\n${cleanedBody}\n\n${rule.customPrompt}`;

        return await this.llmService.generateText(
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

      // Use LLM for standard summarization types
      if (messagesToSummarize.length > 1) {
        // Thread summary - use specialized prompt (already cleaned above)
        return await this.llmService.summarizeEmail(
          threadText,
          subject,
          rule.type,
          llmProvider,
          userId,
        );
      } else {
        // Single email summary - clean the content
        const cleanedBody = cleanEmailContent(
          email.body,
          emailWithHtml.htmlBody,
        );
        return await this.llmService.summarizeEmail(
          cleanedBody,
          subject,
          rule.type,
          llmProvider,
          userId,
        );
      }
    } catch (error) {
      // Fallback to simple extraction if LLM fails
      console.error("LLM summarization failed, using fallback", error);
      return this.fallbackSummary(text, subject, rule.type, email.from);
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

    // Prepare thread data for summarization
    interface ThreadData {
      emailId: string; // The email ID that triggered this thread summarization
      email: NonNullable<(typeof emails)[0]>;
      threadText: string; // Combined text of all messages in thread
      isThread: boolean; // Whether this has multiple messages
      messageCount: number; // Number of messages included in summary
      matchedRule: SummarizationRuleEntity | null;
    }
    const threadsToSummarize: ThreadData[] = [];

    // Fetch all messages in each thread and match summarization rules
    const threadPromises = emails.map(async (email, idx) => {
      if (!email) return null;

      // Get first email + last 3 messages in the thread (same logic as single summarization)
      const allThreadEmails = await this.emailsService.getThreadEmails(
        userId,
        email.threadId,
        { limit: 20, order: "ASC" },
      );

      // Build the messages to summarize: first email + last 3
      let messagesToSummarize: typeof allThreadEmails;
      if (allThreadEmails.length <= 4) {
        messagesToSummarize = allThreadEmails;
      } else {
        const firstEmail = allThreadEmails[0];
        const last3Emails = allThreadEmails.slice(
          CONTEXT_ANALYSIS.LAST_THREAD_EMAILS_SLICE,
        );
        messagesToSummarize = [firstEmail, ...last3Emails];
      }

      // Build thread text
      const threadText = messagesToSummarize
        .map((e, msgIdx) => {
          const sender = e.fromName || e.from;
          const date = new Date(e.receivedAt).toLocaleString();
          const cleanedBody = cleanEmailForThread(
            e.body,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e as any).htmlBody,
          );
          const messageLabel =
            msgIdx === 0 && allThreadEmails.length > 4
              ? "Original"
              : `Message ${msgIdx + 1}`;
          return `[${messageLabel} from ${sender} on ${date}]:\n${cleanedBody}`;
        })
        .join("\n\n---\n\n");

      // Match summarization rule for this email using fast domain/keyword matching
      const matchedRule = this.matchRuleFast(
        { from: email.from, subject: email.subject },
        userRules,
      );

      return {
        emailId: emailIds[idx],
        email,
        threadText:
          threadText ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cleanEmailContent(email.body, (email as any).htmlBody),
        isThread: messagesToSummarize.length > 1,
        messageCount: messagesToSummarize.length,
        matchedRule,
      };
    });

    const threadResults = await Promise.all(threadPromises);
    for (const result of threadResults) {
      if (result) {
        threadsToSummarize.push(result);
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
      const rule = threads[0].matchedRule;

      // Prepare thread data for LLM
      const batchData = threads.map((item, idx) => ({
        index: idx,
        subject: item.email.subject || "",
        body: item.threadText, // Full thread content (first + last 3 messages)
        isThread: item.isThread,
        messageCount: item.messageCount,
      }));

      try {
        // Extract email IDs for tracking
        const threadEmailIds = threads.map((item) => item.emailId);

        // Call thread summarization with the rule's instructions
        const summaryMap = await this.llmService.summarizeThreads(
          batchData,
          undefined,
          userId,
          rule?.howToSummarize, // Pass custom summarization instructions if available
          threadEmailIds, // Pass email IDs for tracking
        );

        // Map summaries back to email IDs
        threads.forEach((item, idx) => {
          const summary = summaryMap.get(idx);
          if (summary) {
            result.set(item.emailId, summary);
          }
        });
      } catch (error) {
        console.error(
          `Thread summarization failed for rule ${ruleKey || "default"}, falling back to individual calls`,
          error,
        );

        // Fallback: summarize each thread individually
        for (const item of threads) {
          try {
            const summary = await this.summarizeEmail(userId, item.emailId, {
              type: rule ? "custom" : "tldr",
              customPrompt: rule?.howToSummarize,
            });
            result.set(item.emailId, summary);
          } catch (summaryError) {
            console.error(
              `Failed to summarize thread for email ${item.emailId}:`,
              summaryError,
            );
          }
        }
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
  ): Promise<string> {
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

    // Pass prefetched email to avoid re-fetching
    return this.summarizeEmail(userId, emailId, rule, email);
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

    // Clean email content for matching
    // Cast to EmailWithHtmlBody to access htmlBody which exists on the entity
    const emailWithHtml = email as EmailWithHtmlBody;
    const cleanedBody = cleanEmailContent(email.body, emailWithHtml.htmlBody);

    // Fast path: Check for exact domain matches (e.g., "emails from @company.com")
    // This is a simple optimization for obvious cases, but we still use LLM for semantic matching
    const fromLower = (email.from || "").toLowerCase();
    for (const rule of rules) {
      const whenToUseLower = rule.whenToUse.toLowerCase();
      const domainMatch = whenToUseLower.match(/@([a-z0-9.-]+)/i);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();
        // Extract domain from email address
        const emailDomain = fromLower
          .match(/@([a-z0-9.-]+)/i)?.[1]
          ?.toLowerCase();
        if (emailDomain === domain) {
          // Exact domain match - this is reliable enough to use without LLM
          return rule;
        }
      }
    }

    // Primary method: Use LLM to evaluate which rule matches based on whenToUse criteria
    try {
      // Prepare email context (use more content for better matching)
      const emailPreview = cleanedBody.substring(0, 2000); // Increased from 1000 for better context
      const emailText = `Subject: ${email.subject || "(no subject)"}\nFrom: ${email.fromName || email.from || "(unknown sender)"} <${email.from || ""}>\n\nEmail Body:\n${emailPreview}${cleanedBody.length > 2000 ? "\n\n[... email continues ...]" : ""}`;

      // Format rules with their whenToUse criteria
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
          temperature: 0.1, // Lower temperature for more consistent matching
          maxTokens: 5, // Just need a number
          userId,
        },
        undefined,
        userId,
      );

      // Parse response - handle various formats the LLM might return
      const cleanedResponse = response.trim().replace(/[^0-9]/g, ""); // Extract only digits
      const ruleIndex = parseInt(cleanedResponse, 10) - 1;

      if (ruleIndex >= 0 && ruleIndex < rules.length) {
        return rules[ruleIndex];
      }

      // If LLM returned 0 or invalid response, no rule matches
      if (cleanedResponse === "0") {
        return null; // No matching rule found
      }

      // If response is invalid, log and fall through to fallback
      console.warn(
        `LLM returned invalid rule index: "${response.trim()}", parsed as: ${ruleIndex}`,
      );
    } catch (error) {
      console.error("LLM rule matching failed:", error);
      // Fall through to fallback
    }

    // Fallback: If LLM fails or returns invalid response, return first rule
    // This ensures the system still works even if LLM is unavailable
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
          sentences[0]?.substring(0, 200) || text.substring(0, 200);
        return `TL;DR: ${summary}${summary.length >= 200 ? "..." : ""}`;
    }
  }
}
