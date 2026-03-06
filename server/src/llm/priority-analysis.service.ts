import { Injectable, Logger } from "@nestjs/common";

import {
  BODY_PREVIEW_LENGTHS,
  PRIORITY_ANALYSIS_FALLBACK,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_ANALYZE_PRIORITY_BATCH,
} from "./llm-operations";
import { getPrompt, renderPrompt } from "./prompts";

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
      /** Optional thread context (previous messages) to improve LLM accuracy for replies */
      threadContext?: string;
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
        /**
         * True when this entry is a fallback/sentinel value because the LLM did not
         * return a result for this email. Callers MUST skip DB writes for fallback
         * entries to avoid overwriting existing valid priority scores with zeros.
         */
        isFallback: boolean;
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
        isFallback: boolean;
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
      const threadContextSection = email.threadContext
        ? `\nThread Context (previous messages, chronological):\n${email.threadContext}`
        : "";
      return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}${threadContextSection}
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

    const batchPrompt = `You are an email prioritization assistant. Analyze each email below and return a JSON object wrapping an array of results.

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

Respond with a JSON object with exactly one key \`priority_results\` containing the array of per-email result objects. The top-level key MUST be exactly \`priority_results\`. Each object must include the email's "key" field matching the emailKey.
Example (2-item):
{
  "priority_results": [
    {
      "key": "email-1",
      "urgencyScore": 30,
      "urgencyExplanation": "Low urgency, informational content",
      "sentimentScore": 0,
      "goalAlignmentScore": 10,
      "goalAlignmentExplanation": "Newsletter unrelated to active goals",
      "category": "Newsletters",
      "categoryExplanation": "Mass-sent digest email",
      "reasoning": "Weekly digest with no call to action"
    },
    {
      "key": "email-2",
      "urgencyScore": 75,
      "urgencyExplanation": "Customer blocked, needs immediate response",
      "sentimentScore": -0.6,
      "goalAlignmentScore": 85,
      "goalAlignmentExplanation": "Directly related to active support goal",
      "category": "Customer Support",
      "categoryExplanation": "Customer reporting a blocker",
      "reasoning": "High-priority support request requiring prompt reply"
    }
  ]
}

IMPORTANT: The top-level response MUST be a JSON object with key \`priority_results\`, NOT a bare array.`;

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

      // Parse the JSON response.
      // json_object mode guarantees valid JSON, so JSON.parse(response) is the primary path.
      // Fallbacks handle edge cases (non-json_object providers, response leakage, etc.).
      const batchResponsePreview = response.substring(
        0,
        QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
      );

      // Attempt to parse and extract the results array
      let parsed: unknown;
      try {
        parsed = JSON.parse(response);
      } catch {
        // json_object mode should always yield valid JSON, but guard against edge cases
        // by trying to extract a JSON object or array from the response text.
        const jsonObjMatch = response.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          // May throw — let the outer catch handle it and log "Failed to parse"
          parsed = JSON.parse(jsonObjMatch[0]);
        } else {
          const jsonArrMatch = response.match(/\[[\s\S]*\]/);
          if (jsonArrMatch) {
            // May throw — let the outer catch handle it and log "Failed to parse"
            parsed = JSON.parse(jsonArrMatch[0]);
          }
          // else: parsed remains undefined — handled below
        }
      }

      let parsedArray: unknown[] | null = null;

      if (Array.isArray(parsed)) {
        // Gemini guard: some API variants return a bare array instead of a wrapped object
        this.logger.warn(
          `analyzePriorityBatch: LLM returned a bare array instead of a wrapped { priority_results: [...] } object. Accepting with warning. Batch size: ${emails.length}`,
        );
        parsedArray = parsed;
      } else if (
        parsed !== null &&
        parsed !== undefined &&
        typeof parsed === "object"
      ) {
        const parsedRecord = parsed as Record<string, unknown>;
        if (Array.isArray(parsedRecord.priority_results)) {
          // Primary path: correct wrapper key
          parsedArray = parsedRecord.priority_results;
        } else {
          // Fallback: LLM used a different wrapper key — find the first array-valued property
          const arrayKey = Object.keys(parsedRecord).find((k) =>
            Array.isArray(parsedRecord[k]),
          );
          if (arrayKey) {
            this.logger.warn(
              `analyzePriorityBatch: Expected top-level key 'priority_results' but found '${arrayKey}'. Using fallback. Prompt may need updating.`,
            );
            parsedArray = parsedRecord[arrayKey] as unknown[];
          }
        }
      }

      if (parsedArray !== null) {
        for (const item of parsedArray) {
          const typedItem = item as Record<string, unknown>;
          const key =
            (typedItem.key as string) || (typedItem.emailKey as string);
          if (key) {
            const category = (typedItem.category as string) || "Other";
            const protoSuggestion = typedItem.protoCategorySuggestion as
              | Record<string, string>
              | undefined;
            results.set(key, {
              urgencyScore: Math.max(
                0,
                Math.min(100, (typedItem.urgencyScore as number) || 0),
              ),
              urgencyExplanation:
                (typedItem.urgencyExplanation as string) || "No explanation",
              sentimentScore:
                typedItem.sentimentScore !== undefined
                  ? Math.max(
                      -1,
                      Math.min(1, typedItem.sentimentScore as number),
                    )
                  : 0,
              goalAlignmentScore: Math.max(
                0,
                Math.min(100, (typedItem.goalAlignmentScore as number) || 0),
              ),
              goalAlignmentExplanation:
                (typedItem.goalAlignmentExplanation as string) ||
                "No explanation",
              category,
              categoryExplanation:
                (typedItem.categoryExplanation as string) || "No explanation",
              reasoning: (typedItem.reasoning as string) || "No reasoning",
              isFallback: false,
              protoCategorySuggestion:
                category === "Other" && protoSuggestion
                  ? {
                      name: protoSuggestion.name || "",
                      description: protoSuggestion.description || "",
                    }
                  : undefined,
            });
          }
        }
      } else {
        // No usable array found — log clearly so it's visible in worker terminal
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

    // Fill in sentinel fallback entries for any emails that didn't get a result.
    // NOTE: isFallback is set to TRUE — callers MUST check this flag and skip DB
    // writes to avoid overwriting existing valid priority scores with zero values.
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
          isFallback: true,
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
