import { Injectable, Logger } from "@nestjs/common";

import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { normalizeGeneratedReplyPlaintext } from "../utils/reply-plaintext-format.util";
import { cleanEmailContent } from "./email-content-cleaner";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_GENERATE_FOLLOW_UP,
  LLM_OP_GENERATE_MEETING_REPLY,
  LLM_OP_GENERATE_REPLY,
  LLM_OP_GENERATE_REPLY_OPTIONS,
  type LLMOperation,
} from "./llm-operations";
import { getPrompt, renderPrompt, REPLY_PROMPT_IDS } from "./prompts";

/**
 * Domain service for LLM-powered reply generation (options, drafts, meeting replies, follow-ups).
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMReplyService {
  private readonly logger = new Logger(LLMReplyService.name);

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

  private buildReplyThreadContext(
    threadMessages?: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
  ): string {
    if (!threadMessages || threadMessages.length === 0) return "";
    return threadMessages
      .map((msg, idx) => {
        const sender = msg.isFromUser ? "You" : msg.fromName || msg.from;
        const date = new Date(msg.receivedAt).toLocaleDateString();
        const cleanedMsgBody = cleanEmailContent(
          msg.body,
          null,
          QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
        );
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${cleanedMsgBody}`;
      })
      .join("\n\n---\n\n");
  }

  async generateReplyOptions(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      writingStyle?: string;
      userName?: string;
      userJobTitle?: string;
      emailExamples?: string[];
      calendarLink?: string | null;
    },
    provider?: LLMProvider,
    userId?: string,
    threadMessages?: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
  ): Promise<Array<{ label: string; text: string }>> {
    const cleanedBody = cleanEmailContent(
      originalEmail.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const promptConfig = getPrompt(REPLY_PROMPT_IDS.GENERATE_MULTIPLE_REPLIES);
    if (!promptConfig) {
      this.logger.error(
        "generate_multiple_replies prompt not found in markdown files - cannot generate multiple replies",
      );
      const fallbackDraft = await this.generateReplyDraft(
        originalEmail,
        userContext,
        provider,
        userId,
      );
      return [{ label: "Draft Reply", text: fallbackDraft }];
    }

    const tone = userContext.tone || "professional";
    const userName = userContext.userName || "User";
    const userJobTitle = userContext.userJobTitle || "";
    const emailExamples = userContext.emailExamples?.slice(0, 5) || [];
    const calendarLink = userContext.calendarLink || "";

    if (emailExamples.length > 0) {
      this.logger.debug(
        `[generateReplyOptions] Using ${emailExamples.length} email examples for reply generation`,
      );
    }

    const threadContext = this.buildReplyThreadContext(threadMessages);
    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone,
      userName,
      userJobTitle,
      emailExamples,
      calendarLink,
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
      threadContext,
      hasThreadContext: threadContext.length > 0,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_REPLY_OPTIONS,
    );

    const parsed = this.parseReplyOptionsResponse(response);
    if (parsed) {
      return parsed;
    }

    const fallbackDraft = await this.generateReplyDraft(
      originalEmail,
      userContext,
      provider,
      userId,
    );
    return [
      {
        label: "Draft Reply",
        text: normalizeGeneratedReplyPlaintext(fallbackDraft),
      },
    ];
  }

  private parseReplyOptionsResponse(
    response: string,
  ): Array<{ label: string; text: string }> | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          options?: Array<{ label: string; text: string }>;
        };
        const options = parsed.options || [];
        return options.map((opt) => ({
          label: opt.label,
          text: normalizeGeneratedReplyPlaintext(opt.text ?? ""),
        }));
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM reply options response as JSON",
        error,
      );
    }
    return null;
  }

  async generateReplyDraft(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      commonPhrases?: string[];
      writingStyle?: string;
      emailExamples?: string[];
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const cleanedBody = cleanEmailContent(
      originalEmail.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const promptConfig = getPrompt(REPLY_PROMPT_IDS.GENERATE_REPLY);
    if (!promptConfig) {
      this.logger.error(
        "generate_reply prompt not found in markdown files - cannot generate reply",
      );
      throw new Error("Reply generation prompt not available");
    }

    const tone = userContext.tone || "professional";
    const contextPhrases = userContext.commonPhrases?.length
      ? userContext.commonPhrases.slice(0, 3).join(", ")
      : "";

    const emailExamples = userContext.emailExamples?.slice(0, 5) || [];

    if (emailExamples.length > 0) {
      this.logger.debug(
        `[generateReplyDraft] Using ${emailExamples.length} email examples for reply generation`,
      );
    } else {
      this.logger.debug(
        `[generateReplyDraft] No email examples provided (userContext.emailExamples: ${userContext.emailExamples?.length || 0})`,
      );
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone,
      writingStyle: userContext.writingStyle || "",
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
      commonPhrases: contextPhrases || "",
      emailExamples,
    });

    const draft = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_REPLY,
    );
    return normalizeGeneratedReplyPlaintext(draft);
  }

  async generateMeetingReply(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    availableSlots: Array<{ start: string; end: string }>,
    calendarBookingUrl?: string,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const cleanedBody = cleanEmailContent(
      originalEmail.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const promptConfig = getPrompt(REPLY_PROMPT_IDS.GENERATE_MEETING_REPLY);
    if (!promptConfig) {
      this.logger.error(
        "generate_meeting_reply prompt not found in markdown files - cannot generate meeting reply",
      );
      throw new Error("Meeting reply generation prompt not available");
    }

    const schedulingLinkUrl = calendarBookingUrl || "";

    const prompt = renderPrompt(promptConfig.prompt || "", {
      schedulingLinkUrl,
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
    });

    return await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_TINY,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_MEETING_REPLY,
    );
  }

  // eslint-disable-next-line better-max-params/better-max-params
  async generateFollowUpDraft(
    subject: string,
    threadMessages: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
    theirName: string,
    businessDaysWaiting: number,
    userCommunicationStyle?: { tone?: string; commonPhrases?: string[] },
    provider?: LLMProvider,
    userId?: string,
    threadStyleInfo?: {
      preferredName?: string | null;
      greetingStyle?: string | null;
    },
    calendarBookingUrl?: string | null,
    lastOtherPartyMessage?: string,
    userLastMessage?: string,
  ): Promise<string> {
    const promptConfig = getPrompt(REPLY_PROMPT_IDS.GENERATE_FOLLOW_UP);
    if (!promptConfig) {
      this.logger.error(
        "generate_follow_up prompt not found in markdown files - cannot generate follow-up",
      );
      throw new Error("Follow-up generation prompt not available");
    }

    const threadContext = threadMessages
      .map((msg, idx) => {
        const sender = msg.isFromUser ? "You" : msg.fromName || msg.from;
        const date = new Date(msg.receivedAt).toLocaleDateString();
        const cleanedBody = cleanEmailContent(msg.body, "").substring(
          0,
          QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
        );
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${cleanedBody}`;
      })
      .join("\n\n---\n\n");

    const skipGreeting =
      userCommunicationStyle?.tone?.toLowerCase().includes("no greeting") ||
      userCommunicationStyle?.tone?.toLowerCase().includes("skip greeting");

    const preferredName = threadStyleInfo?.preferredName || null;
    const greetingStyle = threadStyleInfo?.greetingStyle || null;

    const cleanedLastOtherPartyMessage = lastOtherPartyMessage
      ? cleanEmailContent(
          lastOtherPartyMessage,
          null,
          QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
        )
      : "";
    const cleanedUserLastMessage = userLastMessage
      ? cleanEmailContent(
          userLastMessage,
          null,
          QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
        )
      : "";

    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone: userCommunicationStyle?.tone || "",
      commonPhrases: userCommunicationStyle?.commonPhrases?.join(", ") || "",
      subject,
      threadMessageCount: threadMessages.length,
      threadContext,
      recipientName: theirName,
      preferredName,
      greetingStyle,
      businessDaysWaiting,
      daysLabel: businessDaysWaiting === 1 ? "day" : "days",
      skipGreeting,
      calendarLink: calendarBookingUrl || "",
      lastOtherPartyMessage: cleanedLastOtherPartyMessage,
      userLastMessage: cleanedUserLastMessage,
      hasOtherPartyMessage: cleanedLastOtherPartyMessage.length > 0,
      hasUserLastMessage: cleanedUserLastMessage.length > 0,
    });

    const followUp = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_FOLLOW_UP,
    );
    return normalizeGeneratedReplyPlaintext(followUp);
  }
}
