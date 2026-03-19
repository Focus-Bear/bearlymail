import { Injectable, Logger } from "@nestjs/common";

import {
  BODY_PREVIEW_LENGTHS,
  PRIORITY_ANALYSIS_FALLBACK,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_ANALYZE_PRIORITY_BATCH,
} from "./llm-operations";
import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

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
    preComputedSentimentScore?: number,
  ): Promise<{
    urgencyScore: number;
    urgencyExplanation: string;
    sentimentScore: number | undefined;
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
    const promptConfig = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: analyze_priority. Expected file: prioritise-email.md in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.",
      );
      this.logger.error("analyze_priority prompt not found", error);
      this.errorTrackingService.captureException(error, userId, {
        operation: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
        promptId: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
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
          // Use pre-computed sentiment from summary step if provided (token-efficient).
          // The priority prompt instructs the LLM not to compute sentiment, so the
          // LLM-returned value is unreliable. Fall back to undefined so applyPriorityResult
          // skips the DB write and preserves the summary-step value.
          sentimentScore:
            preComputedSentimentScore !== undefined
              ? preComputedSentimentScore
              : undefined,
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
          { operation: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY, responsePreview },
        );
      }
    } catch (error) {
      this.logger.error(
        `analyzePriority: Failed to parse LLM priority response as JSON - falling back to heuristics. Email subject: "${email.subject}". Response preview: "${responsePreview}"`,
        error,
      );
      this.errorTrackingService.captureException(error as Error, userId, {
        operation: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
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
      // Use pre-computed sentiment if available; undefined signals applyPriorityResult to skip DB write.
      sentimentScore: preComputedSentimentScore,
      goalAlignmentScore: 0,
      goalAlignmentExplanation: "No goal alignment detected",
      category: "Other",
      categoryExplanation: "Unable to categorize - fallback response",
      reasoning: response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH),
    };
  }

  /**
   * Extract the per-email results array from a parsed LLM batch response.
   *
   * Only accepts the canonical shape: `{ "priority_results": [...] }`.
   * Any other shape (bare array, wrong wrapper key, etc.) is treated as a
   * prompt compliance failure — logged and returned as null so the caller
   * falls back to sentinel values. This surfaces LLM non-compliance instead
   * of silently accepting it.
   *
   * Returns `null` when the response does not match the canonical shape.
   */
  private extractBatchResultsArray(parsed: unknown): unknown[] | null {
    // Only accept the canonical shape: { priority_results: [...] }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "priority_results" in parsed &&
      Array.isArray((parsed as Record<string, unknown>)["priority_results"])
    ) {
      return (parsed as Record<string, unknown>)[
        "priority_results"
      ] as unknown[];
    }
    // Any other shape is a prompt compliance failure — log it and return null (triggers fallback)
    this.logger.warn(
      `[analyzePriorityBatch] Unexpected response shape from LLM. Expected { priority_results: [...] }.`,
      {
        parsed: (JSON.stringify(parsed) ?? "").slice(
          0,
          QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH,
        ),
      },
    );
    return null;
  }

  /**
   * Analyze priority for a batch of emails in a single LLM call.
   * Returns results keyed by the email identifier passed in.
   */
  async analyzePriorityBatch(
    emails: Array<{
      emailKey: string;
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
      /**
       * Pre-computed sentiment score from the summarisation step.
       * If provided, it is used directly and the priority LLM is not asked to compute sentiment.
       */
      preComputedSentimentScore?: number;
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
        sentimentScore: number | undefined;
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
        sentimentScore: number | undefined;
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
      return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}
Summary: ${cleanedBody}`;
    });

    // Load and render the same promptfoo template used by the single-email path (parity fix #1144).
    // Using the shared template ensures batch categorisation always inherits prompt improvements:
    // Step 1/2/3 sender-type logic, GitHub-specific guidance, exclusion qualifier reasoning.
    const promptConfig = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: analyze_priority. Expected file: prioritise-email.md in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.",
      );
      this.logger.error("analyze_priority prompt not found (batch path)", error);
      this.errorTrackingService.captureException(error, userId, {
        operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
        promptId: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
      });
      throw error;
    }

    const {
      urgentContextText,
      notUrgentContextText,
      goalsContextText,
      workingOnContextText,
      dontCareContextText,
      emailCategoriesText,
    } = this.buildUserContextTexts(userContext);

    const currentDateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const batchPrompt = renderPrompt(promptConfig.prompt, {
      batchMode: true,
      emailBatch: emailDescriptions.join("\n\n"),
      currentDate: currentDateStr,
      urgentContext: urgentContextText,
      notUrgentContext: notUrgentContextText,
      goalsContext: goalsContextText,
      workingOnContext: workingOnContextText,
      dontCareContext: dontCareContextText,
      emailCategories: emailCategoriesText,
    });

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

      // Extract the results array from the parsed response.
      // Only accepts the canonical shape: { "priority_results": [...] }.
      // Any other shape is treated as a prompt compliance failure.
      const parsedArray = this.extractBatchResultsArray(parsed);

      if (parsedArray !== null) {
        // Build a lookup map of emailKey → preComputedSentimentScore for O(1) access
        const sentimentByKey = new Map<string, number | undefined>(
          emails.map((email) => [
            email.emailKey,
            email.preComputedSentimentScore,
          ]),
        );

        for (const item of parsedArray) {
          const typedItem = item as Record<string, unknown>;
          const key =
            (typedItem.key as string) || (typedItem.emailKey as string);
          if (key) {
            const category = (typedItem.category as string) || "Other";
            const protoSuggestion = typedItem.protoCategorySuggestion as
              | Record<string, string>
              | undefined;
            // Use pre-computed sentiment from summarisation step if available.
            // The batch prompt instructs the LLM not to compute sentiment, so the LLM-returned
            // value is unreliable. Returning undefined signals applyPriorityResult to skip the
            // DB write and preserve the existing sentiment from the summary step.
            const preComputedSentimentScore = sentimentByKey.get(key);
            results.set(key, {
              urgencyScore: Math.max(
                0,
                Math.min(100, (typedItem.urgencyScore as number) || 0),
              ),
              urgencyExplanation:
                (typedItem.urgencyExplanation as string) || "No explanation",
              sentimentScore: preComputedSentimentScore,
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
        const emailKeys = emails
          .map((emailEntry) => emailEntry.emailKey)
          .join(", ");
        this.logger.error(
          `analyzePriorityBatch: LLM returned a non-JSON response for batch of ${emails.length} emails [${emailKeys}]. Response preview: "${batchResponsePreview}"`,
        );
        this.errorTrackingService.captureException(
          new Error(
            `LLM batch priority response contained no JSON array. Response preview: ${batchResponsePreview}`,
          ),
          userId,
          {
            operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
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
          // undefined signals applyPriorityResult to skip the DB write
          sentimentScore: undefined,
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
