import { Injectable, Logger } from "@nestjs/common";
import { LLMCoreService } from "./llm-core.service";
import { LLMProvider } from "./llm.types";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_ANALYZE_PRIORITY_BATCH,
} from "./llm-operations";
import { cleanEmailContent } from "./email-content-cleaner";
import { getPrompt, renderPrompt } from "./prompts";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { PRIORITY_ANALYSIS_FALLBACK } from "../constants/llm-constants";

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
      emailCategories?: Array<{ name: string; description?: string }>;
      protoCategories?: Array<{ name: string; description?: string }>;
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
    category: string;
    categoryExplanation: string;
    reasoning: string;
    protoCategorySuggestion?: {
      name: string;
      description: string;
    };
  }> {
    // Defensive cleaning in case body wasn't pre-cleaned by caller
    const cleanedBody = cleanEmailContent(email.body, null, 1000);

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
          operation: LLM_OP_ANALYZE_PRIORITY,
        },
        provider,
        userId,
      );

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const category = parsed.category || "Other";
          return {
            urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
            urgencyExplanation:
              parsed.urgencyExplanation || "No urgency explanation provided",
            sentimentScore:
              parsed.sentimentScore !== undefined
                ? Math.max(-1, Math.min(1, parsed.sentimentScore))
                : 0,
            goalAlignmentScore: Math.max(
              0,
              Math.min(100, parsed.goalAlignmentScore || 0),
            ),
            goalAlignmentExplanation:
              parsed.goalAlignmentExplanation ||
              "No goal alignment explanation provided",
            category,
            categoryExplanation:
              parsed.categoryExplanation || "No category explanation provided",
            reasoning: parsed.reasoning || "No reasoning provided",
            protoCategorySuggestion:
              category === "Other" && parsed.protoCategorySuggestion
                ? {
                    name: parsed.protoCategorySuggestion.name || "",
                    description:
                      parsed.protoCategorySuggestion.description || "",
                  }
                : undefined,
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
        category: "Other",
        categoryExplanation: "Unable to categorize - fallback response",
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
    const urgentContextText =
      userContext?.urgentItems && userContext.urgentItems.length > 0
        ? userContext.urgentItems
            .map(
              (item) =>
                `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
            )
            .join("\n")
        : "";
    const notUrgentContextText =
      userContext?.notUrgentItems && userContext.notUrgentItems.length > 0
        ? userContext.notUrgentItems
            .map(
              (item) =>
                `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
            )
            .join("\n")
        : "";
    const goalsContextText =
      userContext?.goals && userContext.goals.length > 0
        ? userContext.goals
            .map(
              (goal) =>
                `- ${goal.value}${goal.priority ? ` (Priority ${goal.priority})` : ""}`,
            )
            .join("\n")
        : "";
    const workingOnContextText =
      userContext?.workingOn && userContext.workingOn.length > 0
        ? userContext.workingOn
            .map(
              (item) =>
                `- ${item.value}${item.priority ? ` (Priority ${item.priority})` : ""}`,
            )
            .join("\n")
        : "";
    const dontCareContextText =
      userContext?.dontCare && userContext.dontCare.length > 0
        ? userContext.dontCare.map((item) => `- ${item.value}`).join("\n")
        : "";

    const emailCategoriesText =
      userContext?.emailCategories && userContext.emailCategories.length > 0
        ? userContext.emailCategories
            .map(
              (cat) =>
                `   - "${cat.name}"${cat.description ? `: ${cat.description}` : ""}`,
            )
            .join("\n")
        : "";

    // Format proto categories for prompt (shown separately to help LLM match)
    const protoCategoriesText =
      userContext?.protoCategories && userContext.protoCategories.length > 0
        ? userContext.protoCategories
            .map(
              (cat) =>
                `   - "${cat.name}"${cat.description ? `: ${cat.description}` : ""} (proposed category, not yet finalized)`,
            )
            .join("\n")
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
        const cleanedThreadBody = cleanEmailContent(
          threadEmail.body,
          null,
          500,
        );
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

    // Combine email categories and proto categories for prompt
    const combinedCategoriesText =
      emailCategoriesText +
      (emailCategoriesText && protoCategoriesText ? "\n" : "") +
      protoCategoriesText;

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
      emailCategories: combinedCategoriesText,
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
        operation: LLM_OP_ANALYZE_PRIORITY,
      },
      provider,
      userId,
    );

    // Try to parse JSON response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const category = parsed.category || "Other";
        return {
          urgencyScore: Math.max(0, Math.min(100, parsed.urgencyScore || 0)),
          urgencyExplanation:
            parsed.urgencyExplanation || "No urgency explanation provided",
          sentimentScore:
            parsed.sentimentScore !== undefined
              ? Math.max(-1, Math.min(1, parsed.sentimentScore))
              : 0,
          goalAlignmentScore: Math.max(
            0,
            Math.min(100, parsed.goalAlignmentScore || 0),
          ),
          goalAlignmentExplanation:
            parsed.goalAlignmentExplanation ||
            "No goal alignment explanation provided",
          category,
          categoryExplanation:
            parsed.categoryExplanation || "No category explanation provided",
          reasoning: parsed.reasoning || "No reasoning provided",
          protoCategorySuggestion:
            category === "Other" && parsed.protoCategorySuggestion
              ? {
                  name: parsed.protoCategorySuggestion.name || "",
                  description: parsed.protoCategorySuggestion.description || "",
                }
              : undefined,
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM priority response as JSON", error);
    }

    // Fallback: extract component scores from text if JSON parsing fails
    const urgencyKeywords = /urgent|asap|critical|emergency/i.test(response);
    const urgencyScore = urgencyKeywords
      ? PRIORITY_ANALYSIS_FALLBACK.URGENCY_KEYWORDS_DETECTED
      : PRIORITY_ANALYSIS_FALLBACK.URGENCY_NO_KEYWORDS;
    const urgencyExplanation = urgencyKeywords
      ? "Contains urgent keywords"
      : "No urgent indicators detected";

    return {
      urgencyScore,
      urgencyExplanation,
      sentimentScore: 0,
      goalAlignmentScore: 0,
      goalAlignmentExplanation: "No goal alignment detected",
      category: "Other",
      categoryExplanation: "Unable to categorize - fallback response",
      reasoning: response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH),
    };
  }

  /**
   * Analyze priority for a batch of emails in a single LLM call.
   * Returns results keyed by the email identifier passed in.
   */
  // eslint-disable-next-line max-lines-per-function
  async analyzePriorityBatch(
    emails: Array<{
      emailKey: string;
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
    }>,
    userContext?: {
      urgentItems?: Array<{ value: string; explanation?: string }>;
      notUrgentItems?: Array<{ value: string; explanation?: string }>;
      goals?: Array<{ value: string; priority?: number }>;
      workingOn?: Array<{ value: string; priority?: number }>;
      dontCare?: Array<{ value: string }>;
      emailCategories?: Array<{ name: string; description?: string }>;
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Map<
      string,
      {
        urgencyScore: number;
        urgencyExplanation: string;
        sentimentScore: number;
        goalAlignmentScore: number;
        goalAlignmentExplanation: string;
        category: string;
        categoryExplanation: string;
        reasoning: string;
      }
    >
  > {
    const results = new Map<
      string,
      {
        urgencyScore: number;
        urgencyExplanation: string;
        sentimentScore: number;
        goalAlignmentScore: number;
        goalAlignmentExplanation: string;
        category: string;
        categoryExplanation: string;
        reasoning: string;
      }
    >();

    if (emails.length === 0) return results;

    // Build compact email list for the batch prompt
    const emailDescriptions = emails.map((email, index) => {
      const cleanedBody = cleanEmailContent(email.body, null, 500);
      return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}
Body: ${cleanedBody}`;
    });

    // Format user context compactly
    const contextParts: string[] = [];
    if (userContext?.urgentItems?.length) {
      contextParts.push(
        `Urgent items: ${userContext.urgentItems.map((i) => i.value).join(", ")}`,
      );
    }
    if (userContext?.notUrgentItems?.length) {
      contextParts.push(
        `Not urgent: ${userContext.notUrgentItems.map((i) => i.value).join(", ")}`,
      );
    }
    if (userContext?.goals?.length) {
      contextParts.push(
        `Goals: ${userContext.goals.map((g) => g.value).join(", ")}`,
      );
    }
    if (userContext?.workingOn?.length) {
      contextParts.push(
        `Working on: ${userContext.workingOn.map((w) => w.value).join(", ")}`,
      );
    }
    if (userContext?.dontCare?.length) {
      contextParts.push(
        `Don't care: ${userContext.dontCare.map((d) => d.value).join(", ")}`,
      );
    }

    const emailCategoriesText =
      userContext?.emailCategories?.length
        ? userContext.emailCategories
            .map(
              (cat) =>
                `"${cat.name}"${cat.description ? `: ${cat.description}` : ""}`,
            )
            .join(", ")
        : '"Newsletters", "Sales", "Partnerships", "Customer Support", "HR Admin"';

    const currentDateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const batchPrompt = `You are an email prioritization assistant. Analyze each email below and return a JSON array of results.

For EACH email, provide:
- urgencyScore (0-100): How urgently it requires attention
- urgencyExplanation: Brief explanation
- sentimentScore (-1 to 1): Email sentiment
- goalAlignmentScore (0-100): Alignment with user's goals
- goalAlignmentExplanation: Brief explanation
- category: Best fitting from: ${emailCategoriesText}, "Other"
- categoryExplanation: Brief explanation
- reasoning: Brief analysis

User context:
${contextParts.length > 0 ? contextParts.join("\n") : "No specific user context."}

Today's date: ${currentDateStr}

${emailDescriptions.join("\n\n")}

Return a JSON array with one object per email, in the same order as the emails above. Each object must include the email's "key" field matching the emailKey.
Example: [{"key": "email-1", "urgencyScore": 30, "urgencyExplanation": "...", "sentimentScore": 0, "goalAlignmentScore": 50, "goalAlignmentExplanation": "...", "category": "Newsletters", "categoryExplanation": "...", "reasoning": "..."}]

IMPORTANT: Return ONLY the JSON array, no other text.`;

    try {
      const response = await this.llmCoreService.generateText(
        {
          prompt: batchPrompt,
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: emails.length * 200,
          userId,
          operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
        },
        provider,
        userId,
      );

      // Parse the JSON array response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const key = item.key || item.emailKey;
            if (key) {
              results.set(key, {
                urgencyScore: Math.max(
                  0,
                  Math.min(100, item.urgencyScore || 0),
                ),
                urgencyExplanation:
                  item.urgencyExplanation || "No explanation",
                sentimentScore:
                  item.sentimentScore !== undefined
                    ? Math.max(-1, Math.min(1, item.sentimentScore))
                    : 0,
                goalAlignmentScore: Math.max(
                  0,
                  Math.min(100, item.goalAlignmentScore || 0),
                ),
                goalAlignmentExplanation:
                  item.goalAlignmentExplanation || "No explanation",
                category: item.category || "Other",
                categoryExplanation:
                  item.categoryExplanation || "No explanation",
                reasoning: item.reasoning || "No reasoning",
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error("Failed to parse batch priority response", error);
    }

    // Fill in defaults for any emails that didn't get a result
    for (const email of emails) {
      if (!results.has(email.emailKey)) {
        results.set(email.emailKey, {
          urgencyScore: 0,
          urgencyExplanation: "Batch analysis failed for this email",
          sentimentScore: 0,
          goalAlignmentScore: 0,
          goalAlignmentExplanation: "Batch analysis failed for this email",
          category: "Other",
          categoryExplanation: "Batch analysis failed",
          reasoning: "Batch analysis did not return results for this email",
        });
      }
    }

    return results;
  }
}
