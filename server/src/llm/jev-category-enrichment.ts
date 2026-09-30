import type { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { rewriteCategoryNumberReferences } from "../utils/category-number.util";
import { LLMProvider } from "./llm.types";
import type {
  CategoriseFromSummaryParams,
  CategoryModelClient,
  ProtoCategorySuggestion,
} from "./llm-categorise-summary";
import { LLM_OP_SUGGEST_PROTO_CATEGORY } from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function suggestProtoCategory(
  client: CategoryModelClient,
  logger: Pick<Logger, "warn">,
  params: CategoriseFromSummaryParams,
): Promise<ProtoCategorySuggestion | undefined> {
  const config = getPrompt(UTILITY_PROMPT_IDS.SUGGEST_PROTO_CATEGORY);
  if (!config) return undefined;
  try {
    const response = await client.generateText(
      {
        prompt: renderPrompt(config.prompt, {
          ...params,
          categories: params.categories
            .map(
              (category, index) =>
                `${index + 1}. ${category.name}${category.description ? ` — ${category.description}` : ""}`,
            )
            .join("\n"),
        }),
        systemPrompt: config.systemPrompt,
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId: params.userId,
        operation: LLM_OP_SUGGEST_PROTO_CATEGORY,
      },
      LLMProvider.GEMINI,
      params.userId,
    );
    const parsed: unknown = JSON.parse(
      response
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, ""),
    );
    if (!isRecord(parsed)) return undefined;
    const result = isRecord(parsed.result) ? parsed.result : parsed;
    const suggestion = result.protoCategorySuggestion;
    if (
      !isRecord(suggestion) ||
      typeof suggestion.name !== "string" ||
      !suggestion.name.trim() ||
      typeof suggestion.description !== "string" ||
      !suggestion.description.trim() ||
      typeof suggestion.reasoning !== "string" ||
      !suggestion.reasoning.trim()
    )
      return undefined;
    return {
      name: suggestion.name,
      description: suggestion.description,
      reasoning: rewriteCategoryNumberReferences(
        suggestion.reasoning,
        params.categories.map((category) => category.name),
      ),
    };
  } catch {
    logger.warn(
      "New-category suggestion unavailable; preserving Other verdict",
    );
    return undefined;
  }
}
