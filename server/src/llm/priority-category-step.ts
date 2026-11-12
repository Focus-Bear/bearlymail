/**
 * The category step that runs BEFORE priority scoring for every new email.
 *
 * Category selection never happens inside the priority prompt: a weak model
 * choosing among dozens of categories while also scoring urgency picks
 * nonsense, whereas the same model on the category-only prompt is reliable.
 * The chosen category is handed to the priority prompt as already assigned.
 */
import type {
  CategoryItem,
  CategoryShortlister,
} from "../shared/email-intelligence/category.types";
import type { LoggerPort } from "../shared/email-intelligence/ports";
import {
  categoriseWithEscalation,
  type CategoryModelClient,
  OTHER_CATEGORY_NAME,
} from "./llm-categorise-summary";
import type {
  CategoryInstrumentation,
  PriorityResult,
} from "./priority-analysis.types";
import type { UserContextInput } from "./priority-context-texts.helper";

export interface PriorityCategoryStepDeps {
  llmCoreService: CategoryModelClient;
  /** Strong Gemini model for escalating Other/LOW verdicts; omit to skip. */
  escalationModel?: string;
  categoryShortlistService: CategoryShortlister;
  logger: LoggerPort;
}

const CATEGORY_MODEL_UNAVAILABLE_EXPLANATION =
  "Category model unavailable — left as Other";

/**
 * Why a thread stays in "Other" when the user has no categories yet (onboarding
 * saves them after the first sync starts). The categoriser is not called: any
 * name it picked could not be filed, so it used to land in "Other" with a
 * misleading "not found in your category list" note.
 */
export const NO_USER_CATEGORIES_EXPLANATION =
  "No categories set up yet — left in Other until your categories are saved";

/**
 * The category list the categoriser chooses from: exactly the user's real +
 * proto categories, narrowed by the embedding shortlist when there are enough
 * of them to warrant it. Never a generic starter list — a pick from a list the
 * user does not have cannot be filed. `shortlistedCategoryNames` is null when
 * shortlisting was skipped.
 */
async function resolveCategoryCandidates(
  deps: PriorityCategoryStepDeps,
  email: { from: string; fromName?: string; subject: string },
  userContext: UserContextInput | undefined,
  cleanedBody: string,
  userId: string | undefined,
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
  if (
    allCategories.length === 0 ||
    !deps.categoryShortlistService.isShortlistEnabled(allCategories.length)
  ) {
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
        userId,
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

export interface EmailCategoryChoice {
  assignedCategory: CategoryItem;
  categoryFields: Pick<
    PriorityResult,
    | "category"
    | "categoryNumber"
    | "categoryExplanation"
    | "categoryConfidence"
    | "protoCategorySuggestion"
    | "categoryDecisionProvider"
  >;
  instrumentation: CategoryInstrumentation;
  candidateCount: number;
  /** True when every categoriser call failed, so "Other" is a fallback, not a verdict. */
  modelUnavailable: boolean;
}

/** An "Other" choice made without a categoriser verdict (nothing to choose from, or every call failed). */
function otherWithoutVerdict(
  explanation: string,
  instrumentation: CategoryInstrumentation,
  modelUnavailable: boolean,
): EmailCategoryChoice {
  return {
    assignedCategory: { name: OTHER_CATEGORY_NAME },
    categoryFields: {
      category: OTHER_CATEGORY_NAME,
      categoryNumber: null,
      categoryExplanation: explanation,
      categoryConfidence: undefined,
      protoCategorySuggestion: undefined,
      categoryDecisionProvider: null,
    },
    instrumentation,
    candidateCount: 0,
    modelUnavailable,
  };
}

/**
 * Chooses the email's category with Jev (Gemini on uncertainty/failure) BEFORE priority scoring runs.
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
    /** Authoritative GitHub facts line for the thread's PR/issue, when any. */
    githubFacts?: string | null;
    userId?: string;
  },
): Promise<EmailCategoryChoice> {
  const { email, userContext, cleanedBody, githubFacts, userId } = options;
  const { candidates, instrumentation } = await resolveCategoryCandidates(
    deps,
    email,
    userContext,
    cleanedBody,
    userId,
  );
  if (candidates.length === 0) {
    return otherWithoutVerdict(
      NO_USER_CATEGORIES_EXPLANATION,
      instrumentation,
      false,
    );
  }

  const chosen = await categoriseWithEscalation(
    deps.llmCoreService,
    deps.logger,
    {
      subject: email.subject,
      senderName: email.fromName || email.from,
      senderEmail: email.from,
      summary: cleanedBody,
      categories: candidates,
      escalationModel: deps.escalationModel,
      githubFacts,
      userId,
    },
  );

  if (!chosen) {
    return {
      ...otherWithoutVerdict(
        CATEGORY_MODEL_UNAVAILABLE_EXPLANATION,
        instrumentation,
        true,
      ),
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
      categoryDecisionProvider: chosen.decisionProvider ?? null,
    },
    instrumentation,
    candidateCount: candidates.length,
    modelUnavailable: false,
  };
}
