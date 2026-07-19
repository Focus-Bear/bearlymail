import { Logger } from "@nestjs/common";

import {
  findNearestExistingCategory,
  NearestCategory,
} from "./category-duplication.helper";

/** One shortlist candidate the smart model was shown, with provenance. */
export interface ShortlistCandidateLog {
  name: string;
  /** Embedding cosine score, or null for platform-pinned entries. */
  score: number | null;
  pinned: boolean;
}

/** Structured fields for one category-resolution trace line. */
export interface CategoryResolutionLog {
  userId: string;
  threadId: string | null;
  /** What the LLM actually returned (the field we never used to record). */
  rawLlmCategory: string | null;
  /** What canonicaliseCategoryName mapped it to before lookup. */
  canonicalised: string | null;
  finalCategory: string | null;
  resolvedToRealCategory: boolean;
  usedProtoMatch: boolean;
  protoCategoryId: string | null;
  // ── Instrumentation (all optional; absent on paths that don't compute them) ──
  /** The raw 1-based categoryNumber the LLM chose (0 = Other), before index resolution. */
  categoryNumber?: number | null;
  /** Confidence the LLM assigned to its category pick. */
  categoryConfidence?: string | null;
  /** Total categories (real + proto) the user had at decision time. */
  totalCategoryCount?: number | null;
  /** Proto categories the user had at decision time. */
  protoCategoryCount?: number | null;
  /** How many categories the smart model was actually shown (post-shortlist). */
  shortlistSize?: number | null;
  /** The shortlisted candidates with score + pinned provenance. */
  shortlistCandidates?: ShortlistCandidateLog[] | null;
  /** Proto name the LLM suggested when it chose "Other". */
  protoSuggestionName?: string | null;
  /** Nearest existing real category to a created/matched proto — the sprawl signal. */
  protoDuplicationOf?: NearestCategory | null;
}

/**
 * Emits a `category_resolution` log line so category mis-routing is diagnosable
 * from CloudWatch without decrypting the DB. The biggest blind spot until now
 * was that the raw LLM category was never recorded — divergence between
 * `rawLlmCategory` and `finalCategory` (especially with `usedProtoMatch=true`)
 * is the signal for a fuzzy mis-route. The instrumentation fields additionally
 * expose what the model was shown (shortlist + scores), what it picked
 * (categoryNumber/confidence), and whether a proto duplicates an existing
 * category (`protoDuplicationOf.flagged`) — so taxonomy sprawl is measurable.
 */
export function logCategoryResolution(
  logger: Logger,
  fields: CategoryResolutionLog,
): void {
  logger.log(JSON.stringify({ event: "category_resolution", ...fields }));
}

/** Inputs to {@link buildCategoryResolutionLog}, gathered from the resolver. */
export interface CategoryResolutionLogInput {
  userId: string;
  threadId: string | null;
  llmResult: {
    category?: string;
    categoryNumber?: number | null;
    categoryConfidence?: string | null;
    totalCategoryCount?: number;
    protoCategoryCount?: number;
    shortlistedCategoryNames?: string[] | null;
    shortlistCandidates?: ShortlistCandidateLog[] | null;
    protoCategorySuggestion?: { name: string };
  };
  /** The LLM category after canonicalisation, before lookup. */
  canonicalisedCategory: string | null;
  resolved: {
    finalCategory: string | null;
    categoryId: string | null;
    protoCategoryId: string | null;
  };
  usedProtoMatch: boolean;
  /** Real (non-proto) category names, for the proto-duplication check. */
  knownCategoryNames: string[];
}

/**
 * Assembles a {@link CategoryResolutionLog} from the resolver's state, including
 * the proto-duplication signal (computed only when the decision landed on a
 * proto). Kept out of the resolver to hold its complexity/length down.
 */
export function buildCategoryResolutionLog(
  input: CategoryResolutionLogInput,
): CategoryResolutionLog {
  const { llmResult, resolved } = input;
  const protoSuggestionName = llmResult.protoCategorySuggestion?.name ?? null;
  const protoTarget =
    resolved.protoCategoryId !== null
      ? (protoSuggestionName ?? input.canonicalisedCategory ?? null)
      : null;
  return {
    userId: input.userId,
    threadId: input.threadId,
    rawLlmCategory: llmResult.category ?? null,
    canonicalised: input.canonicalisedCategory,
    finalCategory: resolved.finalCategory,
    resolvedToRealCategory: resolved.categoryId !== null,
    usedProtoMatch: input.usedProtoMatch,
    protoCategoryId: resolved.protoCategoryId,
    categoryNumber: llmResult.categoryNumber ?? null,
    categoryConfidence: llmResult.categoryConfidence ?? null,
    totalCategoryCount: llmResult.totalCategoryCount ?? null,
    protoCategoryCount: llmResult.protoCategoryCount ?? null,
    shortlistSize: llmResult.shortlistedCategoryNames?.length ?? null,
    shortlistCandidates: llmResult.shortlistCandidates ?? null,
    protoSuggestionName,
    protoDuplicationOf:
      protoTarget !== null
        ? findNearestExistingCategory(protoTarget, input.knownCategoryNames)
        : null,
  };
}
