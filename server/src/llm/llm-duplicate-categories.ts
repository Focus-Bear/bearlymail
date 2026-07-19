import type { Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { getErrorMessage } from "../types/common";
import { LLM_OP_MERGE_DUPLICATE_CATEGORIES } from "./llm-operations";
import { getPrompt, renderPrompt, UTILITY_PROMPT_IDS } from "./prompts";

/**
 * A group of existing categories the LLM judged to be true semantic duplicates.
 * `members` are verbatim category names; `canonical` is the one to keep.
 */
export interface DuplicateCategoryGroup {
  canonical: string;
  members: string[];
}

export type MergeDuplicateGenerateText = (request: {
  prompt: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;
  userId?: string;
  operation: typeof LLM_OP_MERGE_DUPLICATE_CATEGORIES;
}) => Promise<string>;

export interface IdentifyDuplicatesParams {
  familyName: string;
  categories: Array<{ name: string; description: string }>;
  userId?: string;
  /**
   * When true the supplied categories span MULTIPLE families rather than one.
   * Switches the prompt to its cross-family framing; the duplicate criteria
   * stay identically conservative.
   */
  crossFamily?: boolean;
}

/**
 * Family-scoped, conservative de-duplication. Given the categories that all
 * belong to ONE family, asks the LLM which ones are TRUE semantic duplicates
 * (the same email would belong in either). Returns only groups of 2+ names,
 * every name copied verbatim from the input. Categories with no duplicate are
 * omitted. Never throws — returns `[]` on any failure so the caller leaves the
 * family untouched.
 *
 * Powers the manual "Consolidate Categories" button. Unlike the legacy
 * consolidation, it does NOT collapse the list into broad buckets and imposes
 * no count cap.
 */
export async function identifyDuplicateCategories(
  generateText: MergeDuplicateGenerateText,
  logger: Logger,
  params: IdentifyDuplicatesParams,
): Promise<DuplicateCategoryGroup[]> {
  const { familyName, categories, userId, crossFamily } = params;
  if (categories.length < 2) {
    return [];
  }

  const promptConfig = getPrompt(UTILITY_PROMPT_IDS.MERGE_DUPLICATE_CATEGORIES);
  if (!promptConfig) {
    logger.error(
      "[MERGE-DUPLICATE-CATEGORIES] ERROR: merge_duplicate_categories prompt not found",
    );
    return [];
  }

  const categoriesText = categories
    .map((item) => `- ${item.name}: ${item.description}`)
    .join("\n");
  const prompt = renderPrompt(promptConfig.prompt || "", {
    familyName,
    categories: categoriesText,
    crossFamily: Boolean(crossFamily),
  });

  try {
    const response = await generateText({
      prompt,
      systemPrompt: promptConfig.systemPrompt || "",
      temperature: RATIOS.THIRTY_PERCENT,
      maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
      jsonMode: true,
      userId,
      operation: LLM_OP_MERGE_DUPLICATE_CATEGORIES,
    });
    const groups = parseDuplicateGroupsResponse(
      response,
      categories.map((item) => item.name),
      logger,
    );
    logger.log(
      `[MERGE-DUPLICATE-CATEGORIES] family="${familyName}" ${categories.length} categories -> ${groups.length} duplicate group(s)`,
    );
    return groups;
  } catch (error) {
    logger.error(
      `[MERGE-DUPLICATE-CATEGORIES] ERROR for family "${familyName}": ${getErrorMessage(error)}`,
    );
    return [];
  }
}

function extractDuplicateGroups(response: string, logger: Logger): unknown[] {
  try {
    const jsonString = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const objMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!objMatch) {
      logger.warn(
        "[MERGE-DUPLICATE-CATEGORIES] No JSON object found in response",
      );
      return [];
    }
    const parsed = JSON.parse(objMatch[0]) as { duplicate_groups?: unknown };
    return Array.isArray(parsed.duplicate_groups)
      ? parsed.duplicate_groups
      : [];
  } catch (error) {
    logger.error(
      `[MERGE-DUPLICATE-CATEGORIES] Failed to parse response: ${getErrorMessage(error)}`,
    );
    return [];
  }
}

/**
 * Validates a merge_duplicate_categories response, keeping only well-formed
 * groups: every member must map (case-insensitively) back to an input name, a
 * group needs 2+ distinct members, and the canonical must be one of them.
 * Returned names are the verbatim input names so the caller can match them to
 * the underlying category records.
 */
export function parseDuplicateGroupsResponse(
  response: string,
  inputNames: string[],
  logger: Logger,
): DuplicateCategoryGroup[] {
  const rawGroups = extractDuplicateGroups(response, logger);

  const byNormalized = new Map<string, string>();
  for (const name of inputNames) {
    byNormalized.set(name.trim().toLowerCase(), name);
  }

  const result: DuplicateCategoryGroup[] = [];
  for (const raw of rawGroups) {
    const group = raw as { canonical?: unknown; members?: unknown };
    if (!Array.isArray(group.members)) continue;

    const seen = new Set<string>();
    const members: string[] = [];
    for (const member of group.members) {
      const matched = byNormalized.get(String(member).trim().toLowerCase());
      if (matched && !seen.has(matched)) {
        seen.add(matched);
        members.push(matched);
      }
    }
    if (members.length < 2) continue;

    const canonicalMatch = byNormalized.get(
      String(group.canonical ?? "")
        .trim()
        .toLowerCase(),
    );
    const canonical =
      canonicalMatch && members.includes(canonicalMatch)
        ? canonicalMatch
        : members[0];

    result.push({ canonical, members });
  }
  return result;
}
