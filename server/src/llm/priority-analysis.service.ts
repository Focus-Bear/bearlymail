import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  BODY_PREVIEW_LENGTHS,
  PRIORITY_ANALYSIS_FALLBACK,
  TRIAGE_PRESERVED_CATEGORY,
  TRIAGE_PRESERVED_EXPLANATIONS,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";
import { resolveLlmCategoryToDisplayName } from "../utils/category-key.util";
import { CategoryShortlistService } from "./category-shortlist.service";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_BATCH_PRIORITY_TRIAGE,
} from "./llm-operations";
import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

const DEFAULT_TRIAGE_MODEL = "gpt-5.4-nano";

type UserContextInput = {
  urgentItems?: Array<{ value: string; explanation?: string }>;
  notUrgentItems?: Array<{ value: string; explanation?: string }>;
  goals?: Array<{ value: string; priority?: number }>;
  workingOn?: Array<{ value: string; priority?: number }>;
  dontCare?: Array<{ value: string }>;
  emailCategories?: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  protoCategories?: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
};

type UserContextTexts = {
  urgentContextText: string;
  notUrgentContextText: string;
  goalsContextText: string;
  workingOnContextText: string;
  dontCareContextText: string;
  emailCategoriesText: string;
};

export type CategoryConfidence = "HIGH" | "MEDIUM" | "LOW";

type PriorityResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number | undefined;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  /** Confidence level the LLM assigned to its category decision. Used for deterministic rule generation (issue #1624). */
  categoryConfidence?: CategoryConfidence;
  reasoning: string;
  protoCategorySuggestion?: { name: string; description: string };
};

export type BatchPriorityResult = PriorityResult & {
  isFallback: boolean;
  /** True when triage determined no reanalysis is needed (preserve existing scores). False for LLM analysis failures. */
  triagePreserved?: boolean;
};

type BatchEmailInput = {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  preComputedSentimentScore?: number;
  /** Existing urgency score on the thread (0–100), used by the triage prompt to detect significant changes. */
  existingUrgencyScore?: number;
  /** Existing category name for the thread, used by the triage prompt to evaluate category shift. */
  existingCategory?: string;
};

@Injectable()
export class PriorityAnalysisService {
  private readonly logger = new Logger(PriorityAnalysisService.name);

  constructor(
    private llmCoreService: LLMCoreService,
    private errorTrackingService: ErrorTrackingService,
    private categoryShortlistService: CategoryShortlistService,
    private readonly configService: ConfigService,
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
            .map((cat) => {
              const keyPart = cat.categoryKey
                ? ` [id: ${cat.categoryKey}]`
                : "";
              return `   - "${cat.name}"${keyPart}${cat.description ? `: ${cat.description}` : ""}`;
            })
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
   * When the category shortlist feature is enabled and category count exceeds the threshold,
   * a cheap model pre-filters the category list to the top-N most relevant candidates.
   */
  private async buildPriorityPrompt(
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
  ): Promise<{ prompt: string; systemPrompt: string }> {
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

    // Apply category shortlisting when category count exceeds the threshold.
    // Step 1: pass the cleaned summary (not raw body) to the shortlist model.
    // Step 2: the smart prompt below then chooses the best category from the shortlisted candidates.
    const allCategories = [
      ...(userContext?.emailCategories ?? []),
      ...(userContext?.protoCategories ?? []),
    ];
    const effectiveCategories =
      this.categoryShortlistService.isShortlistEnabled(allCategories.length)
        ? await this.categoryShortlistService.getShortlist(
            {
              from: email.from,
              fromName: email.fromName,
              subject: email.subject,
              summary: cleanedBody,
            },
            allCategories,
          )
        : allCategories;

    const effectiveUserContext: UserContextInput | undefined = userContext
      ? {
          ...userContext,
          emailCategories: effectiveCategories,
          protoCategories: [],
        }
      : userContext;

    const contextTexts = this.buildUserContextTexts(effectiveUserContext);

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
  private applyCategoryKeyResolution(
    result: PriorityResult,
    userContext?: UserContextInput,
  ): PriorityResult {
    const emailCats = userContext?.emailCategories ?? [];
    const protoCats = userContext?.protoCategories ?? [];
    if (emailCats.length === 0 && protoCats.length === 0) {
      return result;
    }
    const resolved = resolveLlmCategoryToDisplayName(
      result.category,
      emailCats,
      protoCats,
    );
    if (resolved === result.category) {
      return result;
    }
    return { ...result, category: resolved };
  }

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
      categoryConfidence:
        analysisResult.categoryConfidence === "HIGH" ||
        analysisResult.categoryConfidence === "MEDIUM" ||
        analysisResult.categoryConfidence === "LOW"
          ? (analysisResult.categoryConfidence as CategoryConfidence)
          : undefined,
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
    const { prompt, systemPrompt } = await this.buildPriorityPrompt(
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
      if (parsed) {
        return this.applyCategoryKeyResolution(parsed, userContext);
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

    return this.buildFallbackPriorityResult(
      response,
      preComputedSentimentScore,
    );
  }

  /**
   * Build the batch triage prompt using the `batch-priority-triage.md` template.
   *
   * The triage step is lightweight: it only flags whether each email needs a full
   * re-analysis (needsReanalysis: true/false). It does NOT choose categories or
   * compute scores. Emails flagged for reanalysis are then passed individually
   * through the two-step shortlist → smart-prompt pipeline.
   */
  private buildBatchTriagePrompt(
    emails: BatchEmailInput[],
    userId: string | undefined,
  ): { prompt: string; systemPrompt: string } {
    const promptConfig = getPrompt(PRIORITY_PROMPT_IDS.BATCH_PRIORITY_TRIAGE);
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: batch_priority_triage. Expected file: batch-priority-triage.md in server/promptfoo/prompts/ directory.",
      );
      this.logger.error("batch_priority_triage prompt not found", error);
      this.errorTrackingService.captureException(error, userId, {
        operation: LLM_OP_BATCH_PRIORITY_TRIAGE,
        promptId: PRIORITY_PROMPT_IDS.BATCH_PRIORITY_TRIAGE,
      });
      throw error;
    }

    const emailList = emails
      .map((email, index) => {
        const cleanedBody = cleanEmailContent(
          email.body,
          null,
          BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
        );
        const categoryHint = `\nExisting category: ${email.existingCategory ?? "unassigned"}`;
        const urgencyHint =
          email.existingUrgencyScore !== undefined
            ? `\nExisting urgency score: ${email.existingUrgencyScore}/100`
            : "";
        return `--- EMAIL ${index + 1} (key: "${email.emailKey}") ---
From: ${email.fromName || email.from}${email.senderJobTitle ? ` (${email.senderJobTitle})` : ""}
Subject: ${email.subject}
Summary: ${cleanedBody}${categoryHint}${urgencyHint}`;
      })
      .join("\n\n");

    const prompt = renderPrompt(promptConfig.prompt, { emailList });
    return { prompt, systemPrompt: promptConfig.systemPrompt || "" };
  }

  /**
   * Parse the triage LLM response into a set of email keys that need reanalysis.
   *
   * Accepts `{ "results": [{ "key": "...", "needsReanalysis": true/false }] }`.
   * On any parse failure, returns null (caller should fall back to analysing all emails).
   */
  private parseTriageResponse(
    response: string,
    emails: BatchEmailInput[],
  ): Set<string> | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(
          "[analyzePriorityBatch] Triage response contained no JSON object — will reanalyse all emails",
        );
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      if (!parsed || !Array.isArray(parsed["results"])) {
        this.logger.warn(
          "[analyzePriorityBatch] Triage response missing `results` array — will reanalyse all emails",
        );
        return null;
      }

      const needsReanalysis = new Set<string>();
      const validKeys = new Set(emails.map((email) => email.emailKey));
      const mentionedKeys = new Set<string>();

      for (const item of parsed["results"] as unknown[]) {
        const entry = item as Record<string, unknown>;
        const key = entry["key"] as string | undefined;
        if (key && validKeys.has(key)) {
          mentionedKeys.add(key);
          if (entry["needsReanalysis"] === true) {
            needsReanalysis.add(key);
          }
        }
      }

      // Fail-open: keys omitted from the triage response must be reanalysed
      for (const email of emails) {
        if (!mentionedKeys.has(email.emailKey)) {
          this.logger.warn(
            `[analyzePriorityBatch] Triage response omitted key "${email.emailKey}" — forcing reanalysis`,
          );
          needsReanalysis.add(email.emailKey);
        }
      }

      return needsReanalysis;
    } catch (error) {
      this.logger.error(
        "[analyzePriorityBatch] Failed to parse triage response — will reanalyse all emails",
        error,
      );
      return null;
    }
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
   * Phase 1 — Triage: run the cheap triage model against emails that already have scores.
   * Marks triage-preserved emails in `results` and returns the set of emails needing full
   * reanalysis (new emails always included; existing emails only if triage flags them).
   * Falls back to returning all emails if the triage call or parse fails.
   */
  private async runTriagePhase(
    emails: BatchEmailInput[],
    emailsNeedingTriage: BatchEmailInput[],
    emailsWithoutAnalysis: BatchEmailInput[],
    results: Map<string, BatchPriorityResult>,
    userId: string | undefined,
  ): Promise<BatchEmailInput[]> {
    if (emailsNeedingTriage.length === 0) {
      this.logger.log(
        `analyzePriorityBatch: no emails with existing analysis — skipping triage, analysing all ${emails.length} emails individually`,
      );
      return emails;
    }
    try {
      const { prompt: triagePrompt, systemPrompt: triageSystemPrompt } =
        this.buildBatchTriagePrompt(emailsNeedingTriage, userId);
      const triageResponse = await this.llmCoreService.generateText(
        {
          prompt: triagePrompt,
          systemPrompt: triageSystemPrompt,
          temperature: 0,
          maxTokens:
            emailsNeedingTriage.length *
            QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
          userId,
          operation: LLM_OP_BATCH_PRIORITY_TRIAGE,
          jsonMode: true,
          model:
            this.configService.get<string>("CATEGORY_TRIAGE_MODEL") ??
            DEFAULT_TRIAGE_MODEL,
        },
        LLMProvider.OPENAI,
        userId,
      );
      const flaggedKeys = this.parseTriageResponse(
        triageResponse,
        emailsNeedingTriage,
      );
      if (flaggedKeys !== null) {
        for (const email of emailsNeedingTriage) {
          if (!flaggedKeys.has(email.emailKey)) {
            results.set(email.emailKey, {
              urgencyScore: -1,
              urgencyExplanation: TRIAGE_PRESERVED_EXPLANATIONS.URGENCY,
              sentimentScore: email.preComputedSentimentScore,
              goalAlignmentScore: -1,
              goalAlignmentExplanation:
                TRIAGE_PRESERVED_EXPLANATIONS.GOAL_ALIGNMENT,
              category: TRIAGE_PRESERVED_CATEGORY,
              categoryExplanation: TRIAGE_PRESERVED_EXPLANATIONS.CATEGORY,
              reasoning: TRIAGE_PRESERVED_EXPLANATIONS.REASONING,
              isFallback: false,
              triagePreserved: true,
            });
          }
        }
        const flaggedFromTriage = emailsNeedingTriage.filter((email) =>
          flaggedKeys.has(email.emailKey),
        );
        const emailsToAnalyse = [
          ...emailsWithoutAnalysis,
          ...flaggedFromTriage,
        ];
        this.logger.log(
          `analyzePriorityBatch: triage flagged ${flaggedFromTriage.length}/${emailsNeedingTriage.length} existing + ${emailsWithoutAnalysis.length} new = ${emailsToAnalyse.length}/${emails.length} total for reanalysis`,
        );
        return emailsToAnalyse;
      }
      this.logger.warn(
        "analyzePriorityBatch: triage parse failed — reanalysing all emails",
      );
    } catch (error) {
      this.logger.error(
        `analyzePriorityBatch: Triage LLM call failed for ${emailsNeedingTriage.length} emails — reanalysing all`,
        error,
      );
    }
    return emails;
  }

  /**
   * Phase 2 — Individual analysis: run the full two-step shortlist → smart-prompt pipeline
   * for each email in `emailsToAnalyse` and store results in `results`.
   */
  private async runIndividualAnalysisPhase(
    emailsToAnalyse: BatchEmailInput[],
    userContext: UserContextInput | undefined,
    provider: LLMProvider | undefined,
    userId: string | undefined,
    results: Map<string, BatchPriorityResult>,
  ): Promise<void> {
    for (const batchEmail of emailsToAnalyse) {
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
        this.logger.error(
          `analyzePriorityBatch: Individual analysis failed for email key "${batchEmail.emailKey}"`,
          individualError,
        );
      }
    }
  }

  /**
   * Analyze priority for a batch of emails using a two-phase approach:
   *
   * Phase 1 — Triage (cheap model): run `batch-priority-triage.md` to flag which emails
   *   need a fresh category/priority analysis (`needsReanalysis: true`).
   *
   * Phase 2 — Individual analysis: for each flagged email, run the full two-step pipeline:
   *   Step 1 (shortlist) → Step 2 (smart prompt with shortlisted candidates).
   *
   * Emails NOT flagged by triage return `isFallback: false` with `triagePreserved: true` so the
   * caller (applyBatchResults) skips the DB write and preserves the existing priority scores.
   *
   * If the triage LLM call fails, falls back to analysing all emails individually.
   */
  async analyzePriorityBatch(
    emails: BatchEmailInput[],
    userContext?: UserContextInput,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Map<string, BatchPriorityResult>> {
    const results = new Map<string, BatchPriorityResult>();
    if (emails.length === 0) return results;

    const emailsNeedingTriage = emails.filter(
      (email) =>
        email.existingCategory !== undefined ||
        email.existingUrgencyScore !== undefined,
    );
    const emailsWithoutAnalysis = emails.filter(
      (email) =>
        email.existingCategory === undefined &&
        email.existingUrgencyScore === undefined,
    );

    const emailsToAnalyse = await this.runTriagePhase(
      emails,
      emailsNeedingTriage,
      emailsWithoutAnalysis,
      results,
      userId,
    );

    await this.runIndividualAnalysisPhase(
      emailsToAnalyse,
      userContext,
      provider,
      userId,
      results,
    );

    this.fillFallbackEntries(results, emails);
    return results;
  }
}
