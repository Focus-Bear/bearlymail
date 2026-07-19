import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import {
  BODY_PREVIEW_LENGTHS,
  PRIORITY_ANALYSIS_FALLBACK,
  TRIAGE_PRESERVED_CATEGORY,
  TRIAGE_PRESERVED_EXPLANATIONS,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import type { CategoryDecisionAnalyzedEmail } from "../emails/category-decision-trace.types";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";
import { resolveLlmCategoryToDisplayName } from "../utils/category-key.util";
import {
  hasCategoryNumber,
  resolveResponseCategory,
  rewriteCategoryNumberReferences,
} from "../utils/category-number.util";
import { formatDateTimeForPrompt } from "../utils/timezone.utils";
import {
  CategoryItem,
  CategoryShortlistService,
  ShortlistCandidate,
} from "./category-shortlist.service";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_ANALYZE_PRIORITY,
  LLM_OP_BATCH_PRIORITY_TRIAGE,
} from "./llm-operations";
import {
  buildUserContextTexts,
  UserContextInput,
} from "./priority-context-texts.helper";
import { getPrompt, PRIORITY_PROMPT_IDS, renderPrompt } from "./prompts";

// Batch triage runs on cheap, high-volume Amazon Nova Micro (Bedrock) — the
// same model as summarisation. Override with CATEGORY_TRIAGE_MODEL.
const DEFAULT_TRIAGE_MODEL = "amazon.nova-micro-v1:0";

// Built-in fallback categories used when the user has none yet. MUST stay in
// the same order as the {% else %} default list in prioritise-email.md so the
// LLM's categoryNumber maps to the same category the prompt numbered.
const DEFAULT_CATEGORY_NAMES = [
  "Newsletters",
  "Sales",
  "Partnerships",
  "Customer Support",
  "HR Admin",
];

export type CategoryConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Category-resolution instrumentation captured per email and attached to the result. */
type CategoryInstrumentation = {
  shortlistedCategoryNames: string[] | null;
  shortlistCandidates: ShortlistCandidate[] | null;
  totalCategoryCount: number;
  protoCategoryCount: number;
};

type PriorityResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number | undefined;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  /** Confidence level the LLM assigned to its category decision. */
  categoryConfidence?: CategoryConfidence;
  /** Raw 1-based categoryNumber the LLM returned (0 = Other), before index resolution. Null when the model returned a name instead. Instrumentation only. */
  categoryNumber?: number | null;
  reasoning: string;
  protoCategorySuggestion?: { name: string; description: string };
  /** Category names that were shortlisted and passed to the smart model. Null when shortlisting was skipped (category count below threshold). */
  shortlistedCategoryNames: string[] | null;
  /** Per-candidate shortlist provenance (embedding score + platform-pinned flag), for instrumentation. Null when shortlisting was skipped. */
  shortlistCandidates?: ShortlistCandidate[] | null;
  /** Total categories (real + proto) the user had at decision time. Instrumentation only. */
  totalCategoryCount?: number;
  /** Proto categories the user had at decision time. Instrumentation only. */
  protoCategoryCount?: number;
  /**
   * Snapshot of the deterministic-rule step, attached by the single-email
   * refiner after analysis so it can be persisted for the category-debug view.
   * Not produced by `analyzePriority` itself.
   */
  categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
  /** What content the LLM saw (AI summary vs cleaned body); attached by the single-email refiner, not by `analyzePriority`. */
  analyzedContentSource?: CategoryDecisionAnalyzedEmail["contentSource"];
};

export type BatchPriorityResult = PriorityResult & {
  isFallback: boolean;
  /** True when triage determined no reanalysis is needed (preserve existing scores). False for LLM analysis failures. */
  triagePreserved?: boolean;
};

function buildThreadInfoText(threadInfo?: {
  daysSinceLastReply?: number;
  userShouldReply?: boolean;
  lastReplyFrom?: string;
}): string {
  if (!threadInfo) return "";
  return `\nThread Information:\n${
    threadInfo.daysSinceLastReply !== undefined
      ? `- Days since last reply: ${threadInfo.daysSinceLastReply}`
      : ""
  }${
    threadInfo.userShouldReply !== undefined
      ? `\n- User should reply: ${threadInfo.userShouldReply ? "Yes" : "No"}`
      : ""
  }${threadInfo.lastReplyFrom ? `\n- Last reply from: ${threadInfo.lastReplyFrom}` : ""}`;
}

type BatchEmailInput = {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  receivedAt?: Date;
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

  /**
   * Runs the two-step category shortlisting logic and returns the effective category list
   * plus the shortlisted names for debug storage. When shortlisting is skipped (category
   * count below the threshold) `shortlistedCategoryNames` is null.
   */
  private async resolveEffectiveCategories(
    email: { from: string; fromName?: string; subject: string },
    userContext: UserContextInput | undefined,
    cleanedBody: string,
  ): Promise<{
    effectiveCategories: CategoryItem[];
    instrumentation: CategoryInstrumentation;
  }> {
    const realCategories = userContext?.emailCategories ?? [];
    const protoCategories = userContext?.protoCategories ?? [];
    const allCategories = [...realCategories, ...protoCategories];
    const counts = {
      totalCategoryCount: allCategories.length,
      protoCategoryCount: protoCategories.length,
    };
    if (
      !this.categoryShortlistService.isShortlistEnabled(allCategories.length)
    ) {
      return {
        effectiveCategories: allCategories,
        instrumentation: {
          shortlistedCategoryNames: null,
          shortlistCandidates: null,
          ...counts,
        },
      };
    }
    const { effective, candidates } =
      await this.categoryShortlistService.getShortlistWithMeta(
        {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          summary: cleanedBody,
        },
        allCategories,
      );
    return {
      effectiveCategories: effective,
      instrumentation: {
        shortlistedCategoryNames: effective.map((cat) => cat.name),
        shortlistCandidates: candidates,
        ...counts,
      },
    };
  }

  /**
   * Build the priority prompt for a single email.
   * Loads the prompt template, formats user context and thread info, and renders the prompt string.
   * When the category shortlist feature is enabled and category count exceeds the threshold,
   * a cheap model pre-filters the category list to the top-N most relevant candidates.
   */
  private async buildPriorityPrompt(options: {
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
      receivedAt?: Date;
    };
    userHistory?: { averageTimeToReply?: number };
    userContext?: UserContextInput;
    threadInfo?: {
      daysSinceLastReply?: number;
      userShouldReply?: boolean;
      lastReplyFrom?: string;
    };
    userId?: string;
    userTimezone?: string;
  }): Promise<{
    prompt: string;
    systemPrompt: string;
    orderedCategoryNames: string[];
    instrumentation: CategoryInstrumentation;
  }> {
    const {
      email,
      userHistory,
      userContext,
      threadInfo,
      userId,
      userTimezone,
    } = options;
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

    // Date AND time (in the user's timezone) so the model can score deadline
    // proximity correctly — e.g. an event cancellation received at 10:44 PM the
    // night before the event is time-critical, not "reschedule whenever".
    const currentDateStr = formatDateTimeForPrompt(new Date(), userTimezone);
    const receivedAtStr = email.receivedAt
      ? formatDateTimeForPrompt(email.receivedAt, userTimezone)
      : "";

    const { effectiveCategories, instrumentation } =
      await this.resolveEffectiveCategories(email, userContext, cleanedBody);

    // The exact order the categories are numbered in the prompt — used to map
    // the LLM's categoryNumber back to a category. Falls back to the prompt's
    // built-in default list when the user has no categories yet.
    const orderedCategoryNames =
      effectiveCategories.length > 0
        ? effectiveCategories.map((cat) => cat.name)
        : DEFAULT_CATEGORY_NAMES;

    const effectiveUserContext: UserContextInput | undefined = userContext
      ? {
          ...userContext,
          emailCategories: effectiveCategories,
          protoCategories: [],
        }
      : userContext;

    const contextTexts = buildUserContextTexts(effectiveUserContext);

    const prompt = renderPrompt(promptConfig.prompt, {
      from: email.fromName || email.from,
      fromName: email.fromName || email.from,
      senderJobTitle: email.senderJobTitle || "",
      subject: email.subject,
      body: cleanedBody,
      averageTimeToReply: userHistory?.averageTimeToReply,
      currentDate: currentDateStr,
      receivedAt: receivedAtStr,
      urgentContext: contextTexts.urgentContextText,
      notUrgentContext: contextTexts.notUrgentContextText,
      goalsContext: contextTexts.goalsContextText,
      workingOnContext: contextTexts.workingOnContextText,
      dontCareContext: contextTexts.dontCareContextText,
      emailCategories: contextTexts.emailCategoriesText,
      threadInfo: buildThreadInfoText(threadInfo),
    });

    return {
      prompt,
      systemPrompt: promptConfig.systemPrompt || "",
      orderedCategoryNames,
      instrumentation,
    };
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
    userId: string | undefined,
    orderedCategoryNames: string[] = [],
  ): PriorityResult | null {
    const responsePreview = response.substring(
      0,
      QUERY_LIMITS.LLM_RESPONSE_PREVIEW_LENGTH,
    );
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
    // Primary path: the LLM returns a categoryNumber (1-based index into the
    // numbered list, 0 = Other), resolved by exact array index — no name/fuzzy
    // matching. Falls back to a returned `category` name only when no number is
    // present (defensive; e.g. an older response shape).
    const category = resolveResponseCategory(
      analysisResult,
      orderedCategoryNames,
    );

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
      // Mirror resolveResponseCategory's tolerance for stringified numbers so
      // the logged instrumentation matches what actually resolved the category.
      categoryNumber: hasCategoryNumber(analysisResult.categoryNumber)
        ? Number(analysisResult.categoryNumber)
        : null,
      // The prompt bans positional refs, but models still write "category 1" —
      // rewrite to real names since the user never sees the numbered list.
      categoryExplanation: rewriteCategoryNumberReferences(
        analysisResult.categoryExplanation ||
          "No category explanation provided",
        orderedCategoryNames,
      ),
      categoryConfidence:
        analysisResult.categoryConfidence === "HIGH" ||
        analysisResult.categoryConfidence === "MEDIUM" ||
        analysisResult.categoryConfidence === "LOW"
          ? (analysisResult.categoryConfidence as CategoryConfidence)
          : undefined,
      reasoning: rewriteCategoryNumberReferences(
        analysisResult.reasoning || "No reasoning provided",
        orderedCategoryNames,
      ),
      protoCategorySuggestion:
        category === "Other" && analysisResult.protoCategorySuggestion
          ? {
              name: analysisResult.protoCategorySuggestion.name || "",
              description:
                analysisResult.protoCategorySuggestion.description || "",
            }
          : undefined,
      // Placeholder — overridden by analyzePriority after buildPriorityPrompt runs the shortlist
      shortlistedCategoryNames: null,
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
      shortlistedCategoryNames: null,
    };
  }

  async analyzePriority(options: {
    email: {
      from: string;
      fromName?: string;
      senderJobTitle?: string;
      subject: string;
      body: string;
      receivedAt?: Date;
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
    /** IANA timezone used to render current/received times in the prompt. Falls back to UTC. */
    userTimezone?: string;
  }): Promise<PriorityResult> {
    const {
      email,
      userHistory,
      provider,
      userId,
      userContext,
      threadInfo,
      preComputedSentimentScore,
      userTimezone,
    } = options;
    const { prompt, systemPrompt, orderedCategoryNames, instrumentation } =
      await this.buildPriorityPrompt({
        email,
        userHistory,
        userContext,
        threadInfo,
        userId,
        userTimezone,
      });

    const response = await this.llmCoreService.generateText(
      {
        prompt,
        systemPrompt,
        temperature: RATIOS.ZERO,
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
        userId,
        orderedCategoryNames,
      );
      if (parsed) {
        return {
          ...this.applyCategoryKeyResolution(parsed, userContext),
          ...instrumentation,
        };
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

    return {
      ...this.buildFallbackPriorityResult(response, preComputedSentimentScore),
      ...instrumentation,
    };
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
          shortlistedCategoryNames: null,
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
      // Triage runs on the cheap/fast Nova Micro (Bedrock) path in the cloud,
      // but a local (claude-cli) install has no Bedrock access — use the
      // configured default there instead of forcing Bedrock.
      const useClaudeCli =
        this.llmCoreService.getDefaultProvider() === LLMProvider.CLAUDE_CLI;
      const triageProvider = useClaudeCli
        ? LLMProvider.CLAUDE_CLI
        : LLMProvider.BEDROCK;
      // claude-cli resolves its own model, so leave it unset there (a Nova model
      // id would be meaningless to it); the Bedrock path uses Nova Micro.
      const configuredTriageModel =
        this.configService.get<string>("CATEGORY_TRIAGE_MODEL");
      const triageModel = useClaudeCli
        ? configuredTriageModel
        : (configuredTriageModel ?? DEFAULT_TRIAGE_MODEL);
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
          model: triageModel,
        },
        triageProvider,
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
              shortlistedCategoryNames: null,
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
    results: Map<string, BatchPriorityResult>,
    opts: {
      userContext?: UserContextInput;
      provider?: LLMProvider;
      userId?: string;
      userTimezone?: string;
    },
  ): Promise<void> {
    const { userContext, provider, userId, userTimezone } = opts;
    for (const batchEmail of emailsToAnalyse) {
      try {
        const individualResult = await this.analyzePriority({
          email: {
            from: batchEmail.from,
            fromName: batchEmail.fromName,
            senderJobTitle: batchEmail.senderJobTitle,
            subject: batchEmail.subject,
            body: batchEmail.body,
            receivedAt: batchEmail.receivedAt,
          },
          userContext,
          provider,
          userId,
          preComputedSentimentScore: batchEmail.preComputedSentimentScore,
          userTimezone,
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
    userTimezone?: string,
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

    await this.runIndividualAnalysisPhase(emailsToAnalyse, results, {
      userContext,
      provider,
      userId,
      userTimezone,
    });

    this.fillFallbackEntries(results, emails);
    return results;
  }
}
