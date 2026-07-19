import { Injectable, Logger } from "@nestjs/common";

import { CONTEXT_ANALYSIS } from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import {
  type DeriveExclusionsResult,
  type ExclusionDerivationSample,
  formatExclusionSamples,
  parseDeriveExclusionsResponse,
} from "./derive-exclusions-parser";
import { cleanEmailContent } from "./email-content-cleaner";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  type DuplicateCategoryGroup,
  identifyDuplicateCategories as identifyDuplicateCategoriesImpl,
} from "./llm-duplicate-categories";
import {
  LLM_OP_ASSESS_CATEGORY_RULE_VALUE,
  LLM_OP_CONSOLIDATE_CATEGORIES,
  LLM_OP_DERIVE_RULE_EXCLUSIONS,
  LLM_OP_GENERATE_CATEGORIES_FROM_OTHER,
  LLM_OP_IDENTIFY_CUSTOM_LABELS,
  LLM_OP_SUGGEST_CATEGORY_RULES,
  type LLMOperation,
} from "./llm-operations";
import {
  assessRuleAddsValue as assessRuleAddsValueImpl,
  type AssessRuleValueParams,
  type AssessRuleValueResult,
  buildSuggestRulesResult,
  type SuggestRulesResult,
} from "./llm-rule-value";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

export type {
  DeriveExclusionsResult,
  ExclusionDerivationSample,
} from "./derive-exclusions-parser";
export type { DuplicateCategoryGroup } from "./llm-duplicate-categories";
export type { SuggestRulesResult } from "./llm-rule-value";

export interface DeriveExclusionPhrasesParams {
  categoryName: string;
  truePositives: ExclusionDerivationSample[];
  falsePositives: ExclusionDerivationSample[];
  maxSubjectNotPhrases: number;
  maxBodyNotPhrases: number;
  userId?: string;
}

/**
 * Domain service for LLM-powered email category consolidation and label identification.
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMCategoriesService {
  private readonly logger = new Logger(LLMCategoriesService.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  private async generateText(
    request: {
      prompt: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      jsonMode?: boolean;
      userId?: string;
    },
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    return this.llmCoreService.generateText(effectiveRequest, provider, userId);
  }

  private startsWithEmoji(text: string): boolean {
    const emojiPattern =
      /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}])/u;
    return emojiPattern.test(text);
  }

  private readonly categoryEmojiMap: Record<string, string> = {
    // Work & Business
    recruitment: "👔",
    hiring: "👔",
    job: "👔",
    career: "👔",
    hr: "👔",
    "human resources": "👔",
    support: "🎧",
    "customer service": "🎧",
    helpdesk: "🎧",
    sales: "💰",
    marketing: "📣",
    promotion: "📣",
    advertising: "📣",
    finance: "💵",
    accounting: "💵",
    invoice: "💵",
    billing: "💵",
    payment: "💵",
    legal: "⚖️",
    contract: "⚖️",
    compliance: "⚖️",
    // Development & Tech
    development: "💻",
    engineering: "💻",
    code: "💻",
    github: "🐙",
    gitlab: "🦊",
    "pull request": "🔀",
    "merge request": "🔀",
    "code review": "🔍",
    bug: "🐛",
    issue: "🐛",
    ci: "🔧",
    "ci/cd": "🔧",
    build: "🔧",
    deploy: "🚀",
    deployment: "🚀",
    release: "🚀",
    security: "🔒",
    // Communication & Meetings
    meeting: "📅",
    calendar: "📅",
    schedule: "📅",
    appointment: "📅",
    team: "👥",
    collaboration: "👥",
    newsletter: "📰",
    news: "📰",
    update: "📰",
    announcement: "📢",
    notification: "🔔",
    alert: "🔔",
    // Personal & Social
    personal: "👤",
    social: "🌐",
    networking: "🤝",
    event: "🎉",
    invitation: "💌",
    // Education & Learning
    education: "🎓",
    learning: "📚",
    training: "📚",
    course: "📚",
    webinar: "🎥",
    // Travel & Logistics
    travel: "✈️",
    shipping: "📦",
    delivery: "📦",
    order: "📦",
    // Other common categories
    spam: "🚫",
    junk: "🚫",
    archive: "📁",
    important: "⭐",
    urgent: "🚨",
    priority: "🚨",
    project: "📋",
    task: "✅",
    todo: "✅",
    feedback: "💬",
    survey: "📊",
    report: "📊",
    analytics: "📊",
    subscription: "📧",
    vendor: "🏢",
    partner: "🤝",
    client: "🤝",
    customer: "🤝",
  };

  private ensureCategoryEmoji(name: string): string {
    const trimmedName = name.trim();

    if (this.startsWithEmoji(trimmedName)) {
      return trimmedName;
    }

    const lowerName = trimmedName.toLowerCase();
    for (const [keyword, emoji] of Object.entries(this.categoryEmojiMap)) {
      if (lowerName.includes(keyword)) {
        return `${emoji} ${trimmedName}`;
      }
    }

    return `📁 ${trimmedName}`;
  }

  private parseConsolidatedCategoriesResponse(
    response: string,
    autoCount: number,
  ): Array<{ name: string; description: string; isUserAdded: boolean }> | null {
    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      let parsedArr: unknown[] | null = null;
      const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        const parsedObj = JSON.parse(jsonObjMatch[0]) as Record<
          string,
          unknown
        >;
        if (Array.isArray(parsedObj.consolidated_categories)) {
          parsedArr = parsedObj.consolidated_categories;
        } else {
          const arrayKey = Object.keys(parsedObj).find((key) =>
            Array.isArray(parsedObj[key]),
          );
          if (arrayKey) {
            this.logger.warn(
              `[CATEGORY-CONSOLIDATION] Expected key 'consolidated_categories' but found '${arrayKey}'. Using fallback.`,
            );
            parsedArr = parsedObj[arrayKey] as unknown[];
          }
        }
      }
      if (!parsedArr) {
        const jsonArrMatch = jsonString.match(/\[[\s\S]*\]/);
        if (jsonArrMatch) {
          this.logger.warn(
            `[CATEGORY-CONSOLIDATION] Response was a bare array instead of wrapped object. Accepting with warning.`,
          );
          parsedArr = JSON.parse(jsonArrMatch[0]) as unknown[];
        }
      }
      if (!Array.isArray(parsedArr)) {
        this.logger.warn(
          `[CATEGORY-CONSOLIDATION] No JSON array found in response`,
        );
        return null;
      }
      if (!Array.isArray(parsedArr) || parsedArr.length === 0) {
        this.logger.warn(
          `[CATEGORY-CONSOLIDATION] Parsed array is empty or not an array`,
        );
        return null;
      }
      const consolidated = parsedArr
        .filter((item: unknown) => {
          const typedItem = item as { name?: string; description?: string };
          return typedItem.name && typedItem.description;
        })
        .map((item: unknown) => {
          const typedItem = item as {
            name: string;
            description: string;
            isUserAdded?: boolean;
          };
          return {
            name: String(typedItem.name).trim(),
            description: String(typedItem.description).trim(),
            isUserAdded: !!typedItem.isUserAdded,
          };
        });
      const withEmojis = consolidated.map((category) => ({
        ...category,
        name: category.isUserAdded
          ? category.name
          : this.ensureCategoryEmoji(category.name),
      }));
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] === SUCCESS === Consolidated ${autoCount} -> ${withEmojis.filter((category) => !category.isUserAdded).length} auto-generated (+ ${withEmojis.filter((cat) => cat.isUserAdded).length} user-added preserved)`,
      );
      return withEmojis;
    } catch (error) {
      this.logger.error(
        `[CATEGORY-CONSOLIDATION] ERROR: Failed to parse LLM response as JSON: ${error}`,
      );
      return null;
    }
  }

  async consolidateEmailCategories(
    autoGeneratedCategories: Array<{ name: string; description: string }>,
    userAddedCategories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{ name: string; description: string; isUserAdded: boolean }>
  > {
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] === START === Input: ${autoGeneratedCategories.length} auto-generated, ${userAddedCategories.length} user-added categories`,
    );
    if (autoGeneratedCategories.length > 0) {
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Auto-generated categories:\n${autoGeneratedCategories.map((category) => `  - ${category.name}`).join("\n")}`,
      );
    }

    const fallbackResult = [
      ...autoGeneratedCategories.map((category) => ({
        ...category,
        isUserAdded: false,
      })),
      ...userAddedCategories.map((item) => ({ ...item, isUserAdded: true })),
    ];

    if (
      autoGeneratedCategories.length <= 1 &&
      userAddedCategories.length === 0
    ) {
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Skipping consolidation - only ${autoGeneratedCategories.length} auto-generated categories`,
      );
      return autoGeneratedCategories.map((category) => ({
        ...category,
        isUserAdded: false,
      }));
    }

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.CONSOLIDATE_CATEGORIES);
    if (!promptConfig) {
      this.logger.error(
        "[CATEGORY-CONSOLIDATION] ERROR: consolidate_categories prompt not found in markdown files",
      );
      return fallbackResult;
    }

    const categoriesText =
      autoGeneratedCategories.length > 0
        ? autoGeneratedCategories
            .map((item) => `- ${item.name}: ${item.description}`)
            .join("\n")
        : "None";
    const userCategoriesText =
      userAddedCategories.length > 0
        ? userAddedCategories
            .map(
              (item) =>
                `- ${item.name}: ${item.description} (USER-ADDED - PRESERVE)`,
            )
            .join("\n")
        : "None";

    const prompt = renderPrompt(promptConfig.prompt || "", {
      categories: categoriesText,
      userCategories: userCategoriesText,
    });
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Calling LLM to consolidate ${autoGeneratedCategories.length} auto-generated + ${userAddedCategories.length} user-added categories`,
    );

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_CONSOLIDATE_CATEGORIES,
    );
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] LLM response received (length: ${response.length} chars)`,
    );

    const result = this.parseConsolidatedCategoriesResponse(
      response,
      autoGeneratedCategories.length,
    );
    if (result) return result;

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] === FALLBACK === Returning original categories without consolidation`,
    );
    return fallbackResult;
  }

  /**
   * Family-scoped, conservative de-duplication for the manual "Consolidate
   * Categories" button. Delegates to {@link identifyDuplicateCategoriesImpl}
   * (kept separate for file-size). Never throws — returns `[]` on failure so
   * the caller leaves the family untouched. Unlike
   * {@link consolidateEmailCategories} (used during initial analysis), it does
   * NOT collapse the list into broad buckets and imposes no count cap.
   */
  async identifyDuplicateCategories(
    familyName: string,
    categories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
    crossFamily?: boolean,
  ): Promise<DuplicateCategoryGroup[]> {
    return identifyDuplicateCategoriesImpl(
      (request) => this.llmCoreService.generateText(request, provider, userId),
      this.logger,
      { familyName, categories, userId, crossFamily },
    );
  }

  private parseGeneratedCategoriesResponse(
    response: string,
    existingCategories: Array<{ name: string }>,
  ): Array<{ name: string; description: string }> | null {
    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      let parsedArr: unknown[] | null = null;
      const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        const parsedObj = JSON.parse(jsonObjMatch[0]) as Record<
          string,
          unknown
        >;
        if (Array.isArray(parsedObj.generated_categories)) {
          parsedArr = parsedObj.generated_categories;
        } else {
          const arrayKey = Object.keys(parsedObj).find((key) =>
            Array.isArray(parsedObj[key]),
          );
          if (arrayKey) {
            this.logger.warn(
              `[GENERATE-CATEGORIES] Expected key 'generated_categories' but found '${arrayKey}'. Using fallback.`,
            );
            parsedArr = parsedObj[arrayKey] as unknown[];
          }
        }
      }
      if (!parsedArr) {
        const jsonArrMatch = jsonString.match(/\[[\s\S]*\]/);
        if (jsonArrMatch) {
          this.logger.warn(
            `[GENERATE-CATEGORIES] Response was a bare array instead of wrapped object. Accepting with warning.`,
          );
          parsedArr = JSON.parse(jsonArrMatch[0]) as unknown[];
        }
      }
      if (!Array.isArray(parsedArr)) return null;
      const existingNames = new Set(
        existingCategories.map((item) =>
          item.name.toLowerCase().replace(/^[^\w]+/, ""),
        ),
      );
      return parsedArr
        .filter((item: unknown) => {
          const typedItem = item as { name?: string; description?: string };
          return typedItem.name && typedItem.description;
        })
        .map((item: unknown) => {
          const typedItem = item as { name: string; description: string };
          return {
            name: this.ensureCategoryEmoji(String(typedItem.name).trim()),
            description: String(typedItem.description).trim(),
          };
        })
        .filter(
          (cat) =>
            !existingNames.has(cat.name.toLowerCase().replace(/^[^\w]+/, "")),
        );
    } catch (error) {
      this.logger.error(
        `[GENERATE-CATEGORIES] ERROR: Failed to parse LLM response as JSON: ${error}`,
      );
      return null;
    }
  }

  async generateCategoriesFromOther(
    otherEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    }>,
    existingCategories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Array<{ name: string; description: string }>> {
    this.logger.log(
      `[GENERATE-CATEGORIES] === START === Analyzing ${otherEmails.length} emails in "Other" category`,
    );

    if (otherEmails.length === 0) {
      this.logger.log(
        `[GENERATE-CATEGORIES] No emails in "Other" category to analyze`,
      );
      return [];
    }

    const promptConfig = getPrompt(
      UTILITY_PROMPT_IDS.GENERATE_CATEGORIES_FROM_OTHER,
    );
    if (!promptConfig) {
      this.logger.error(
        "[GENERATE-CATEGORIES] ERROR: generate_categories_from_other prompt not found in markdown files",
      );
      return [];
    }

    const existingCategoriesText =
      existingCategories.length > 0
        ? existingCategories
            .map((item) => `- ${item.name}: ${item.description}`)
            .join("\n")
        : "None";

    const emailsToAnalyze = otherEmails.slice(
      0,
      CONTEXT_ANALYSIS.MAX_EMAILS_FOR_CATEGORY_ANALYSIS,
    );
    const otherEmailsText = emailsToAnalyze
      .map(
        (emailEntry, i) =>
          `[Email ${i + 1}]\nFrom: ${emailEntry.fromName || emailEntry.from}\nSubject: ${emailEntry.subject}\nBody preview: ${cleanEmailContent(emailEntry.body || "", null, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
      )
      .join("\n\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      existingCategories: existingCategoriesText,
      otherEmails: otherEmailsText,
    });
    this.logger.log(
      `[GENERATE-CATEGORIES] Calling LLM to analyze ${emailsToAnalyze.length} emails and suggest new categories`,
    );

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_CATEGORIES_FROM_OTHER,
    );
    this.logger.log(
      `[GENERATE-CATEGORIES] LLM response received (length: ${response.length} chars)`,
    );

    const newCategories = this.parseGeneratedCategoriesResponse(
      response,
      existingCategories,
    );
    if (newCategories) {
      this.logger.log(
        `[GENERATE-CATEGORIES] === SUCCESS === Generated ${newCategories.length} new categories`,
      );
      return newCategories;
    }
    this.logger.log(
      `[GENERATE-CATEGORIES] === FALLBACK === No new categories generated`,
    );
    return [];
  }

  private parseCustomLabelsResponse(response: string): Array<{
    label: string;
    categoryName: string;
    description: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }> | null {
    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      let parsedArr: unknown[] | null = null;
      const jsonObjMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        const parsedObj = JSON.parse(jsonObjMatch[0]) as Record<
          string,
          unknown
        >;
        if (Array.isArray(parsedObj.custom_labels)) {
          parsedArr = parsedObj.custom_labels;
        } else {
          const arrayKey = Object.keys(parsedObj).find((key) =>
            Array.isArray(parsedObj[key]),
          );
          if (arrayKey) {
            this.logger.warn(
              `[IDENTIFY-CUSTOM-LABELS] Expected key 'custom_labels' but found '${arrayKey}'. Using fallback.`,
            );
            parsedArr = parsedObj[arrayKey] as unknown[];
          }
        }
      }
      if (!parsedArr) {
        const jsonArrMatch = jsonString.match(/\[[\s\S]*\]/);
        if (jsonArrMatch) {
          this.logger.warn(
            `[IDENTIFY-CUSTOM-LABELS] Response was a bare array instead of wrapped object. Accepting with warning.`,
          );
          parsedArr = JSON.parse(jsonArrMatch[0]) as unknown[];
        }
      }
      if (!Array.isArray(parsedArr)) return null;
      return parsedArr
        .filter((item: unknown) => {
          const typedItem = item as {
            label?: string;
            categoryName?: string;
            description?: string;
            confidence?: string;
          };
          return (
            typedItem.label &&
            typedItem.categoryName &&
            typedItem.description &&
            typedItem.confidence
          );
        })
        .map((item: unknown) => {
          const typedItem = item as {
            label: string;
            categoryName: string;
            description: string;
            confidence: string;
          };
          return {
            label: String(typedItem.label).trim(),
            categoryName: String(typedItem.categoryName).trim(),
            description: String(typedItem.description).trim(),
            confidence: String(typedItem.confidence).trim() as
              | "HIGH"
              | "MEDIUM"
              | "LOW",
          };
        });
    } catch (error) {
      this.logger.error(
        `[IDENTIFY-CUSTOM-LABELS] === ERROR === Failed to parse LLM response: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async identifyCustomLabels(
    labels: string[],
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{
      label: string;
      categoryName: string;
      description: string;
      confidence: "HIGH" | "MEDIUM" | "LOW";
    }>
  > {
    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] === START === Input: ${labels.length} labels`,
    );

    if (labels.length === 0) {
      this.logger.log(
        `[IDENTIFY-CUSTOM-LABELS] === SKIP === No labels to analyze`,
      );
      return [];
    }

    const prompt = await renderPrompt("identify_custom_labels", {
      labels: labels.join(", "),
    });
    this.logger.log(`[IDENTIFY-CUSTOM-LABELS] Calling LLM to identify labels`);
    const response = await this.generateText(
      {
        prompt,
        systemPrompt: "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        jsonMode: true,
        userId,
      },
      provider,
      userId,
      LLM_OP_IDENTIFY_CUSTOM_LABELS,
    );
    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] LLM response received (length: ${response.length} chars)`,
    );

    const customLabels = this.parseCustomLabelsResponse(response);
    if (customLabels) {
      this.logger.log(
        `[IDENTIFY-CUSTOM-LABELS] === SUCCESS === Identified ${customLabels.length} custom labels`,
      );
      return customLabels;
    }
    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] Raw response:\n${response.substring(0, QUERY_LIMITS.SUBSTRING_BODY_PREVIEW)}`,
    );
    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] === FALLBACK === No custom labels identified`,
    );
    return [];
  }

  /**
   * Uses the LLM to extract SHORT, GENERIC subject/body phrases and a sender
   * pattern from a set of email samples (issue #1714).
   *
   * When multiple sender emails share the same domain the LLM may return a
   * domain wildcard such as `*@github.com` in `fromMatchesAny`.
   *
   * Returns `null` when the LLM call fails or returns no usable phrases.
   */
  async suggestRulesFromEmailSamples(
    categoryName: string,
    senderEmails: string[],
    emailSamples: Array<{ subject: string; body: string }>,
    userId?: string,
  ): Promise<SuggestRulesResult | null> {
    this.logger.log(
      `[SUGGEST-CATEGORY-RULES] === START === category="${categoryName}" senders=${senderEmails.length} samples=${emailSamples.length}`,
    );

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.SUGGEST_CATEGORY_RULES);
    if (!promptConfig) {
      this.logger.error(
        "[SUGGEST-CATEGORY-RULES] ERROR: suggest_category_rules prompt not found",
      );
      return null;
    }

    const emailSamplesText = emailSamples
      .map(
        (sample, i) =>
          `[Email ${i + 1}]\nSubject: ${sample.subject}\nBody preview: ${cleanEmailContent(sample.body || "", null, QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH)}`,
      )
      .join("\n\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      categoryName,
      senderEmails: senderEmails.join("\n"),
      emailSamples: emailSamplesText,
    });

    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS,
          jsonMode: true,
          userId,
        },
        undefined,
        userId,
        LLM_OP_SUGGEST_CATEGORY_RULES,
      );

      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn(
          `[SUGGEST-CATEGORY-RULES] No JSON object found in response`,
        );
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const result = buildSuggestRulesResult(parsed, senderEmails);
      if (!result) {
        this.logger.warn(
          `[SUGGEST-CATEGORY-RULES] LLM returned no usable phrases for "${categoryName}"`,
        );
        return null;
      }

      this.logger.log(
        `[SUGGEST-CATEGORY-RULES] === SUCCESS === from=${result.fromMatchesAny.join(",")} subjects=${result.subjectContainsAny.length} body=${result.bodyContainsAny.length} subjectNot=${result.subjectNotContainsAny.length} bodyNot=${result.bodyNotContainsAny.length}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[SUGGEST-CATEGORY-RULES] ERROR: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Issue #1789 follow-up: given a draft auto-rule that produced false
   * positives during validation, asks the LLM for `subjectNotContainsAny` /
   * `bodyNotContainsAny` exclusion phrases that appear in the FP samples but
   * not in the TP samples. Returns empty arrays when the call fails or the
   * LLM cannot find a clean separator — callers should treat that as "no
   * usable exclusions" and discard the rule.
   */
  async deriveExclusionPhrasesFromFalsePositives(
    params: DeriveExclusionPhrasesParams,
  ): Promise<DeriveExclusionsResult> {
    const {
      categoryName,
      truePositives,
      falsePositives,
      maxSubjectNotPhrases,
      maxBodyNotPhrases,
      userId,
    } = params;
    this.logger.log(
      `[DERIVE-RULE-EXCLUSIONS] === START === category="${categoryName}" tp=${truePositives.length} fp=${falsePositives.length}`,
    );

    if (falsePositives.length === 0) {
      return { subjectNotContainsAny: [], bodyNotContainsAny: [] };
    }

    const promptConfig = getPrompt(UTILITY_PROMPT_IDS.DERIVE_RULE_EXCLUSIONS);
    if (!promptConfig) {
      this.logger.error(
        "[DERIVE-RULE-EXCLUSIONS] ERROR: derive_rule_exclusions prompt not found",
      );
      return { subjectNotContainsAny: [], bodyNotContainsAny: [] };
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      categoryName,
      truePositiveSamples: formatExclusionSamples(truePositives),
      falsePositiveSamples: formatExclusionSamples(falsePositives),
      maxSubjectNotPhrases: String(maxSubjectNotPhrases),
      maxBodyNotPhrases: String(maxBodyNotPhrases),
    });

    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
          jsonMode: true,
          userId,
        },
        undefined,
        userId,
        LLM_OP_DERIVE_RULE_EXCLUSIONS,
      );

      const result = parseDeriveExclusionsResponse(
        response,
        truePositives,
        maxSubjectNotPhrases,
        maxBodyNotPhrases,
      );
      this.logger.log(
        `[DERIVE-RULE-EXCLUSIONS] === SUCCESS === subjectNot=${result.subjectNotContainsAny.length} bodyNot=${result.bodyNotContainsAny.length}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[DERIVE-RULE-EXCLUSIONS] ERROR: ${getErrorMessage(error)}`,
      );
      return { subjectNotContainsAny: [], bodyNotContainsAny: [] };
    }
  }

  /**
   * Asks the LLM whether a draft composite rule adds value over the existing
   * rules already targeting the same category, or is redundant. Delegates to
   * `assessRuleAddsValue` in llm-rule-value.ts (kept separate for file-size).
   */
  async assessRuleAddsValue(
    params: AssessRuleValueParams,
  ): Promise<AssessRuleValueResult> {
    return assessRuleAddsValueImpl(
      (request) =>
        this.generateText(
          request,
          undefined,
          params.userId,
          LLM_OP_ASSESS_CATEGORY_RULE_VALUE,
        ),
      this.logger,
      params,
    );
  }
}
