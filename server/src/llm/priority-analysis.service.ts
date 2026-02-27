import { Injectable, Logger } from "@nestjs/common";
import { LLMCoreService } from "./llm-core.service";
import { LLMProvider } from "./llm.types";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_ANALYZE_PRIORITY_BATCH,
} from "./llm-operations";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import { cleanEmailContent } from "./email-content-cleaner";
import { getPrompt, renderPrompt } from "./prompts";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  BODY_PREVIEW_LENGTHS,
  PRIORITY_ANALYSIS_FALLBACK,
} from "../constants/llm-constants";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";

@Injectable()
export class PriorityAnalysisService {
  private readonly logger = new Logger(PriorityAnalysisService.name);

  constructor(
    private llmCoreService: LLMCoreService,
    private errorTrackingService: ErrorTrackingService,
  ) {}

  private buildUserContextTexts(userContext?: {
    urgentItems?: Array<{ value: string; explanation?: string }>;
    notUrgentItems?: Array<{ value: string; explanation?: string }>;
    goals?: Array<{ value: string; priority?: number }>;
    workingOn?: Array<{ value: string; priority?: number }>;
    dontCare?: Array<{ value: string }>;
    emailCategories?: Array<{ name: string; description?: string }>;
  }): {
    urgentContextText: string;
    notUrgentContextText: string;
    goalsContextText: string;
    workingOnContextText: string;
    dontCareContextText: string;
    emailCategoriesText: string;
  } {
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
    return {
      urgentContextText,
      notUrgentContextText,
      goalsContextText,
      workingOnContextText,
      dontCareContextText,
      emailCategoriesText,
    };
  }

  private buildThreadContextText(
    threadEmails?: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: Date;
    }>,
  ): string {
    if (!threadEmails || threadEmails.length === 0) return "";

    const sortedThreadEmails = [...threadEmails].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
    );
    const emailsToInclude = sortedThreadEmails.slice(
      -DISPLAY_CONSTANTS.MAX_DISPLAY_ITEMS,
    );
    const threadMessages = emailsToInclude.map((threadEmail, index) => {
      const cleanedThreadBody = cleanEmailContent(
        threadEmail.body,
        null,
        BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
      );
      const dateStr = threadEmail.receivedAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const senderName = threadEmail.fromName || threadEmail.from;
      return `[Message ${index + 1} from ${senderName} on ${dateStr}]:\nSubject: ${threadEmail.subject}\nBody: ${cleanedThreadBody}`;
    });
    return `\n\nThread Context (${emailsToInclude.length} previous messages, chronological order):\n${threadMessages.join("\n\n---\n\n")}`;
  }

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
    const cleanedBody = cleanEmailContent(
      email.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    // Load prompt from markdown file
    const promptConfig = getPrompt("analyze_priority");
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: analyze_priority. Expected file: prioritise-email.md in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.",
      );
      this.logger.error("analyze_priority prompt not found", error);
      this.errorTrackingService.captureException(error, userId, {
        operation: "analyze_priority",
        promptId: "analyze_priority",
      });
      throw error;
    }

    const currentDateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const {
      urgentContextText,
      notUrgentContextText,
      goalsContextText,
      workingOnContextText,
      dontCareContextText,
      emailCategoriesText,
    } = this.buildUserContextTexts(userContext);

    const threadInfoText = threadInfo
      ? `\nThread Information:\n${threadInfo.daysSinceLastReply !== undefined ? `- Days since last reply: ${threadInfo.daysSinceLastReply}` : ""}${threadInfo.userShouldReply !== undefined ? `\n- User should reply: ${threadInfo.userShouldReply ? "Yes" : "No"}` : ""}${threadInfo.lastReplyFrom ? `\n- Last reply from: ${threadInfo.lastReplyFrom}` : ""}`
      : "";

    const threadContextText = this.buildThreadContextText(threadEmails);

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
      emailCategories: emailCategoriesText,
      threadInfo: threadInfoText,
      threadContext: threadContextText,
    });

    const response = await this.llmCoreService.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        // Lower temperature for more consistent scoring
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
        operation: LLM_OP_ANALYZE_PRIORITY,
        jsonMode: true,
      },
      provider,
      userId,
    );

    // Try to parse JSON response
    const responsePreview = response.substring(
      0,
      QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
    );
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Support new format { "result": {...} } and legacy flat format
        const analysisResult =
          parsed.result && typeof parsed.result === "object"
            ? parsed.result
            : parsed;
        const category = analysisResult.category || "Other";
        return {
          urgencyScore: Math.max(
            0,
            Math.min(100, analysisResult.urgencyScore || 0),
          ),
          urgencyExplanation:
            analysisResult.urgencyExplanation ||
            "No urgency explanation provided",
          sentimentScore:
            analysisResult.sentimentScore !== undefined
              ? Math.max(-1, Math.min(1, analysisResult.sentimentScore))
              : 0,
          goalAlignmentScore: Math.max(
            0,
            Math.min(100, analysisResult.goalAlignmentScore || 0),
          ),
          goalAlignmentExplanation:
            analysisResult.goalAlignmentExplanation ||
            "No goal alignment explanation provided",
          category,
          categoryExplanation:
            analysisResult.categoryExplanation ||
            "No category explanation provided",
          reasoning: analysisResult.reasoning || "No reasoning provided",
          protoCategorySuggestion:
            category === "Other" && analysisResult.protoCategorySuggestion
              ? {
                  name: analysisResult.protoCategorySuggestion.name || "",
                  description:
                    analysisResult.protoCategorySuggestion.description || "",
                }
              : undefined,
        };
      } else {
        // No JSON object found in response - log clearly so it's visible in worker terminal
        this.logger.error(
          `analyzePriority: LLM returned a non-JSON response - falling back to heuristics. Email subject: "${email.subject}". Response preview: "${responsePreview}"`,
        );
        this.errorTrackingService.captureException(
          new Error(
            `LLM priority response contained no JSON object. Response preview: ${responsePreview}`,
          ),
          userId,
          { operation: "analyze_priority", responsePreview },
        );
      }
    } catch (error) {
      this.logger.error(
        `analyzePriority: Failed to parse LLM priority response as JSON - falling back to heuristics. Email subject: "${email.subject}". Response preview: "${responsePreview}"`,
        error,
      );
      this.errorTrackingService.captureException(error as Error, userId, {
        operation: "analyze_priority",
        responsePreview,
      });
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
  private buildBatchContextSummary(userContext?: {
    urgentItems?: Array<{ value: string; explanation?: string }>;
    notUrgentItems?: Array<{ value: string; explanation?: string }>;
    goals?: Array<{ value: string; priority?: number }>;
    workingOn?: Array<{ value: string; priority?: number }>;
    dontCare?: Array<{ value: string }>;
    emailCategories?: Array<{ name: string; description?: string }>;
  }): { contextParts: string[]; emailCategoriesText: string } {
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
        `Goals: ${userContext.goals.map((goal) => goal.value).join(", ")}`,
      );
    }
    if (userContext?.workingOn?.length) {
      contextParts.push(
        `Working on: ${userContext.workingOn.map((w) => w.value).join(", ")}`,
      );
    }
    if (userContext?.dontCare?.length) {
      contextParts.push(
        `Don't care: ${userContext.dontCare.map((item) => item.value).join(", ")}`,
      );
    }
    const emailCategoriesText = userContext?.emailCategories?.length
      ? userContext.emailCategories
          .map(
            (cat) =>
              `"${cat.name}"${cat.description ? `: ${cat.description}` : ""}`,
          )
          .join(", ")
      : '"Newsletters", "Sales", "Partnerships", "Customer Support", "HR Admin"';
    return { contextParts, emailCategoriesText };
  }

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
      protoCategories?: Array<{ name: string; description?: string }>;
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
        protoCategorySuggestion?: {
          name: string;
          description: string;
        };
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
        protoCategorySuggestion?: {
          name: string;
          description: string;
        };
      }
    >();

    if (emails.length === 0) return results;

    const emailDescriptions = emails.map((email, index) => {
      const cleanedBody = cleanEmailContent(
        email.body,
        null,
        BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
      );
      return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}
Body: ${cleanedBody}`;
    });

    const { contextParts, emailCategoriesText } =
      this.buildBatchContextSummary(userContext);

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
- category: Best fitting from: ${emailCategoriesText}, "Other". Use "Other" ONLY as a last resort after exhausting all provided categories.
- categoryExplanation: Brief explanation
- protoCategorySuggestion (ONLY if category is "Other"): { "name": "emoji + 2-4 word category name", "description": "brief description" }. Be SPECIFIC (e.g. "✅ QA passed issues" not "📂 Issue Comments"). Only suggest when the email truly has no home in any existing category.
- reasoning: Brief analysis

IMPORTANT: Newsletters, digests, mailing list emails, and promotional content should ALWAYS receive an urgency score of 0 and LOW goal alignment scores (0-20). Even if a newsletter's topic overlaps with the user's goals, it is informational background reading and does not require action or a reply. Only score higher if the newsletter contains a specific, time-bound call to action directly relevant to the user. This does NOT apply to calendar invitations, meeting requests, account alerts, or transactional emails — those are automated but actionable and should be scored normally.

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
          maxTokens: emails.length * QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
          userId,
          operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
          jsonMode: true,
        },
        provider,
        userId,
      );

      // Parse the JSON array response
      const batchResponsePreview = response.substring(
        0,
        QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
      );
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const key = item.key || item.emailKey;
            if (key) {
              const category = item.category || "Other";
              results.set(key, {
                urgencyScore: Math.max(
                  0,
                  Math.min(100, item.urgencyScore || 0),
                ),
                urgencyExplanation: item.urgencyExplanation || "No explanation",
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
                category,
                categoryExplanation:
                  item.categoryExplanation || "No explanation",
                reasoning: item.reasoning || "No reasoning",
                protoCategorySuggestion:
                  category === "Other" && item.protoCategorySuggestion
                    ? {
                        name: item.protoCategorySuggestion.name || "",
                        description:
                          item.protoCategorySuggestion.description || "",
                      }
                    : undefined,
              });
            }
          }
        }
      } else {
        // No JSON array found in batch response - log clearly so it's visible in worker terminal
        const emailKeys = emails.map((e) => e.emailKey).join(", ");
        this.logger.error(
          `analyzePriorityBatch: LLM returned a non-JSON response for batch of ${emails.length} emails [${emailKeys}]. Response preview: "${batchResponsePreview}"`,
        );
        this.errorTrackingService.captureException(
          new Error(
            `LLM batch priority response contained no JSON array. Response preview: ${batchResponsePreview}`,
          ),
          userId,
          {
            operation: "analyze_priority_batch",
            emailCount: emails.length,
            emailKeys,
            responsePreview: batchResponsePreview,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `analyzePriorityBatch: Failed to parse batch priority response for ${emails.length} emails`,
        error,
      );
    }

    // Fill in defaults for any emails that didn't get a result
    const missingEmailKeys: string[] = [];
    for (const email of emails) {
      if (!results.has(email.emailKey)) {
        missingEmailKeys.push(email.emailKey);
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

    if (missingEmailKeys.length > 0) {
      this.logger.error(
        `analyzePriorityBatch: ${missingEmailKeys.length} of ${emails.length} emails were missing from LLM batch response and received fallback values. Missing email keys: [${missingEmailKeys.join(", ")}]`,
      );
    }

    return results;
  }
}
