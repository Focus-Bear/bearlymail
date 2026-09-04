/**
 * The category step that runs BEFORE priority scoring for every new email.
 *
 * Category selection never happens inside the priority prompt: a weak model
 * choosing among dozens of categories while also scoring urgency picks
 * nonsense, whereas the same model on the category-only prompt is reliable.
 * The chosen category is handed to the priority prompt as already assigned.
 */
import type { Logger } from "@nestjs/common";

import type {
  CategoryItem,
  CategoryShortlistService,
} from "./category-shortlist.service";
import {
  categoriseWithEscalation,
  OTHER_CATEGORY_NAME,
} from "./llm-categorise-summary";
import type { LLMCoreService } from "./llm-core.service";
import type {
  CategoryInstrumentation,
  PriorityResult,
} from "./priority-analysis.service";
import type { UserContextInput } from "./priority-context-texts.helper";

export interface PriorityCategoryStepDeps {
  llmCoreService: Pick<LLMCoreService, "generateText">;
  categoryShortlistService: Pick<
    CategoryShortlistService,
    "isShortlistEnabled" | "getShortlistWithMeta"
  >;
  logger: Logger;
}

const CATEGORY_MODEL_UNAVAILABLE_EXPLANATION =
  "Category model unavailable — left as Other";

/**
 * Starter categories offered to the categoriser when the user has none yet, so
 * a brand-new account still gets sensible buckets instead of everything landing
 * in "Other".
 */
const DEFAULT_CATEGORIES: CategoryItem[] = [
  {
    name: "Newsletters",
    description:
      "Marketing emails, digests, promotional content, automated updates",
  },
  {
    name: "Sales",
    description:
      "Sales discussions, potential customer inquiries, pricing requests, demos",
  },
  {
    name: "Partnerships",
    description:
      "Partnership proposals, collaboration requests, business development",
  },
  {
    name: "Customer Support",
    description:
      "Support requests, bug reports, customer issues, help requests",
  },
  {
    name: "HR Admin",
    description:
      "HR communications, admin tasks, internal company matters, policies",
  },
];

/**
 * The category list the categoriser chooses from: the user's real + proto
 * categories, narrowed by the embedding shortlist when there are enough of
 * them to warrant it, or the starter set when the user has none yet.
 * `shortlistedCategoryNames` is null when shortlisting was skipped.
 */
async function resolveCategoryCandidates(
  deps: PriorityCategoryStepDeps,
  email: { from: string; fromName?: string; subject: string },
  userContext: UserContextInput | undefined,
  cleanedBody: string,
): Promise<{
  candidates: CategoryItem[];
  instrumentation: CategoryInstrumentation;
}> {
  const realCategories = userContext?.emailCategories ?? [];
  const protoCategories = userContext?.protoCategories ?? [];
  const allCategories = [...realCategories, ...protoCategories];
  const counts = {
    totalCategoryCount: allCategories.length,
    protoCategoryCount: protoCategories.length,
  };
  if (allCategories.length === 0) {
    return {
      candidates: DEFAULT_CATEGORIES,
      instrumentation: {
        shortlistedCategoryNames: null,
        shortlistCandidates: null,
        ...counts,
      },
    };
  }
  if (!deps.categoryShortlistService.isShortlistEnabled(allCategories.length)) {
    return {
      candidates: allCategories,
      instrumentation: {
        shortlistedCategoryNames: null,
        shortlistCandidates: null,
        ...counts,
      },
    };
  }
  const { effective, candidates } =
    await deps.categoryShortlistService.getShortlistWithMeta(
      {
        from: email.from,
        fromName: email.fromName,
        subject: email.subject,
        summary: cleanedBody,
      },
      allCategories,
    );
  return {
    candidates: effective,
    instrumentation: {
      shortlistedCategoryNames: effective.map((cat) => cat.name),
      shortlistCandidates: candidates,
      ...counts,
    },
  };
}

/**
 * Chooses the email's category with the category-only prompt (Nova Micro,
 * escalating to Gemini on "Other"/LOW/failure) BEFORE priority scoring runs.
 * Category selection never happens inside the priority prompt: a weak model
 * choosing among dozens of categories while also scoring urgency picks
 * nonsense, whereas the same model on the category-only prompt is reliable.
 */
export async function chooseEmailCategory(
  deps: PriorityCategoryStepDeps,
  options: {
    email: { from: string; fromName?: string; subject: string };
    userContext?: UserContextInput;
    cleanedBody: string;
    userId?: string;
  },
): Promise<{
  assignedCategory: CategoryItem;
  categoryFields: Pick<
    PriorityResult,
    | "category"
    | "categoryNumber"
    | "categoryExplanation"
    | "categoryConfidence"
    | "protoCategorySuggestion"
  >;
  instrumentation: CategoryInstrumentation;
  candidateCount: number;
}> {
  const { email, userContext, cleanedBody, userId } = options;
  const { candidates, instrumentation } = await resolveCategoryCandidates(
    deps,
    email,
    userContext,
    cleanedBody,
  );

  const chosen = await categoriseWithEscalation(
    deps.llmCoreService,
    deps.logger,
    {
      subject: email.subject,
      senderName: email.fromName || email.from,
      senderEmail: email.from,
      summary: cleanedBody,
      categories: candidates,
      userId,
    },
  );

  if (!chosen) {
    return {
      assignedCategory: { name: OTHER_CATEGORY_NAME },
      categoryFields: {
        category: OTHER_CATEGORY_NAME,
        categoryNumber: null,
        categoryExplanation: CATEGORY_MODEL_UNAVAILABLE_EXPLANATION,
        categoryConfidence: undefined,
        protoCategorySuggestion: undefined,
      },
      instrumentation,
      candidateCount: candidates.length,
    };
  }

  const matched = candidates.find((cat) => cat.name === chosen.categoryName);
  return {
    assignedCategory: matched ?? { name: chosen.categoryName },
    categoryFields: {
      category: chosen.categoryName,
      categoryNumber: chosen.categoryNumber,
      categoryExplanation:
        chosen.reasoning ?? "No category explanation provided",
      categoryConfidence: chosen.categoryConfidence,
      protoCategorySuggestion: chosen.protoCategorySuggestion,
    },
    instrumentation,
    candidateCount: candidates.length,
  };
}
