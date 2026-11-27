import { JEV, JEV_TWO_STAGE } from "../constants/jev.constants";
import {
  assignFamily,
  OTHER_FAMILY,
} from "../context/category-family.taxonomy";
import type { CategoriseFromSummaryParams } from "./llm-categorise-summary";
import { getPrompt, UTILITY_PROMPT_IDS } from "./prompts";

type CategoryInput = CategoriseFromSummaryParams["categories"][number];

/**
 * One stage-1 option: a family of related categories, or a single category the
 * taxonomy leaves unfamilied (so every category stays reachable).
 */
export interface FamilyOption {
  /** Taxonomy family label, or null for a lone unfamilied category. */
  family: string | null;
  /** Indexes into the caller's category list, in list order. */
  categoryIndexes: number[];
}

const MEMBER_SEPARATOR = "; ";

function describeCategory(category: CategoryInput): string {
  return category.description
    ? `${category.name} — ${category.description}`
    : category.name;
}

/**
 * Groups categories by taxonomy family, in order of each family's first
 * member. Categories the taxonomy cannot place get an option of their own.
 */
export function buildFamilyOptions(
  categories: CategoryInput[],
): FamilyOption[] {
  const options: FamilyOption[] = [];
  const optionByFamily = new Map<string, FamilyOption>();
  categories.forEach((category, index) => {
    const family = assignFamily(category.name);
    if (family === OTHER_FAMILY) {
      options.push({ family: null, categoryIndexes: [index] });
      return;
    }
    const existing = optionByFamily.get(family);
    if (existing) {
      existing.categoryIndexes.push(index);
      return;
    }
    const option = { family, categoryIndexes: [index] };
    optionByFamily.set(family, option);
    options.push(option);
  });
  return options;
}

/** Stage 1 only pays off when grouping removes options. */
export function familyOptionsShrinkChoice(
  options: FamilyOption[],
  categoryCount: number,
): boolean {
  return options.length < categoryCount;
}

/** True when the family stage would offer fewer options than the category list. */
export function isTwoStageWorthwhile(categories: CategoryInput[]): boolean {
  return familyOptionsShrinkChoice(
    buildFamilyOptions(categories),
    categories.length,
  );
}

/**
 * The option text Jev sees. A family lists its members by name only: the
 * descriptions are what stage 2 is for, and repeating them here would send the
 * whole category list twice.
 */
function describeOption(
  option: FamilyOption,
  categories: CategoryInput[],
): string {
  const members = option.categoryIndexes.map((index) => categories[index]);
  if (option.family === null || members.length === 1)
    return describeCategory(members[0]);
  return `${option.family} family — contains: ${members
    .map((member) => member.name)
    .join(MEMBER_SEPARATOR)}`;
}

/** Jev Choice request for stage 1; option N (1-based) is `options[N - 1]`. */
export function buildJevFamilyRequest(
  params: CategoriseFromSummaryParams,
  options: FamilyOption[],
  model: string,
) {
  if (!options.length || options.length >= JEV.MAX_OPTIONS)
    throw new Error("Jev family count exceeds Choice capacity or is empty");
  const prompt = getPrompt(UTILITY_PROMPT_IDS.CATEGORISE_SUMMARY_JEV_FAMILY);
  if (!prompt?.prompt) throw new Error("Jev family prompt is missing");
  const criteria: Record<string, string> = Object.fromEntries(
    options.map((option, index) => [
      String(index + 1),
      describeOption(option, params.categories),
    ]),
  );
  criteria[JEV.OTHER_OPTION] =
    "Other: no listed option contains a category that reasonably fits after respecting exclusions.";
  return {
    state: {
      subject: params.subject,
      senderName: params.senderName || "",
      senderEmail: params.senderEmail || "",
      summary: params.summary,
      githubFacts: params.githubFacts || "",
    },
    model,
    questions: {
      [JEV_TWO_STAGE.FAMILY_QUESTION_ID]: {
        type: JEV.QUESTION_TYPE,
        instructions: prompt.prompt,
        criteria,
      },
    },
  };
}
