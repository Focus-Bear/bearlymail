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

    // Try simple keyword matching first for common patterns
    for (const rule of rules) {
      const whenToUseLower = rule.whenToUse.toLowerCase();
      const subjectLower = (email.subject || "").toLowerCase();
      const bodyLower = cleanedBody.toLowerCase();
      const fromLower = (email.from || "").toLowerCase();
      const fromNameLower = (email.fromName || "").toLowerCase();

      // Check for common patterns
      if (
        whenToUseLower.includes("github") &&
        (subjectLower.includes("github") ||
          bodyLower.includes("github") ||
          fromLower.includes("github") ||
          fromNameLower.includes("github"))
      ) {
        return rule;
      }

      // Check for email domain matches (e.g., "emails from @company.com")
      const domainMatch = whenToUseLower.match(/@([a-z0-9.-]+)/i);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();
        if (
          fromLower.includes(domain) ||
          fromLower.includes(`@${domain}`)
        ) {
          return rule;
        }
      }

      // Check for keyword matches in subject or body
      const keywords = whenToUseLower
        .split(/\s+/)
        .filter((word) => word.length > 3 && !["from", "when", "the", "this"].includes(word));
      
      if (keywords.length > 0) {
        const matchCount = keywords.filter(
          (keyword) =>
            subjectLower.includes(keyword) ||
            bodyLower.includes(keyword) ||
            fromLower.includes(keyword) ||
            fromNameLower.includes(keyword),
        ).length;
        
        // If more than 50% of keywords match, consider it a match
        if (matchCount >= Math.ceil(keywords.length * 0.5)) {
          return rule;
        }
      }
    }

    // If simple matching didn't work, use LLM to evaluate rules
    try {
      const emailText = `Subject: ${email.subject || ""}\n\nFrom: ${email.fromName || email.from || ""}\n\nBody:\n${cleanedBody.substring(0, 1000)}`;
      
      const ruleDescriptions = rules.map(
        (rule, index) => `Rule ${index + 1}: ${rule.whenToUse}`,
      ).join("\n");

      const prompt = `You are evaluating which summarization rule should be applied to an email.

Email:
${emailText}

Available rules:
${ruleDescriptions}

Which rule (1-${rules.length}) best matches this email? Consider the "whenToUse" criteria for each rule. If no rule clearly matches, respond with "0". Respond with only the number, nothing else.`;

      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: "You are a helpful assistant that evaluates which rules match given criteria. Respond with only a number.",
          temperature: 0.2,
          maxTokens: 10,
          userId,
        },
        undefined,
        userId,
      );

      const ruleIndex = parseInt(response.trim(), 10) - 1;
      if (ruleIndex >= 0 && ruleIndex < rules.length) {
        return rules[ruleIndex];
      }
    } catch (error) {
      console.error("LLM rule matching failed, falling back to first rule", error);
    }

    // Fallback to first rule if no match found
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
