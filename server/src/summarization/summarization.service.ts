import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import {
  cleanEmailContent,
  cleanEmailForThread,
} from "../llm/email-content-cleaner";

export interface SummarizationRule {
  type: "bullet-points" | "action-items" | "sender-request" | "tldr" | "custom";
  customPrompt?: string;
  provider?: "gemini" | "openai";
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
  ): Promise<string> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // For thread summaries, get the last 3 messages in the thread (need body for summarization)
    // Limit to 10 emails (we only need last 3, but fetch a few more for safety)
    const threadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 10, order: "DESC" }, // DESC to get most recent first
    );
    // threadEmails are already in DESC order (most recent first), so just take first 3
    // Then reverse to get chronological order (oldest to newest) for the summary
    const last3Messages = threadEmails.slice(0, 3).reverse();

    // Combine the last 3 messages for thread context (clean each message)
    const threadText = last3Messages
      .map((e, idx) => {
        const sender = e.fromName || e.from;
        const date = new Date(e.receivedAt).toLocaleString();
        // Clean each message: strip HTML, remove signatures, limit to 800 chars per message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleanedBody = cleanEmailForThread(e.body, (e as any).htmlBody);
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${cleanedBody}`;
      })
      .join("\n\n---\n\n");

    const subject = email.subject || "";
    const text =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      threadText || cleanEmailContent(email.body, (email as any).htmlBody);

    // Use LLM for all summarization types
    try {
      let provider: "gemini" | "openai" | undefined;
      if (rule.provider) {
        provider = rule.provider === "gemini" ? "gemini" : "openai";
      }

      if (rule.type === "custom" && rule.customPrompt) {
        // Custom prompt using LLM - use cleaned content
        const cleanedBody = cleanEmailContent(
          email.body,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (email as any).htmlBody,
        );
        const prompt =
          last3Messages.length > 1
            ? `Email Thread Subject: ${subject}\n\nThis thread contains ${last3Messages.length} messages. Here are the last ${Math.min(3, last3Messages.length)} messages:\n\n${threadText}\n\n${rule.customPrompt}`
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider as any,
          userId,
        );
      }

      // Use LLM for standard summarization types
      if (last3Messages.length > 1) {
        // Thread summary - use specialized prompt (already cleaned above)
        return await this.llmService.summarizeEmail(
          threadText,
          subject,
          rule.type,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider as any,
          userId,
        );
      } else {
        // Single email summary - clean the content
        const cleanedBody = cleanEmailContent(
          email.body,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (email as any).htmlBody,
        );
        return await this.llmService.summarizeEmail(
          cleanedBody,
          subject,
          rule.type,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider as any,
          userId,
        );
      }
    } catch (error) {
      // Fallback to simple extraction if LLM fails
      console.error("LLM summarization failed, using fallback", error);
      return this.fallbackSummary(text, subject, rule.type, email.from);
    }
  }

  async getSummarizationRules(
    userId: string,
  ): Promise<SummarizationRuleEntity[]> {
    return this.summarizationRuleRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
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
    const cleanedBody = cleanEmailContent(
      email.body,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (email as any).htmlBody,
    );

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
