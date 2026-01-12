import { Injectable, Logger } from "@nestjs/common";
import { LLMCoreService } from "./llm-core.service";
import { LLMProvider } from "./llm.types";
import { cleanEmailContent } from "./email-content-cleaner";
import { getPrompt, renderPrompt } from "./prompts";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";

@Injectable()
export class PriorityAnalysisService {
  private readonly logger = new Logger(PriorityAnalysisService.name);

  constructor(private llmCoreService: LLMCoreService) {}

  // eslint-disable-next-line max-lines-per-function, complexity
  async analyzePriority(
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
      // Should be pre-cleaned, but we'll clean defensively
    },
    userHistory?: {
      averageTimeToReply?: number;
      similarEmailsReplyTime?: number;
    },
    provider?: LLMProvider,
    userId?: string,
    userContext?: {
      urgentItems?: Array<{ value: string; explanation?: string }>;
      notUrgentItems?: Array<{ value: string; explanation?: string }>;
      goals?: Array<{ value: string; priority?: number }>;
      workingOn?: Array<{ value: string; priority?: number }>;
      dontCare?: Array<{ value: string }>;
    },
    threadInfo?: {
      daysSinceLastReply?: number;
      userShouldReply?: boolean;
      lastReplyFrom?: string;
    },
    threadEmails?: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: Date;
    }>,
  ): Promise<{
    urgencyScore: number;
    urgencyExplanation: string;
    sentimentScore: number;
    goalAlignmentScore: number;
    goalAlignmentExplanation: string;
    reasoning: string;
  }> {
    // Defensive cleaning in case body wasn't pre-cleaned by caller
    const cleanedBody = cleanEmailContent(email.body, null, 2000);

    // Load prompt from markdown file
    const promptConfig = getPrompt("analyze_priority");
    if (!promptConfig) {
      this.logger.warn("analyze_priority prompt not found, using fallback");
      // Fallback: use inline prompt if markdown file not found
      const historyContext = userHistory
        ? `\nUser's average time to reply: ${userHistory.averageTimeToReply || "unknown"} hours`
        : "";
      const fallbackPrompt = `Analyze this email and provide component scores.\n\nFrom: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}\nSubject: ${email.subject}\n\n${cleanedBody}${historyContext}`;

      const fallbackSystemPrompt = `You are an email prioritization assistant. Provide component scores only (urgencyScore 0-100, urgencyExplanation, sentimentScore -1 to 1, goalAlignmentScore 0-100, goalAlignmentExplanation, reasoning). Return JSON: { "urgencyScore": number, "urgencyExplanation": string, "sentimentScore": number, "goalAlignmentScore": number, "goalAlignmentExplanation": string, "reasoning": string }`;

      const response = await this.llmCoreService.generateText(
        {
          prompt: fallbackPrompt,
          systemPrompt: fallbackSystemPrompt,
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
          userId,
        },
        provider,
        userId,
      );

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
            urgencyExplanation:
              parsed.urgencyExplanation || "No urgency explanation provided",
            sentimentScore:
              parsed.sentimentScore !== undefined
                ? Math.max(-1, Math.min(1, parsed.sentimentScore))
                : 0,
            goalAlignmentScore: Math.max(0, Math.min(100, parsed.goalAlignmentScore || 0)),
            goalAlignmentExplanation:
              parsed.goalAlignmentExplanation || "No goal alignment explanation provided",
            reasoning: parsed.reasoning || "No reasoning provided",
          };
        }
      } catch (error) {
        this.logger.warn(
          "Failed to parse LLM priority response as JSON",
          error,
        );
      }

      return {
        urgencyScore: 0,
        urgencyExplanation: "No urgent indicators detected",
        sentimentScore: 0,
        goalAlignmentScore: 0,
        goalAlignmentExplanation: "No goal alignment detected",
        reasoning: response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH),
      };
    }

    // Get current date for urgency calculation (deadlines, time-sensitive requests)
    const currentDate = new Date();
    const currentDateStr = currentDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Format user context for prompt
    const urgentContextText = userContext?.urgentItems && userContext.urgentItems.length > 0
      ? userContext.urgentItems.map(item => `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`).join("\n")
      : "";
    const notUrgentContextText = userContext?.notUrgentItems && userContext.notUrgentItems.length > 0
      ? userContext.notUrgentItems.map(item => `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`).join("\n")
      : "";
    const goalsContextText = userContext?.goals && userContext.goals.length > 0
      ? userContext.goals.map(goal => `- ${goal.value}${goal.priority ? ` (Priority ${goal.priority})` : ""}`).join("\n")
      : "";
    const workingOnContextText = userContext?.workingOn && userContext.workingOn.length > 0
      ? userContext.workingOn.map(item => `- ${item.value}${item.priority ? ` (Priority ${item.priority})` : ""}`).join("\n")
      : "";
    const dontCareContextText = userContext?.dontCare && userContext.dontCare.length > 0
      ? userContext.dontCare.map(item => `- ${item.value}`).join("\n")
      : "";

    // Format thread info for prompt
    const threadInfoText = threadInfo
      ? `\nThread Information:\n${threadInfo.daysSinceLastReply !== undefined ? `- Days since last reply: ${threadInfo.daysSinceLastReply}` : ""}${threadInfo.userShouldReply !== undefined ? `\n- User should reply: ${threadInfo.userShouldReply ? "Yes" : "No"}` : ""}${threadInfo.lastReplyFrom ? `\n- Last reply from: ${threadInfo.lastReplyFrom}` : ""}`
      : "";

    // Format thread context from thread emails (chronologically, oldest first)
    let threadContextText = "";
    if (threadEmails && threadEmails.length > 0) {
      // Sort by receivedAt ascending (oldest first) for chronological context
      const sortedThreadEmails = [...threadEmails].sort(
        (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
      );

      // Limit to last 10 emails to avoid token limits
      const emailsToInclude = sortedThreadEmails.slice(-10);

      const threadMessages = emailsToInclude.map((threadEmail, index) => {
        const cleanedThreadBody = cleanEmailContent(threadEmail.body, null, 500);
        const dateStr = threadEmail.receivedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const senderName = threadEmail.fromName || threadEmail.from;
        return `[Message ${index + 1} from ${senderName} on ${dateStr}]:\nSubject: ${threadEmail.subject}\nBody: ${cleanedThreadBody}`;
      });

      threadContextText = `\n\nThread Context (${emailsToInclude.length} previous messages, chronological order):\n${threadMessages.join("\n\n---\n\n")}`;
    }

    // Render prompt template with variables
    const prompt = renderPrompt(promptConfig.prompt, {
      from: email.fromName || email.from,
      fromName: email.fromName || email.from,
      senderJobTitle: email.senderJobTitle || "",
      subject: email.subject,
      body: cleanedBody,
      averageTimeToReply: userHistory?.averageTimeToReply,
      currentDate: currentDateStr,
      urgentContext: urgentContextText,
      notUrgentContext: notUrgentContextText,
      goalsContext: goalsContextText,
      workingOnContext: workingOnContextText,
      dontCareContext: dontCareContextText,
      threadInfo: threadInfoText,
      threadContext: threadContextText,
    });

    const response = await this.llmCoreService.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        // Lower temperature for more consistent scoring
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
        userId,
      },
      provider,
      userId,
    );

    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
          urgencyExplanation:
            parsed.urgencyExplanation || "No urgency explanation provided",
          sentimentScore:
            parsed.sentimentScore !== undefined
              ? Math.max(-1, Math.min(1, parsed.sentimentScore))
              : 0,
          goalAlignmentScore: Math.max(0, Math.min(100, parsed.goalAlignmentScore || 0)),
          goalAlignmentExplanation:
            parsed.goalAlignmentExplanation || "No goal alignment explanation provided",
          reasoning: parsed.reasoning || "No reasoning provided",
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM priority response as JSON", error);
    }

    // Fallback: extract component scores from text if JSON parsing fails
    const urgencyKeywords = /urgent|asap|critical|emergency/i.test(response);
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const urgencyScore = urgencyKeywords ? 90 : 0;
    const urgencyExplanation = urgencyKeywords
      ? "Contains urgent keywords"
      : "No urgent indicators detected";

    return {
      urgencyScore,
      urgencyExplanation,
      sentimentScore: 0,
      // Neutral as fallback
      goalAlignmentScore: 0,
      goalAlignmentExplanation: "No goal alignment detected",
      reasoning: response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH),
    };
  }
}

