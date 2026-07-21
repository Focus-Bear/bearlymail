import type {
  CategoryDecisionAnalyzedEmail,
  CategoryDecisionStep,
  CategoryDecisionTrace,
  CategoryDecisionTrigger,
  CategoryDecisionWriter,
} from "./category-decision-trace.types";
import { buildHonestCategoryExplanation } from "./category-explanation.helper";

/**
 * Assembles the full decision trace from the ordered steps and the final
 * outcome. `decidedAt` is stamped by the caller (passed in) so this stays a
 * pure builder.
 */
export function buildCategoryDecisionTrace(args: {
  decidedAt: string;
  source: CategoryDecisionTrace["source"];
  writtenBy?: CategoryDecisionWriter;
  trigger?: CategoryDecisionTrigger;
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
  finalCategory: string | null;
  finalCategoryId: string | null;
  steps: CategoryDecisionStep[];
}): CategoryDecisionTrace {
  return {
    decidedAt: args.decidedAt,
    source: args.source,
    ...(args.writtenBy ? { writtenBy: args.writtenBy } : {}),
    ...(args.trigger ? { trigger: args.trigger } : {}),
    ...(args.analyzedEmail ? { analyzedEmail: args.analyzedEmail } : {}),
    finalCategory: args.finalCategory,
    finalCategoryId: args.finalCategoryId,
    steps: args.steps,
  };
}

/**
 * Builds the analysed-email stamp for a decision trace from the email a
 * pipeline step actually evaluated. Pure; latest-in-thread info is optional
 * because not every writer can determine it cheaply.
 */
export function analyzedEmailFromEmail(
  email: { id: string; receivedAt?: Date | null },
  contentSource?: CategoryDecisionAnalyzedEmail["contentSource"],
): CategoryDecisionAnalyzedEmail {
  return {
    emailId: email.id,
    receivedAt: email.receivedAt ? email.receivedAt.toISOString() : null,
    ...(contentSource ? { contentSource } : {}),
  };
}

interface LocalModelStepPrediction {
  category: string;
  family: string;
  categoryConfidence: number;
  categoryFallback: boolean;
  priorityBand: string;
}

/** The `detail` line for the local-model step, covering the resolved category
 * and the two unresolved-category cases (confident-no-match and unconfident),
 * both of which now await summary re-categorisation rather than dead-ending in
 * "Other" (split out to keep {@link localModelDecisionTrace} free of nesting). */
function localModelStepDetail(
  prediction: LocalModelStepPrediction,
  categoryResolved: boolean,
): string {
  if (categoryResolved) {
    return `Local model confident: category "${prediction.category}" (${Math.round(
      prediction.categoryConfidence * 100,
    )}%), family "${prediction.family}", priority band "${prediction.priorityBand}".`;
  }
  if (prediction.categoryFallback) {
    return `Local model applied priority band "${prediction.priorityBand}" (confident); category uncertain — awaiting re-categorisation from the thread summary.`;
  }
  return `Local model applied priority band "${prediction.priorityBand}" (confident); category "${prediction.category}" (family "${prediction.family}") matched no user category — awaiting re-categorisation from the thread summary.`;
}

/** Trace for the confident local-model promotion path: model pick wins.
 *
 * `finalCategoryId` may be null in two cases (both distinguished for the trace
 * by `prediction.categoryFallback`, but treated the same downstream):
 * - confident category that maps to no real user category, or
 * - UNconfident category (`categoryFallback=true`).
 * In both, priority lands and the thread sits in "Other" only until the
 * background summary triggers the cheap `categorise_summary` re-categorisation. */
export function localModelDecisionTrace(args: {
  decidedAt: string;
  prediction: {
    category: string;
    family: string;
    categoryConfidence: number;
    categoryFallback: boolean;
    priorityBand: string;
  };
  categoryId: string | null;
  finalCategoryId: string | null;
  trigger?: CategoryDecisionTrigger;
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
}): CategoryDecisionTrace {
  const { prediction } = args;
  const categoryResolved = args.finalCategoryId != null;
  return buildCategoryDecisionTrace({
    decidedAt: args.decidedAt,
    source: "local",
    writtenBy: "local-model",
    trigger: args.trigger,
    analyzedEmail: args.analyzedEmail,
    finalCategory: categoryResolved ? prediction.category : null,
    finalCategoryId: args.finalCategoryId,
    steps: [
      {
        step: "local-model",
        outcome: "applied",
        category: categoryResolved ? prediction.category : null,
        categoryId: args.categoryId,
        detail: localModelStepDetail(prediction, categoryResolved),
      },
    ],
  });
}

/** Trace for the deterministic-rule path: learned rule wins. */
export function deterministicRuleDecisionTrace(args: {
  decidedAt: string;
  categoryName: string;
  ruleCategoryId: string | null;
  finalCategoryId: string | null;
  trigger?: CategoryDecisionTrigger;
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
}): CategoryDecisionTrace {
  return buildCategoryDecisionTrace({
    decidedAt: args.decidedAt,
    source: "rule",
    writtenBy: "deterministic-rule",
    trigger: args.trigger,
    analyzedEmail: args.analyzedEmail,
    finalCategory: args.categoryName,
    finalCategoryId: args.finalCategoryId,
    steps: [
      {
        step: "deterministic-rule",
        outcome: "applied",
        category: args.categoryName,
        categoryId: args.ruleCategoryId,
        detail: `Learned deterministic rule matched category "${args.categoryName}".`,
      },
    ],
  });
}

/**
 * Assembles everything the LLM priority path needs to persist its category:
 * the final categoryId, the decision trace, and the honest category
 * explanation. Pure.
 */
export function buildLlmCategoryOutcome(args: {
  decidedAt: string;
  finalCategory: string | null;
  llmCategoryId: string | null;
  protoCategoryId: string | null;
  categoryExplanation: string | null;
  rawLlmCategory: string | null;
  llmProtoSuggestionName: string | null;
  trigger?: CategoryDecisionTrigger;
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
}): {
  categoryId: string | null;
  decisionTrace: CategoryDecisionTrace;
  resolvedCategoryExplanation: string;
} {
  const categoryId = args.llmCategoryId;
  const decisionTrace = llmDecisionTrace({
    decidedAt: args.decidedAt,
    finalCategory: args.finalCategory,
    llmCategoryId: args.llmCategoryId,
    protoCategoryId: args.protoCategoryId,
    finalCategoryId: categoryId,
    trigger: args.trigger,
    analyzedEmail: args.analyzedEmail,
  });
  const protoSuggestedName =
    args.llmProtoSuggestionName ??
    (args.rawLlmCategory && args.rawLlmCategory !== "Other"
      ? args.rawLlmCategory
      : null);
  const resolvedCategoryExplanation = buildHonestCategoryExplanation({
    explanation: args.categoryExplanation,
    finalCategory: args.finalCategory,
    categoryId,
    protoCategoryId: args.protoCategoryId,
    protoSuggestedName,
  });
  return { categoryId, decisionTrace, resolvedCategoryExplanation };
}

/** Trace for the LLM priority path: LLM/proto pick wins. */
export function llmDecisionTrace(args: {
  decidedAt: string;
  finalCategory: string | null;
  llmCategoryId: string | null;
  protoCategoryId: string | null;
  finalCategoryId: string | null;
  trigger?: CategoryDecisionTrigger;
  analyzedEmail?: CategoryDecisionAnalyzedEmail;
}): CategoryDecisionTrace {
  return buildCategoryDecisionTrace({
    decidedAt: args.decidedAt,
    source: "priority",
    writtenBy: "llm-refine",
    trigger: args.trigger,
    analyzedEmail: args.analyzedEmail,
    finalCategory: args.finalCategory,
    finalCategoryId: args.finalCategoryId,
    steps: [
      {
        step: "llm",
        outcome: "applied",
        category: args.finalCategory,
        categoryId: args.llmCategoryId,
        detail: args.protoCategoryId
          ? `LLM categorisation resolved to proto-category (proto id ${args.protoCategoryId}).`
          : `LLM categorisation resolved to "${args.finalCategory ?? "Other"}".`,
      },
    ],
  });
}
