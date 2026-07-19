import type { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import {
  hasCategoryNumber,
  resolveCategoryNumber,
  rewriteCategoryNumberReferences,
} from "../utils/category-number.util";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

export interface CategoriseFromSummaryParams {
  subject: string;
  senderName?: string | null;
  summary: string;
  categories: Array<{ name: string; description?: string | null }>;
  userId?: string;
}

export interface CategoriseFromSummaryResult {
  /** 1-based number the LLM chose (0 = Other), null when unparseable. */
  categoryNumber: number | null;
  /** Resolved category name ("Other" when the number was 0 / invalid). */
  categoryName: string;
  categoryConfidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string | null;
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
 * picks a numbered category (0 = Other) so resolution is an exact index (no
 * name/emoji/fuzzy matching, per the #2505 numbering approach). Returns null on
 * empty input, a missing prompt, or an LLM/parse failure so the caller leaves
 * the existing category untouched.
 */
export async function categoriseFromSummary(
  generateText: GenerateText,
  logger: Logger,
  params: CategoriseFromSummaryParams,
): Promise<CategoriseFromSummaryResult | null> {
  const { subject, senderName, summary, categories, userId } = params;
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

  const prompt = renderPrompt(promptConfig.prompt || "", {
    subject: subject || "",
    senderName: senderName || "",
    summary,
    categories: numberedCategories,
  });

  try {
    const response = await generateText({
      prompt,
      systemPrompt: promptConfig.systemPrompt || "",
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
    return {
      categoryNumber: hasCategoryNumber(rawNumber) ? Number(rawNumber) : null,
      categoryName: resolveCategoryNumber(rawNumber, orderedNames),
      categoryConfidence: normaliseConfidence(result.categoryConfidence),
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
