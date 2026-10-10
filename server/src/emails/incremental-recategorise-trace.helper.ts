import type { Email } from "../database/entities/email.entity";
import { OTHER_CATEGORY_NAME } from "../llm/llm-categorise-summary";
import {
  analyzedEmailFromEmail,
  buildCategoryDecisionTrace,
} from "./category-decision-trace.helper";
import type {
  CategoryDecisionStep,
  CategoryDecisionTrace,
} from "./category-decision-trace.types";
import {
  INCREMENTAL_VERDICT_KIND,
  type IncrementalCategoryVerdict,
} from "./incremental-category-choice.helper";

const MODEL_UNAVAILABLE_DETAIL =
  "Category model unavailable for the new message — existing category kept.";

type IncrementalTraceArgs = {
  decidedAt: string;
  /** The NEW email that was evaluated — moves the debug panel's "Categorised from" marker. */
  email: Pick<Email, "id" | "receivedAt">;
  finalCategory: string | null;
  finalCategoryId: string | null;
  step: CategoryDecisionStep;
};

/** Trace for an LLM-driven incremental decision (input: thread summary + new email body). */
export function incrementalLlmTrace(
  args: IncrementalTraceArgs,
): CategoryDecisionTrace {
  return buildCategoryDecisionTrace({
    decidedAt: args.decidedAt,
    source: "priority",
    writtenBy: "incremental",
    trigger: "new-email",
    analyzedEmail: analyzedEmailFromEmail(
      args.email,
      "thread-summary-and-body",
    ),
    finalCategory: args.finalCategory,
    finalCategoryId: args.finalCategoryId,
    steps: [args.step],
  });
}

/** Trace for a deterministic rule that matched the new email before the LLM ran. */
export function incrementalRuleTrace(args: {
  decidedAt: string;
  email: Pick<Email, "id" | "receivedAt">;
  categoryName: string;
  categoryId: string;
}): CategoryDecisionTrace {
  return buildCategoryDecisionTrace({
    decidedAt: args.decidedAt,
    source: "rule",
    writtenBy: "incremental",
    trigger: "new-email",
    analyzedEmail: analyzedEmailFromEmail(args.email, "email-metadata"),
    finalCategory: args.categoryName,
    finalCategoryId: args.categoryId,
    steps: [
      {
        step: "deterministic-rule",
        outcome: "applied",
        category: args.categoryName,
        categoryId: args.categoryId,
        detail:
          "Deterministic rule matched the new email during incremental re-categorisation (LLM not consulted).",
      },
    ],
  });
}

/** The LLM step when its pick is the category the thread already has. */
export function unchangedLlmStep(args: {
  categoryName: string;
  categoryId: string;
  reasoning: string | null;
}): CategoryDecisionStep {
  const reasoning = args.reasoning ? ` ${args.reasoning}` : "";
  return {
    step: "llm",
    outcome: "applied",
    category: args.categoryName,
    categoryId: args.categoryId,
    detail: `Re-evaluated on the new message: still "${args.categoryName}" (unchanged).${reasoning}`,
  };
}

/**
 * The LLM step when its verdict could not move the thread — "Other", a name
 * that is not a user category (e.g. a proto category), or a failed call — and
 * the existing category was kept (a categorised thread is never demoted).
 */
export function keptLlmStep(
  verdict: Exclude<
    IncrementalCategoryVerdict,
    { kind: typeof INCREMENTAL_VERDICT_KIND.CATEGORY }
  >,
  keptCategoryName: string,
): CategoryDecisionStep {
  if (verdict.kind === INCREMENTAL_VERDICT_KIND.UNAVAILABLE) {
    return {
      step: "llm",
      outcome: "skipped",
      category: null,
      categoryId: null,
      detail: MODEL_UNAVAILABLE_DETAIL,
    };
  }
  const reasoning = verdict.reasoning ? ` ${verdict.reasoning}` : "";
  const picked =
    verdict.kind === INCREMENTAL_VERDICT_KIND.OTHER
      ? `returned "${OTHER_CATEGORY_NAME}"`
      : `picked "${verdict.categoryName}", which is not one of the user's categories`;
  return {
    step: "llm",
    outcome: "suppressed",
    category:
      verdict.kind === INCREMENTAL_VERDICT_KIND.OTHER
        ? OTHER_CATEGORY_NAME
        : verdict.categoryName,
    categoryId: null,
    detail: `Model ${picked} for the new message; existing category "${keptCategoryName}" kept (never demoted to Other).${reasoning}`,
  };
}
