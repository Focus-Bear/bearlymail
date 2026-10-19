import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import type { AiDecisionProvider } from "../constants/ai-decision-provider.constants";
import type { CategoryDecisionAnalyzedEmail } from "../emails/category-decision-trace.types";
import type { ShortlistCandidate } from "./category-shortlist.service";

export type CategoryConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Category-resolution instrumentation captured per email and attached to the result. */
export type CategoryInstrumentation = {
  shortlistedCategoryNames: string[] | null;
  shortlistCandidates: ShortlistCandidate[] | null;
  totalCategoryCount: number;
  protoCategoryCount: number;
};

export type PriorityResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number | undefined;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  /** Confidence level the LLM assigned to its category decision. */
  categoryConfidence?: CategoryConfidence;
  /** Raw 1-based categoryNumber the LLM returned (0 = Other), before index resolution. Null when the model returned a name instead. Instrumentation only. */
  categoryNumber?: number | null;
  reasoning: string;
  protoCategorySuggestion?: {
    name: string;
    description: string;
    /** The model's justification for a NEW category over an existing one:
     * names the closest existing categories it considered and why each was not
     * a fit. Persisted so false "Other"s can be reviewed to tune the prompt. */
    reasoning?: string;
  };
  /** Category names that were shortlisted and passed to the smart model. Null when shortlisting was skipped (category count below threshold). */
  shortlistedCategoryNames: string[] | null;
  /** Per-candidate shortlist provenance (embedding score + platform-pinned flag), for instrumentation. Null when shortlisting was skipped. */
  shortlistCandidates?: ShortlistCandidate[] | null;
  /** Total categories (real + proto) the user had at decision time. Instrumentation only. */
  totalCategoryCount?: number;
  /** Proto categories the user had at decision time. Instrumentation only. */
  protoCategoryCount?: number;
  /**
   * Snapshot of the deterministic-rule step, attached by the single-email
   * refiner after analysis so it can be persisted for the category-debug view.
   * Not produced by `analyzePriority` itself.
   */
  categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
  /** What content the LLM saw (AI summary vs cleaned body); attached by the single-email refiner, not by `analyzePriority`. */
  analyzedContentSource?: CategoryDecisionAnalyzedEmail["contentSource"];
  /**
   * The GitHub facts line the category step was given, for the decision trace.
   * Attached by the single-email refiner, not by `analyzePriority`.
   */
  githubFactsTrace?: string;
  /** Engine (Jev or LLM vendor) that picked the category; null when unknown. */
  categoryDecisionProvider?: AiDecisionProvider | null;
  /** Engine (Jev or LLM vendor) that answered the priority prompt; null when unknown. */
  priorityDecisionProvider?: AiDecisionProvider | null;
};

export type BatchPriorityResult = PriorityResult & {
  isFallback: boolean;
  /** True when triage determined no reanalysis is needed (preserve existing scores). False for LLM analysis failures. */
  triagePreserved?: boolean;
};
