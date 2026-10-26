import {
  AiDecisionProvider,
  JEV_DECISION_PROVIDER,
} from "../constants/ai-decision-provider.constants";
import { JEV } from "../constants/jev.constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import type { LoggerPort } from "../shared/email-intelligence/ports";
import {
  buildProtoSuggestionFromResponse,
  hasCategoryNumber,
  resolveResponseCategory,
  rewriteCategoryNumberReferences,
} from "../utils/category-number.util";
import { getErrorMessage } from "../utils/error-message.util";
import type { JevDeclinedPick } from "./jev-category-client";
import { suggestProtoCategory } from "./jev-category-enrichment";
import { logJevShadowAgreement } from "./jev-confidence-log";
import { LLMProvider, type LLMRequest } from "./llm.types";
import { LLM_OP_CATEGORISE_SUMMARY } from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

/** The null-category bucket name the category prompt returns for number 0. */
export const OTHER_CATEGORY_NAME = JEV.OTHER_CATEGORY;

export interface CategoriseFromSummaryParams {
  subject: string;
  senderName?: string | null;
  /** Sender address, so the prompt can judge platform identity (bots, noreply). */
  senderEmail?: string | null;
  summary: string;
  categories: Array<{ name: string; description?: string | null }>;
  /**
   * Compact, authoritative "GitHub facts" line for the PR/issue the email is
   * about (see `formatGithubFactsForPrompt`). Omitted for non-GitHub mail, in
   * which case the prompt renders no facts block at all.
   */
  githubFacts?: string | null;
  userId?: string;
  /**
   * Stronger Gemini model to re-run the call on when the primary verdict is
   * "Other" or LOW confidence. Omit to accept the primary verdict as-is.
   */
  escalationModel?: string;
}

export interface ProtoCategorySuggestion {
  name: string;
  description: string;
  reasoning?: string;
}

export interface CategoriseFromSummaryResult {
  /** 1-based number the LLM chose (0 = Other), null when unparseable. */
  categoryNumber: number | null;
  /** Resolved category name ("Other" when the number was 0 / invalid). */
  categoryName: string;
  categoryConfidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string | null;
  /** Proposed new category, only when the pick was "Other". */
  protoCategorySuggestion?: ProtoCategorySuggestion;
  /** Engine that made the pick (Jev or the LLM that answered); null when unknown. */
  decisionProvider?: AiDecisionProvider | null;
}

type GenerateText = (request: {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  userId?: string;
}) => Promise<string>;

function normaliseConfidence(raw: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const value = String(raw ?? "").toUpperCase();
  return value === "HIGH" || value === "LOW" ? value : "MEDIUM";
}

/**
 * Lightweight, category-ONLY re-categorisation of a thread from its updated
 * summary — used by the incremental analysis path after a new email is
 * summarised, instead of re-running the full priority+category flow. The LLM
 * reports its pick as BOTH a numbered category and the exact name (0 / "Other"
 * = no fit), and resolveResponseCategory reconciles them: an exact `categoryName`
 * match wins over `categoryNumber`, since a weak model reliably names the
 * category its reasoning is about but frequently mis-counts its position in the
 * list (see server/src/utils/category-number.util.ts). Matching is always exact
 * (no fuzzy/prefix) — a fabricated name falls back to the number rather than
 * mis-routing. Returns null on empty input, a missing prompt, or an LLM/parse
 * failure so the caller leaves the existing category untouched.
 */
export async function categoriseFromSummary(
  generateText: GenerateText,
  logger: LoggerPort,
  params: CategoriseFromSummaryParams,
): Promise<CategoriseFromSummaryResult | null> {
  const { subject, senderName, senderEmail, summary, categories, userId } =
    params;
  if (!summary?.trim() || categories.length === 0) {
    return null;
  }

  const promptConfig = getPrompt(UTILITY_PROMPT_IDS.CATEGORISE_SUMMARY);
  if (!promptConfig) {
    logger.error(
      "[CATEGORISE-SUMMARY] ERROR: categorise_summary prompt not found",
    );
    return null;
  }

  const orderedNames = categories.map((category) => category.name);
  const numberedCategories = categories
    .map(
      (category, index) =>
        `${index + 1}. ${category.name}${
          category.description ? ` — ${category.description}` : ""
        }`,
    )
    .join("\n");

  const renderVars = {
    subject: subject || "",
    senderName: senderName || "",
    senderEmail: senderEmail || "",
    summary,
    categories: numberedCategories,
    githubFacts: params.githubFacts || "",
    // Category-only classification always wants the GitHub ruleset (QA
    // pass/fail, bot-vs-human etc.); unlike the priority prompt it does not
    // gate it on sender, so the shared {% if showGithubRules %} always resolves
    // true here. The systemPrompt (which carries the injected shared rules) is
    // rendered too so that conditional is evaluated rather than sent literally.
    showGithubRules: true,
  };
  const prompt = renderPrompt(promptConfig.prompt || "", renderVars);
  const systemPrompt = renderPrompt(
    promptConfig.systemPrompt || "",
    renderVars,
  );

  try {
    const response = await generateText({
      prompt,
      systemPrompt,
      temperature: RATIOS.THIRTY_PERCENT,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
      jsonMode: true,
      userId,
    });

    const cleaned = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[CATEGORISE-SUMMARY] No JSON object in response");
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const result = (
      parsed.result && typeof parsed.result === "object"
        ? parsed.result
        : parsed
    ) as Record<string, unknown>;

    const rawNumber = result.categoryNumber;
    const rawName =
      typeof result.categoryName === "string" ? result.categoryName : undefined;
    const categoryName = resolveResponseCategory(
      {
        categoryNumber: rawNumber,
        categoryName: rawName,
        // Legacy response shape: a bare `category` name with no number.
        category:
          typeof result.category === "string" ? result.category : undefined,
      },
      orderedNames,
    );
    return {
      categoryNumber: hasCategoryNumber(rawNumber) ? Number(rawNumber) : null,
      categoryName,
      categoryConfidence: normaliseConfidence(result.categoryConfidence),
      protoCategorySuggestion: buildProtoSuggestionFromResponse(
        result as Parameters<typeof buildProtoSuggestionFromResponse>[0],
        categoryName,
        orderedNames,
      ),
      // Rewrite positional "category N" references to real names — the user
      // never sees the numbered list the model picked from.
      reasoning:
        typeof result.reasoning === "string"
          ? rewriteCategoryNumberReferences(result.reasoning, orderedNames)
          : null,
    };
  } catch (error) {
    logger.error(`[CATEGORISE-SUMMARY] ERROR: ${getErrorMessage(error)}`);
    return null;
  }
}

/** The LLM access the categoriser needs; LLMCoreService and the Lambda's client both fit. */
export interface CategoryModelClient {
  generateText(
    request: LLMRequest,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string>;
  /** Jev-first selection; absent where Jev isn't configured. */
  categoriseWithJev?(
    params: CategoriseFromSummaryParams,
    onDeclined?: (pick: JevDeclinedPick) => void,
  ): Promise<CategoriseFromSummaryResult | null>;
}

export const CATEGORY_FALLBACK_PROVIDER = LLMProvider.GEMINI;

/** Selects a category; new-category generation is a separate enrichment step. */
export async function categoriseOnlyWithEscalation(
  llmCoreService: CategoryModelClient,
  logger: LoggerPort,
  params: CategoriseFromSummaryParams,
): Promise<CategoriseFromSummaryResult | null> {
  if (!params.summary?.trim() || !params.categories.length) return null;
  let declinedPick: JevDeclinedPick | null = null;
  try {
    const jev = await llmCoreService.categoriseWithJev?.(params, (pick) => {
      declinedPick = pick;
    });
    if (jev) return { ...jev, decisionProvider: JEV_DECISION_PROVIDER };
  } catch {
    logger.warn("Jev categorisation failed; falling back to Gemini");
  }
  const chosen = await categoriseWithGemini(llmCoreService, logger, params);
  logShadowAgreement(logger, declinedPick, chosen);
  return chosen;
}

/** Content-free record of whether Gemini agreed with the pick Jev was not trusted with. */
function logShadowAgreement(
  logger: LoggerPort,
  declinedPick: JevDeclinedPick | null,
  chosen: CategoriseFromSummaryResult | null,
): void {
  if (!declinedPick || !chosen) return;
  logJevShadowAgreement(logger, {
    decision: LLM_OP_CATEGORISE_SUMMARY,
    confidence: declinedPick.confidence,
    agreed: declinedPick.categoryName === chosen.categoryName,
  });
}

/** Gemini Flash Lite, escalating to the stronger model on Other / LOW confidence. */
async function categoriseWithGemini(
  llmCoreService: CategoryModelClient,
  logger: LoggerPort,
  params: CategoriseFromSummaryParams,
): Promise<CategoriseFromSummaryResult | null> {
  const runWith = async (provider: LLMProvider, model?: string) => {
    let answeredBy: AiDecisionProvider | null = null;
    const result = await categoriseFromSummary(
      (request) =>
        llmCoreService.generateText(
          {
            ...request,
            operation: LLM_OP_CATEGORISE_SUMMARY,
            model,
            onProviderResolved: (resolved) => {
              answeredBy = resolved;
            },
          },
          provider,
          params.userId,
        ),
      logger,
      params,
    );
    return result && { ...result, decisionProvider: answeredBy };
  };

  const primary = await runWith(CATEGORY_FALLBACK_PROVIDER);
  const needsEscalation =
    !primary ||
    primary.categoryName === OTHER_CATEGORY_NAME ||
    primary.categoryConfidence === "LOW";
  if (!needsEscalation || !params.escalationModel) {
    return primary;
  }

  const escalated = await runWith(
    CATEGORY_FALLBACK_PROVIDER,
    params.escalationModel,
  );
  if (!escalated) {
    return primary;
  }
  logger.log(
    `[categorise-summary] escalated to ${params.escalationModel} (flash-lite: ${
      primary
        ? `${primary.categoryName}/${primary.categoryConfidence}`
        : "failed"
    }) → "${escalated.categoryName}"`,
  );
  return escalated;
}

export async function categoriseWithEscalation(
  client: CategoryModelClient,
  logger: LoggerPort,
  params: CategoriseFromSummaryParams,
): Promise<CategoriseFromSummaryResult | null> {
  const result = await categoriseOnlyWithEscalation(client, logger, params);
  if (
    !result ||
    result.categoryName !== OTHER_CATEGORY_NAME ||
    result.protoCategorySuggestion
  )
    return result;
  const suggestion = await suggestProtoCategory(client, logger, params);
  return suggestion
    ? { ...result, protoCategorySuggestion: suggestion }
    : result;
}
