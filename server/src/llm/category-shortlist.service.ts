import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CATEGORY_RESERVED_NAMES } from "../constants/domain-types";
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

/**
 * Platform keyword pinning: when the sender's email domain matches a known
 * platform, all categories containing that platform's keyword are pinned into
 * the shortlist regardless of what the cheap shortlist model selected.
 *
 * This prevents GitHub emails from being labelled "Other" (and triggering a
 * redundant "Github and Code" proto-category) simply because the shortlist
 * model failed to surface the user's existing GitHub-specific categories.
 */
export const PLATFORM_PINNING: Array<{
  domainPatterns: string[];
  categoryKeywords: string[];
}> = [
  { domainPatterns: ["github.com", "github.io"], categoryKeywords: ["github"] },
  {
    domainPatterns: ["gitlab.com", "gitlab.io"],
    categoryKeywords: ["gitlab"],
  },
  {
    domainPatterns: ["atlassian.net", "atlassian.com"],
    categoryKeywords: ["jira", "atlassian", "confluence"],
  },
  {
    domainPatterns: ["linear.app"],
    categoryKeywords: ["linear"],
  },
  {
    domainPatterns: ["slack.com"],
    categoryKeywords: ["slack"],
  },
  {
    domainPatterns: ["notion.so", "notion.com"],
    categoryKeywords: ["notion"],
  },
  {
    domainPatterns: ["figma.com"],
    categoryKeywords: ["figma"],
  },
  {
    domainPatterns: ["sentry.io"],
    categoryKeywords: ["sentry"],
  },
  {
    domainPatterns: ["pagerduty.com"],
    categoryKeywords: ["pagerduty"],
  },
  {
    domainPatterns: ["datadog.com"],
    categoryKeywords: ["datadog"],
  },
];

export type CategoryItem = {
  name: string;
  description?: string;
  /** Stable id for LLM output (DB slug or synthetic proto id). */
  categoryKey?: string;
};

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
   * Returns platform keywords to pin when the sender's email matches a known
   * platform domain. Returns an empty array for unrecognised senders.
   */
  getPlatformKeywordsForSender(fromEmail: string): string[] {
    const lower = fromEmail.toLowerCase();
    const domain = lower.split("@")[1];
    if (!domain) return [];

    for (const entry of PLATFORM_PINNING) {
      if (
        entry.domainPatterns.some(
          (pattern) => domain === pattern || domain.endsWith("." + pattern),
        )
      ) {
        return entry.categoryKeywords;
      }
    }
    return [];
  }

  /**
   * Appends any platform-specific categories that the LLM shortlist omitted.
   * Called after parsing the LLM response so that GitHub/Jira/etc. categories
   * are always visible to the smart model when the email is from that platform.
   */
  pinPlatformCategories(
    shortlisted: CategoryItem[],
    allCategories: CategoryItem[],
    fromEmail: string,
  ): CategoryItem[] {
    const keywords = this.getPlatformKeywordsForSender(fromEmail);
    if (keywords.length === 0) return shortlisted;

    const shortlistedKeys = new Set(
      shortlisted.map((cat) => (cat.categoryKey ?? cat.name).toLowerCase()),
    );

    const missing = allCategories.filter((cat) => {
      if (cat.name.toLowerCase() === CATEGORY_RESERVED_NAMES.OTHER)
        return false;
      const dedupeKey = (cat.categoryKey ?? cat.name).toLowerCase();
      if (shortlistedKeys.has(dedupeKey)) return false;
      const nameWithoutEmoji = cat.name
        .toLowerCase()
        .replace(/\p{Emoji}/gu, "")
        .trim();
      return keywords.some((kw) => nameWithoutEmoji.includes(kw));
    });

    if (missing.length === 0) return shortlisted;

    this.logger.log(
      `CategoryShortlist: pinning ${missing.length} platform categor${missing.length === 1 ? "y" : "ies"} for sender "${fromEmail}": ${missing.map((cat) => cat.name).join(", ")}`,
    );
    return [...shortlisted, ...missing];
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
      (cat) => cat.name.toLowerCase() !== CATEGORY_RESERVED_NAMES.OTHER,
    );

    const categoryListText = shortlistableCategories
      .map((cat) => {
        const idPart = cat.categoryKey ? `[id: ${cat.categoryKey}] ` : "";
        const body = cat.description
          ? `${idPart}"${cat.name}": ${cat.description}`
          : `${idPart}"${cat.name}"`;
        return `- ${body}`;
      })
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

      const shortlisted = this.parseShortlistResponse(response, allCategories);
      return this.pinPlatformCategories(shortlisted, allCategories, email.from);
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
   * - Filters to items that match by categoryKey (preferred, case-insensitive) or display name (case-insensitive).
   * - Does NOT append "Other" — the smart model (Step 2) decides if "Other" applies.
   * - Falls back to allCategories on parse errors.
   */
  private extractShortlistNamesArray(response: string): unknown[] | null {
    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed === "object" &&
        "categories" in parsed &&
        Array.isArray(parsed["categories"])
      ) {
        return parsed["categories"] as unknown[];
      }
    }
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return null;
    }
    const parsed: unknown = JSON.parse(arrayMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  }

  private resolveShortlistToken(entry: unknown): string | null {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed || null;
    }
    if (!entry || typeof entry !== "object" || !("id" in entry)) {
      return null;
    }
    const idVal = (entry as { id: unknown }).id;
    if (typeof idVal !== "string") {
      return null;
    }
    const trimmed = idVal.trim();
    return trimmed || null;
  }

  private buildShortlistLookupMaps(allCategories: CategoryItem[]): {
    categoryByKeyLower: Map<string, CategoryItem>;
    categoryByNameLower: Map<string, CategoryItem>;
  } {
    const eligible = allCategories.filter(
      (cat) => cat.name.toLowerCase() !== CATEGORY_RESERVED_NAMES.OTHER,
    );
    const categoryByKeyLower = new Map<string, CategoryItem>();
    const categoryByNameLower = new Map<string, CategoryItem>();
    for (const cat of eligible) {
      categoryByNameLower.set(cat.name.toLowerCase(), cat);
      if (cat.categoryKey) {
        categoryByKeyLower.set(cat.categoryKey.toLowerCase(), cat);
      }
    }
    return { categoryByKeyLower, categoryByNameLower };
  }

  private parseShortlistResponse(
    response: string,
    allCategories: CategoryItem[],
  ): CategoryItem[] {
    try {
      const names = this.extractShortlistNamesArray(response);
      if (!names) {
        this.logger.warn(
          "CategoryShortlistService: no JSON object or array found in shortlist response — using full list",
        );
        return allCategories;
      }

      const { categoryByKeyLower, categoryByNameLower } =
        this.buildShortlistLookupMaps(allCategories);

      const shortlisted: CategoryItem[] = [];
      const seen = new Set<string>();
      for (const entry of names) {
        const token = this.resolveShortlistToken(entry);
        if (!token) continue;
        const byKey = categoryByKeyLower.get(token.toLowerCase());
        const found = byKey ?? categoryByNameLower.get(token.toLowerCase());
        if (!found) continue;
        const dedupeKey = found.categoryKey ?? found.name.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        shortlisted.push(found);
      }

      if (shortlisted.length === 0) {
        this.logger.warn(
          "CategoryShortlistService: shortlist returned no matching categories — using full list",
        );
        return allCategories;
      }

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
