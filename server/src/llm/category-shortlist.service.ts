import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CATEGORY_SHORTLIST } from "../constants/llm-constants";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { LLM_OP_CATEGORY_SHORTLIST } from "./llm-operations";
import { getPrompt, renderPrompt } from "./prompts";

/** Prompt key for the category shortlist prompt file. */
export const CATEGORY_SHORTLIST_PROMPT_ID = "category_shortlist";

/** Default number of categories to shortlist. */
const DEFAULT_TOP_N = 10;

/** Minimum category count before shortlisting is worth running. */
const SHORTLIST_THRESHOLD = 12;

/** Default model for shortlist classification. Override via CATEGORY_SHORTLIST_MODEL env var. */
const DEFAULT_SHORTLIST_MODEL = "gpt-5.4-nano";

type CategoryItem = { name: string; description?: string };

/**
 * CategoryShortlistService — Step 1 of the two-step category analysis.
 *
 * Uses a cheap/fast model (gpt-5.4-nano by default) to pre-filter the full
 * category list down to the top-N most relevant candidates. The smart model
 * in Step 2 (PriorityAnalysisService) then only needs to reason over a short
 * list, reducing token usage by 18–33% for power users.
 *
 * The shortlist takes an email SUMMARY (not the raw body) and returns a JSON
 * object `{ "categories": [...] }` — NOT a bare array. "Other" is deliberately
 * excluded from the shortlist; the smart model decides if "Other" applies.
 *
 * Always active when the category count exceeds the threshold.
 * Falls back to the full list if the shortlist call fails.
 *
 * Model defaults to gpt-5.4-nano. Override via CATEGORY_SHORTLIST_MODEL env var.
 */
@Injectable()
export class CategoryShortlistService {
  private readonly logger = new Logger(CategoryShortlistService.name);

  constructor(
    private readonly llmCoreService: LLMCoreService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Returns true when shortlisting should be applied:
   * - The total number of categories exceeds the threshold.
   */
  isShortlistEnabled(totalCategoryCount: number): boolean {
    return totalCategoryCount > SHORTLIST_THRESHOLD;
  }

  /**
   * Return the top-N most relevant categories for a given email.
   *
   * Takes the email SUMMARY (pre-computed by the caller) rather than the raw
   * body — the shortlist is a cheap pre-filter that doesn't need full content.
   *
   * Returns a filtered list WITHOUT "Other". The smart model in Step 2 decides
   * whether "Other" is the right choice if none of the shortlisted categories fit.
   *
   * Falls back to `allCategories` if the LLM call fails.
   */
  async getShortlist(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      summary: string;
    },
    allCategories: CategoryItem[],
    topN: number = DEFAULT_TOP_N,
  ): Promise<CategoryItem[]> {
    if (allCategories.length === 0) {
      return allCategories;
    }

    const promptConfig = getPrompt(CATEGORY_SHORTLIST_PROMPT_ID);
    if (!promptConfig) {
      this.logger.warn(
        "category_shortlist prompt not found — falling back to full category list",
      );
      return allCategories;
    }

    // Exclude "Other" from the shortlist input — the smart model handles that
    const shortlistableCategories = allCategories.filter(
      (cat) => cat.name.toLowerCase() !== "other",
    );

    const categoryListText = shortlistableCategories
      .map((cat) =>
        cat.description ? `- ${cat.name}: ${cat.description}` : `- ${cat.name}`,
      )
      .join("\n");

    const prompt = renderPrompt(promptConfig.prompt, {
      topN: String(topN),
      categories: categoryListText,
      fromName: email.fromName || email.from,
      subject: email.subject,
      summary: email.summary,
    });

    const model =
      this.configService.get<string>("CATEGORY_SHORTLIST_MODEL") ??
      DEFAULT_SHORTLIST_MODEL;

    try {
      const response = await this.llmCoreService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0,
          maxTokens: CATEGORY_SHORTLIST.MAX_TOKENS,
          operation: LLM_OP_CATEGORY_SHORTLIST,
          jsonMode: true,
          model,
        },
        LLMProvider.OPENAI,
      );

      return this.parseShortlistResponse(response, allCategories);
    } catch (error) {
      this.logger.error(
        "CategoryShortlistService: shortlist LLM call failed — falling back to full category list",
        error,
      );
      return allCategories;
    }
  }

  /**
   * Parse the LLM shortlist response into a filtered CategoryItem array.
   *
   * - Accepts a JSON object `{ "categories": [...] }` (or falls back to bare array for resilience).
   * - Filters to names that actually exist in allCategories (case-insensitive).
   * - Does NOT append "Other" — the smart model (Step 2) decides if "Other" applies.
   * - Falls back to allCategories on parse errors.
   */
  private parseShortlistResponse(
    response: string,
    allCategories: CategoryItem[],
  ): CategoryItem[] {
    try {
      // Try to parse as JSON object first (preferred: { "categories": [...] })
      let names: unknown[] | null = null;

      const objMatch = response.match(/\{[\s\S]*\}/);
      if (objMatch) {
        const parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
        if (
          parsed &&
          typeof parsed === "object" &&
          "categories" in parsed &&
          Array.isArray(parsed["categories"])
        ) {
          names = parsed["categories"] as unknown[];
        }
      }

      // Resilience fallback: accept bare array if no object found
      if (!names) {
        const arrayMatch = response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          const parsed: unknown = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            names = parsed;
          }
        }
      }

      if (!names) {
        this.logger.warn(
          "CategoryShortlistService: no JSON object or array found in shortlist response — using full list",
        );
        return allCategories;
      }

      // Build a lookup map for fast case-insensitive matching
      // Exclude "Other" from the shortlist — the smart model handles that
      const categoryByNameLower = new Map<string, CategoryItem>(
        allCategories
          .filter((cat) => cat.name.toLowerCase() !== "other")
          .map((cat) => [cat.name.toLowerCase(), cat] as const),
      );

      const shortlisted: CategoryItem[] = [];
      for (const name of names) {
        if (typeof name !== "string") continue;
        const found = categoryByNameLower.get(name.toLowerCase());
        if (found) {
          shortlisted.push(found);
        }
      }

      if (shortlisted.length === 0) {
        this.logger.warn(
          "CategoryShortlistService: shortlist returned no matching categories — using full list",
        );
        return allCategories;
      }

      // Do NOT append "Other" — the smart model (Step 2) decides if "Other" applies.
      return shortlisted;
    } catch (error) {
      this.logger.error(
        "CategoryShortlistService: failed to parse shortlist response — using full list",
        error,
      );
      return allCategories;
    }
  }
}
