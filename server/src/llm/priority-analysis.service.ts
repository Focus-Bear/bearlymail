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

type UserContextInput = {
  urgentItems?: Array<{ value: string; explanation?: string }>;
  notUrgentItems?: Array<{ value: string; explanation?: string }>;
  goals?: Array<{ value: string; priority?: number }>;
  workingOn?: Array<{ value: string; priority?: number }>;
  dontCare?: Array<{ value: string }>;
  emailCategories?: Array<{ name: string; description?: string }>;
  protoCategories?: Array<{ name: string; description?: string }>;
};

type UserContextTexts = {
  urgentContextText: string;
  notUrgentContextText: string;
  goalsContextText: string;
  workingOnContextText: string;
  dontCareContextText: string;
  emailCategoriesText: string;
};

type PriorityResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number | undefined;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  reasoning: string;
  protoCategorySuggestion?: { name: string; description: string };
};

export type BatchPriorityResult = PriorityResult & { isFallback: boolean };

type BatchEmailInput = {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  preComputedSentimentScore?: number;
};

@Injectable()
export class PriorityAnalysisService {
  private readonly logger = new Logger(PriorityAnalysisService.name);

  constructor(
    private llmCoreService: LLMCoreService,
    private errorTrackingService: ErrorTrackingService,
  ) {}

  private buildUserContextTexts(
    userContext?: UserContextInput,
  ): UserContextTexts {
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

  /**
   * Build the priority prompt for a single email.
   * Loads the prompt template, formats user context and thread info, and renders the prompt string.
   */
  private buildPriorityPrompt(
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
    },
    userHistory: { averageTimeToReply?: number } | undefined,
    userContext: UserContextInput | undefined,
    threadInfo:
      | {
          daysSinceLastReply?: number;
          userShouldReply?: boolean;
          lastReplyFrom?: string;
        }
      | undefined,
    userId: string | undefined,
  ): { prompt: string; systemPrompt: string } {
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

    const cleanedBody = cleanEmailContent(
      email.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const currentDateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const contextTexts = this.buildUserContextTexts(userContext);

    const threadInfoText = threadInfo
      ? `\nThread Information:\n${
          threadInfo.daysSinceLastReply !== undefined
            ? `- Days since last reply: ${threadInfo.daysSinceLastReply}`
            : ""
        }${
          threadInfo.userShouldReply !== undefined
            ? `\n- User should reply: ${threadInfo.userShouldReply ? "Yes" : "No"}`
            : ""
        }${threadInfo.lastReplyFrom ? `\n- Last reply from: ${threadInfo.lastReplyFrom}` : ""}`
      : "";

    const prompt = renderPrompt(promptConfig.prompt, {
      from: email.fromName || email.from,
      fromName: email.fromName || email.from,
      senderJobTitle: email.senderJobTitle || "",
      subject: email.subject,
      body: cleanedBody,
      averageTimeToReply: userHistory?.averageTimeToReply,
      currentDate: currentDateStr,
      urgentContext: contextTexts.urgentContextText,
      notUrgentContext: contextTexts.notUrgentContextText,
      goalsContext: contextTexts.goalsContextText,
      workingOnContext: contextTexts.workingOnContextText,
      dontCareContext: contextTexts.dontCareContextText,
      emailCategories: contextTexts.emailCategoriesText,
      threadInfo: threadInfoText,
    });

    return { prompt, systemPrompt: promptConfig.systemPrompt || "" };
  }

  /**
   * Parse a successful LLM priority response JSON into a PriorityResult.
   * Returns null if the JSON doesn't contain a valid priority object.
   */
  private parsePriorityResponse(
    response: string,
    preComputedSentimentScore: number | undefined,
    emailSubject: string,
    responsePreview: string,
    userId: string | undefined,
  ): PriorityResult | null {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error(
        `analyzePriority: LLM returned a non-JSON response - falling back to heuristics. Email subject: "${emailSubject}". Response preview: "${responsePreview}"`,
      );
      this.errorTrackingService.captureException(
        new Error(
          `LLM priority response contained no JSON object. Response preview: ${responsePreview}`,
        ),
        userId,
        { operation: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY, responsePreview },
      );
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
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
        analysisResult.urgencyExplanation || "No urgency explanation provided",
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
  }

  /**
   * Build a keyword-based fallback PriorityResult when LLM parsing fails.
   */
  private buildFallbackPriorityResult(
    response: string,
    preComputedSentimentScore: number | undefined,
  ): PriorityResult {
    const urgencyKeywords = /urgent|asap|critical|emergency/i.test(response);
    const urgencyScore = urgencyKeywords
      ? PRIORITY_ANALYSIS_FALLBACK.URGENCY_KEYWORDS_DETECTED
      : PRIORITY_ANALYSIS_FALLBACK.URGENCY_NO_KEYWORDS;

    return {
      urgencyScore,
      urgencyExplanation: urgencyKeywords
        ? "Contains urgent keywords"
        : "No urgent indicators detected",
      sentimentScore: preComputedSentimentScore,
      goalAlignmentScore: 0,
      goalAlignmentExplanation: "No goal alignment detected",
      category: "Other",
      categoryExplanation: "Unable to categorize - fallback response",
      reasoning: response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH),
    };
  }

  async analyzePriority(options: {
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
    };
    userHistory?: {
      averageTimeToReply?: number;
      similarEmailsReplyTime?: number;
    };
    provider?: LLMProvider;
    userId?: string;
    userContext?: UserContextInput;
    threadInfo?: {
      daysSinceLastReply?: number;
      userShouldReply?: boolean;
      lastReplyFrom?: string;
    };
    preComputedSentimentScore?: number;
  }): Promise<PriorityResult> {
    const {
      email,
      userHistory,
      provider,
      userId,
      userContext,
      threadInfo,
      preComputedSentimentScore,
    } = options;
    const { prompt, systemPrompt } = this.buildPriorityPrompt(
      email,
      userHistory,
      userContext,
      threadInfo,
      userId,
    );

    const response = await this.llmCoreService.generateText(
      {
        prompt,
        systemPrompt,
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
        operation: LLM_OP_ANALYZE_PRIORITY,
        jsonMode: true,
      },
      provider,
      userId,
    );

    const responsePreview = response.substring(
      0,
      QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
    );

    try {
      const parsed = this.parsePriorityResponse(
        response,
        preComputedSentimentScore,
        email.subject,
        responsePreview,
        userId,
      );
      if (parsed) return parsed;
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

    return this.buildFallbackPriorityResult(
      response,
      preComputedSentimentScore,
    );
  }

  /**
   * Extract the per-email results array from a parsed LLM batch response.
   *
   * Only accepts the canonical shape: `{ "priority_results": [...] }`.
   * Any other shape (bare array, wrong wrapper key, etc.) is treated as a
   * prompt compliance failure — logged and returned as null so the caller
   * falls back to sentinel values.
   *
   * Returns `null` when the response does not match the canonical shape.
   */
  private extractBatchResultsArray(parsed: unknown): unknown[] | null {
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
   * Build the batch priority prompt. Renders the shared single-email template in batch mode.
   * Using the shared template ensures batch categorisation always inherits prompt improvements.
   */
  private buildBatchPriorityPrompt(
    emails: BatchEmailInput[],
    userContext: UserContextInput | undefined,
    userId: string | undefined,
  ): { prompt: string; systemPrompt: string } {
    const promptConfig = getPrompt(PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY);
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: analyze_priority. Expected file: prioritise-email.md in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.",
      );
      this.logger.error(
        "analyze_priority prompt not found (batch path)",
        error,
      );
      this.errorTrackingService.captureException(error, userId, {
        operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
        promptId: PRIORITY_PROMPT_IDS.ANALYZE_PRIORITY,
      });
      throw error;
    }

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

    const contextTexts = this.buildUserContextTexts(userContext);
    const currentDateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const prompt = renderPrompt(promptConfig.prompt, {
      batchMode: true,
      emailBatch: emailDescriptions.join("\n\n"),
      emailCategories: contextTexts.emailCategoriesText,
      urgentContext: contextTexts.urgentContextText,
      notUrgentContext: contextTexts.notUrgentContextText,
      goalsContext: contextTexts.goalsContextText,
      workingOnContext: contextTexts.workingOnContextText,
      dontCareContext: contextTexts.dontCareContextText,
      currentDate: currentDateStr,
      fromName: "",
      senderJobTitle: "",
      subject: "",
      body: "",
      threadInfo: "",
      averageTimeToReply: undefined,
    });
    return { prompt, systemPrompt: promptConfig.systemPrompt || "" };
  }

  /**
   * Parse a batch LLM response and populate the results map.
   * Returns false if the response couldn't be parsed (caller should log an error).
   */
  private parseBatchPriorityResponse(
    response: string,
    emails: BatchEmailInput[],
    results: Map<string, BatchPriorityResult>,
    responsePreview: string,
    userId: string | undefined,
  ): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      const jsonObjMatch = response.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        parsed = JSON.parse(jsonObjMatch[0]);
      } else {
        const jsonArrMatch = response.match(/\[[\s\S]*\]/);
        if (jsonArrMatch) {
          parsed = JSON.parse(jsonArrMatch[0]);
        }
      }
    }

    const parsedArray = this.extractBatchResultsArray(parsed);
    if (parsedArray === null) {
      const emailKeys = emails
        .map((emailEntry) => emailEntry.emailKey)
        .join(", ");
      this.logger.error(
        `analyzePriorityBatch: LLM returned a non-JSON response for batch of ${emails.length} emails [${emailKeys}]. Response preview: "${responsePreview}"`,
      );
      this.errorTrackingService.captureException(
        new Error(
          `LLM batch priority response contained no JSON array. Response preview: ${responsePreview}`,
        ),
        userId,
        {
          operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
          emailCount: emails.length,
          emailKeys,
          responsePreview,
        },
      );
      return false;
    }

    const sentimentByKey = new Map<string, number | undefined>(
      emails.map((email) => [email.emailKey, email.preComputedSentimentScore]),
    );

    for (const item of parsedArray) {
      const typedItem = item as Record<string, unknown>;
      const key = (typedItem.key as string) || (typedItem.emailKey as string);
      if (!key) continue;

      const category = (typedItem.category as string) || "Other";
      const protoSuggestion = typedItem.protoCategorySuggestion as
        | Record<string, string>
        | undefined;
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
          (typedItem.goalAlignmentExplanation as string) || "No explanation",
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

    return true;
  }

  /**
   * Fill in sentinel fallback entries for any emails missing from the batch results.
   * Callers MUST check isFallback and skip DB writes to avoid overwriting valid scores.
   */
  private fillFallbackEntries(
    results: Map<string, BatchPriorityResult>,
    emails: BatchEmailInput[],
  ): void {
    const missingEmailKeys: string[] = [];
    for (const email of emails) {
      if (!results.has(email.emailKey)) {
        missingEmailKeys.push(email.emailKey);
        results.set(email.emailKey, {
          urgencyScore: 0,
          urgencyExplanation: "Batch analysis failed for this email",
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
  }

  /**
   * Analyze priority for a batch of emails in a single LLM call.
   * Returns results keyed by the email identifier passed in.
   */
  async analyzePriorityBatch(
    emails: BatchEmailInput[],
    userContext?: UserContextInput,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Map<string, BatchPriorityResult>> {
    const results = new Map<string, BatchPriorityResult>();
    if (emails.length === 0) return results;

    const { prompt: batchPrompt, systemPrompt: batchSystemPrompt } =
      this.buildBatchPriorityPrompt(emails, userContext, userId);

    try {
      const response = await this.llmCoreService.generateText(
        {
          prompt: batchPrompt,
          systemPrompt: batchSystemPrompt,
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: emails.length * QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
          userId,
          operation: LLM_OP_ANALYZE_PRIORITY_BATCH,
          jsonMode: true,
        },
        provider,
        userId,
      );

      const responsePreview = response.substring(
        0,
        QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
      );
      this.parseBatchPriorityResponse(
        response,
        emails,
        results,
        responsePreview,
        userId,
      );
    } catch (error) {
      this.logger.error(
        `analyzePriorityBatch: Batch LLM call failed for ${emails.length} emails — attempting individual fallback`,
        error,
      );

      // Attempt individual analysis for each email instead of marking all as fallback.
      // This degrades gracefully at higher LLM cost rather than leaving all emails stuck at score=0.
      for (const batchEmail of emails) {
        // already succeeded
        if (results.has(batchEmail.emailKey)) continue;
        try {
          const individualResult = await this.analyzePriority({
            email: {
              from: batchEmail.from,
              fromName: batchEmail.fromName,
              senderJobTitle: batchEmail.senderJobTitle,
              subject: batchEmail.subject,
              body: batchEmail.body,
            },
            userContext,
            provider,
            userId,
            preComputedSentimentScore: batchEmail.preComputedSentimentScore,
          });
          results.set(batchEmail.emailKey, {
            ...individualResult,
            isFallback: false,
          });
        } catch (individualError) {
          // Only this specific email falls back — logged below by fillFallbackEntries
          this.logger.error(
            `analyzePriorityBatch: Individual fallback also failed for email key "${batchEmail.emailKey}"`,
            individualError,
          );
        }
      }
    }

    this.fillFallbackEntries(results, emails);
    return results;
  }
}
