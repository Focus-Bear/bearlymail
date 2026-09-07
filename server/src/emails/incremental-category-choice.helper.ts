import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import type { Email } from "../database/entities/email.entity";
import type { ProtoCategory } from "../database/entities/proto-category.entity";
import type { UserContext } from "../database/entities/user-context.entity";
import {
  buildEmailCategoryInputs,
  buildProtoCategoryInputs,
} from "../llm/category-context-input.helper";
import type { CategoryItem } from "../llm/category-shortlist.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { OTHER_CATEGORY_NAME } from "../llm/llm-categorise-summary";
import {
  chooseEmailCategory,
  type PriorityCategoryStepDeps,
} from "../llm/priority-category-step";
import { makeCategoryContextIdLookup } from "./category-lookup.helper";

/**
 * Section labels for the categoriser input. The model is told which part is
 * the whole-thread context and which is the message actually being
 * categorised, so a short new message (e.g. a QA verdict comment) is not
 * diluted by a long summary of the earlier conversation.
 */
const THREAD_SUMMARY_HEADING = "Thread summary:";
const LATEST_MESSAGE_HEADING = "Latest message (the one being categorised):";

export interface IncrementalCategoryCandidates {
  emailCategories: CategoryItem[];
  protoCategories: CategoryItem[];
}

/** The same candidate list the new-email priority pipeline offers the categoriser. */
export function buildIncrementalCategoryCandidates(
  userContexts: UserContext[],
  protoCategories: ProtoCategory[],
): IncrementalCategoryCandidates {
  return {
    emailCategories: buildEmailCategoryInputs(userContexts),
    protoCategories: buildProtoCategoryInputs(protoCategories),
  };
}

/**
 * The text the categoriser (and the embedding shortlist) sees for an
 * incremental re-categorisation: the refreshed thread summary PLUS the new
 * email's own cleaned body, capped exactly like the priority path.
 */
export function buildIncrementalCategoriserInput(
  summary: string,
  email: Pick<Email, "body">,
): string {
  const cleanedBody = cleanEmailContent(
    email.body,
    null,
    BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
  );
  if (!cleanedBody) {
    return summary;
  }
  return `${THREAD_SUMMARY_HEADING}\n${summary}\n\n${LATEST_MESSAGE_HEADING}\n${cleanedBody}`;
}

/** Discriminants of {@link IncrementalCategoryVerdict}. */
export const INCREMENTAL_VERDICT_KIND = {
  /** A real user category the model named, resolved to its context id. */
  CATEGORY: "category",
  /** The model said "Other". */
  OTHER: "other",
  /** The model named something that is not a user category (a proto category or a fabrication). */
  UNRESOLVED: "unresolved",
  /** Every categoriser call failed. */
  UNAVAILABLE: "unavailable",
} as const;

export type IncrementalCategoryVerdict =
  | {
      kind: typeof INCREMENTAL_VERDICT_KIND.CATEGORY;
      categoryId: string;
      categoryName: string;
      reasoning: string | null;
    }
  | { kind: typeof INCREMENTAL_VERDICT_KIND.OTHER; reasoning: string | null }
  | {
      kind: typeof INCREMENTAL_VERDICT_KIND.UNRESOLVED;
      categoryName: string;
      reasoning: string | null;
    }
  | { kind: typeof INCREMENTAL_VERDICT_KIND.UNAVAILABLE };

/**
 * Runs the main-path categoriser ({@link chooseEmailCategory}: descriptions,
 * proto categories, embedding shortlist, Nova→Gemini escalation) on the
 * incremental input and resolves its pick against the user's categories.
 */
export async function chooseIncrementalCategory(
  deps: PriorityCategoryStepDeps,
  args: {
    email: Pick<Email, "from" | "fromName" | "subject" | "body">;
    summary: string;
    userContexts: UserContext[];
    candidates: IncrementalCategoryCandidates;
    userId: string;
  },
): Promise<IncrementalCategoryVerdict> {
  const { email, summary, userContexts, candidates, userId } = args;
  const chosen = await chooseEmailCategory(deps, {
    email: {
      from: email.from || "",
      fromName: email.fromName || undefined,
      subject: email.subject || "",
    },
    userContext: candidates,
    cleanedBody: buildIncrementalCategoriserInput(summary, email),
    userId,
  });
  if (chosen.modelUnavailable) {
    return { kind: INCREMENTAL_VERDICT_KIND.UNAVAILABLE };
  }
  const { category: categoryName, categoryExplanation: reasoning } =
    chosen.categoryFields;
  if (categoryName === OTHER_CATEGORY_NAME) {
    return { kind: INCREMENTAL_VERDICT_KIND.OTHER, reasoning };
  }
  const categoryId = makeCategoryContextIdLookup(userContexts)(categoryName);
  if (!categoryId) {
    return {
      kind: INCREMENTAL_VERDICT_KIND.UNRESOLVED,
      categoryName,
      reasoning,
    };
  }
  return {
    kind: INCREMENTAL_VERDICT_KIND.CATEGORY,
    categoryId,
    categoryName,
    reasoning,
  };
}
