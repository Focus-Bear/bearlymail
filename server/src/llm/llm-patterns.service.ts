import { Injectable, Logger } from "@nestjs/common";

import { TIME_FORMATTING } from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  MILLISECONDS,
  MINUTES,
  MS_PER_SECOND,
} from "../constants/time-constants";
import { safeJsonParse } from "../utils/json";
import { cleanEmailContent } from "./email-content-cleaner";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_EMAIL_PATTERNS,
  type LLMOperation,
} from "./llm-operations";
import { CONTEXT_PROMPT_IDS, getPrompt, renderPrompt } from "./prompts";

/**
 * Domain service for LLM-powered email pattern analysis.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMPatternsService {
  private readonly logger = new Logger(LLMPatternsService.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  private async generateText(
    request: {
      prompt: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      jsonMode?: boolean;
      userId?: string;
    },
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    return this.llmCoreService.generateText(effectiveRequest, provider, userId);
  }

  private buildReceivedEmailStats(
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      receivedAt: string;
      isRead?: boolean;
      timeToReply?: number | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>,
  ): string {
    return receivedEmails
      .map((emailEntry) => {
        const replyTimeMinutes =
          emailEntry.timeToReply ??
          (emailEntry.repliedAt
            ? (new Date(emailEntry.repliedAt).getTime() -
                new Date(emailEntry.receivedAt).getTime()) /
              MILLISECONDS.SECOND /
              MINUTES.HOUR
            : null);
        const readStatus = emailEntry.isRead ? "Read" : "Unread";
        const archiveStatus = emailEntry.isArchived ? "Archived" : "InInbox";
        const starStatus =
          (emailEntry.starCount || 0) > 0
            ? `Starred(${emailEntry.starCount})`
            : "NotStarred";
        let behavior: string;
        if (emailEntry.isArchived && !emailEntry.isRead) {
          behavior = "ArchivedWithoutReading";
        } else if (emailEntry.isRead && !emailEntry.isArchived) {
          behavior = "ReadButKept";
        } else if (emailEntry.isRead && emailEntry.isArchived) {
          behavior = "ReadThenArchived";
        } else {
          behavior = "UnreadInInbox";
        }
        const replyInfo =
          replyTimeMinutes !== null
            ? `${replyTimeMinutes.toFixed(0)}m`
            : "NoReply";
        const isQuickReply =
          replyTimeMinutes !== null &&
          replyTimeMinutes < QUERY_LIMITS.LLM_QUICK_REPLY_MINUTES;
        return `From: ${emailEntry.fromName || emailEntry.from}, Subject: ${emailEntry.subject}, Read: ${readStatus}, ${archiveStatus}, ${starStatus}, Behavior: ${behavior}, ReplyTime: ${replyInfo}${isQuickReply ? " (QUICK)" : ""}`;
      })
      .join("\n");
  }

  private buildSentEmailStats(
    sentEmails: Array<{
      emailId?: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>,
  ): string {
    return sentEmails
      .slice(0, QUERY_LIMITS.LLM_SENT_EMAILS_LIMIT)
      .map((emailEntry) => {
        const cleanBody = cleanEmailContent(
          emailEntry.body,
          null,
          QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
        );
        return `To: ${emailEntry.to}, Subject: ${emailEntry.subject}\nFull Email Body:\n${cleanBody}\n---`;
      })
      .join("\n\n");
  }

  private buildEmailTimeAnalysis(
    receivedEmails: Array<{ receivedAt: string; timeToReply?: number | null }>,
  ): { receivedHours: string | null; replyHours: string | null } {
    const receivedHours: number[] = [];
    const replyHours: number[] = [];
    receivedEmails.forEach((emailEntry) => {
      if (emailEntry.receivedAt)
        receivedHours.push(new Date(emailEntry.receivedAt).getHours());
      if (
        emailEntry.timeToReply !== null &&
        emailEntry.timeToReply !== undefined &&
        emailEntry.timeToReply < MINUTES.DAY
      ) {
        const received = new Date(emailEntry.receivedAt);
        const replyTime = new Date(
          received.getTime() + emailEntry.timeToReply * MILLISECONDS.MINUTE,
        );
        replyHours.push(replyTime.getHours());
      }
    });
    return {
      receivedHours:
        receivedHours.length > 0 ? this.getTimePattern(receivedHours) : null,
      replyHours:
        replyHours.length > 0 ? this.getTimePattern(replyHours) : null,
    };
  }

  private parsePatternResponse(response: string): {
    context: Array<{ key: string; value: string; source: string }>;
    writingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    };
  } | null {
    const jsonString = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = safeJsonParse<Record<string, unknown>>(
      jsonMatch[0],
      null,
      "parsePatternResponse",
    );
    if (!parsed) return null;
    return {
      context: Array.isArray(parsed.context) ? parsed.context : [],
      writingStyle:
        parsed.writingStyle && typeof parsed.writingStyle === "object"
          ? (() => {
              const ws = parsed.writingStyle as Record<string, unknown>;
              return {
                tone: (ws.tone as string | undefined) || "Professional",
                style: (ws.style as string | undefined) || "Concise",
                commonPhrases: Array.isArray(ws.commonPhrases)
                  ? (ws.commonPhrases as string[])
                  : [],
                emailExamples: Array.isArray(ws.emailExamples)
                  ? (ws.emailExamples as string[])
                  : undefined,
              };
            })()
          : { tone: "Professional", style: "Concise", commonPhrases: [] },
    };
  }

  // eslint-disable-next-line better-max-params/better-max-params
  async analyzeEmailPatterns(
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead?: boolean;
      timeToReply?: number | null;
      readAt?: string | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>,
    sentEmails: Array<{
      emailId?: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>,
    provider?: LLMProvider,
    userId?: string,
    userEmail?: string,
    currentContext?: Array<{ key: string; value: string; source?: string }>,
  ): Promise<{
    context: Array<{ key: string; value: string; source: string }>;
    writingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    };
  }> {
    const promptConfig = getPrompt(CONTEXT_PROMPT_IDS.ANALYZE_EMAIL_PATTERNS);
    if (!promptConfig) {
      this.logger.error(
        "analyze_email_patterns prompt not found in markdown files - cannot analyze patterns",
      );
      return {
        context: [],
        writingStyle: {
          tone: "Professional",
          style: "Concise",
          commonPhrases: [],
        },
      };
    }

    const prompt = this.buildAnalyzeEmailPatternsPrompt(
      promptConfig.prompt || "",
      receivedEmails,
      sentEmails,
      currentContext,
      userEmail,
    );
    const llmCallStart = Date.now();
    const response = await this.generateText(
      {
        prompt,
        systemPrompt: "",
        temperature: RATIOS.FORTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_ANALYZE_EMAIL_PATTERNS,
    );
    const llmCallDuration = Date.now() - llmCallStart;
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] generateText() completed in ${llmCallDuration}ms (${(llmCallDuration / MS_PER_SECOND).toFixed(2)}s)`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Response length: ${response.length} chars`,
    );

    try {
      const parsed = this.parsePatternResponse(response);
      if (parsed) return parsed;
    } catch (error) {
      this.logger.warn("Failed to parse LLM analysis response as JSON", error);
    }

    return {
      context: [],
      writingStyle: {
        tone: "Professional",
        style: "Concise",
        commonPhrases: [],
        emailExamples: [],
      },
    };
  }

  private buildAnalyzeEmailPatternsPrompt(
    promptTemplate: string,
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead?: boolean;
      timeToReply?: number | null;
      readAt?: string | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>,
    sentEmails: Array<{
      emailId?: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>,
    currentContext?: Array<{ key: string; value: string; source?: string }>,
    userEmail?: string,
  ): string {
    const receivedStats = this.buildReceivedEmailStats(receivedEmails);
    const sentStats = this.buildSentEmailStats(sentEmails);
    const timeAnalysis = this.buildEmailTimeAnalysis(receivedEmails);
    const currentContextText = currentContext
      ? currentContext.map((item) => `${item.key}: ${item.value}`).join("\n")
      : "";

    return renderPrompt(promptTemplate, {
      userEmail: userEmail || "",
      // matches {{receivedEmails}} in analyze-email-patterns.md
      receivedEmails: receivedStats,
      // matches {{sentEmails}} in analyze-email-patterns.md
      sentEmails: sentStats,
      receivedHours: timeAnalysis.receivedHours || "",
      replyHours: timeAnalysis.replyHours || "",
      currentContext: currentContextText,
    });
  }

  private getTimePattern(hours: number[]): string {
    if (hours.length === 0) return "";

    const hourCounts = new Map<number, number>();
    hours.forEach((header) =>
      hourCounts.set(header, (hourCounts.get(header) || 0) + 1),
    );

    const sortedHours = Array.from(hourCounts.entries())
      .sort((itemA, itemB) => itemB[1] - itemA[1])
      .slice(0, 3);

    if (sortedHours.length === 0) return "";

    const peakHours = sortedHours
      .map(([hour, count]) => {
        const period = hour < TIME_FORMATTING.NOON_HOUR ? "AM" : "PM";
        const hour12 =
          hour % TIME_FORMATTING.HOURS_IN_HALF_DAY ||
          TIME_FORMATTING.HOURS_IN_HALF_DAY;
        return `${hour12}${period} (${count} emails)`;
      })
      .join(", ");

    return `Peak activity: ${peakHours}`;
  }
}
