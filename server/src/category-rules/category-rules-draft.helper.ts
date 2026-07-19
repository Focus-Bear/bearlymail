import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { computeEmailHmac } from "../utils/hmac-email";
import type { EmailMetadata } from "./category-rules.types";
import { deriveExclusionsForCompositeRule } from "./category-rules-derive-exclusions.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

/** Service-owned operations the draft builder needs, injected to avoid coupling. */
export interface DraftCompositeSpecDeps {
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  llmCategoriesService: LLMCategoriesService;
  logger: Logger;
  normaliseSender: (raw: string) => string;
  countDistinctThreadsForSender: (
    userId: string,
    sender: string,
  ) => Promise<number>;
  normalizeCompositeSpecDto: (
    dto: CreateCompositeCategoryRuleDto,
  ) => CompositeCategoryRuleSpecV3;
  findCategoryId: (
    userId: string,
    categoryName: string,
  ) => Promise<string | null>;
}

export interface DraftCompositeSpecResult {
  spec: CompositeCategoryRuleSpec;
  categoryName: string;
  categoryId: string | null;
  /** False when exclusions could not be auto-derived (positive-only fallback). */
  exclusionsDerived: boolean;
}

/** Builds the LLM sample set: the current email plus recent emails from the sender. */
async function fetchSenderSamples(
  emailRepository: Repository<Email>,
  userId: string,
  sender: string,
  currentEmail: EmailMetadata,
): Promise<Array<{ subject: string; body: string }>> {
  const senderHmac = computeEmailHmac(sender);
  const sampleEmails = senderHmac
    ? await emailRepository.find({
        where: { userId, senderEmailHmac: senderHmac },
        order: { receivedAt: "DESC" },
        take: CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER,
        select: { subject: true, body: true },
      })
    : [];
  return [
    {
      subject: currentEmail.subject || "",
      body: currentEmail.bodyTextForMatch || "",
    },
    ...sampleEmails.map((sample) => ({
      subject: sample.subject || "",
      body: sample.body || "",
    })),
  ];
}

/**
 * Returns a copy of `spec` with the given LLM-suggested exclusions applied.
 * v1 specs have no exclusion fields, so they are returned unchanged. Empty
 * suggestion arrays are omitted rather than written as empty fields.
 */
function withSuggestedExclusions(
  spec: CompositeCategoryRuleSpec,
  subjectNotContainsAny: string[],
  bodyNotContainsAny: string[],
): CompositeCategoryRuleSpec {
  if (
    spec.v === 1 ||
    (subjectNotContainsAny.length === 0 && bodyNotContainsAny.length === 0)
  ) {
    return spec;
  }
  return {
    ...spec,
    ...(subjectNotContainsAny.length > 0 && { subjectNotContainsAny }),
    ...(bodyNotContainsAny.length > 0 && { bodyNotContainsAny }),
  };
}

/** True when the spec carries at least one subject/body exclusion phrase. */
function specHasExclusions(spec: CompositeCategoryRuleSpec): boolean {
  if (spec.v === 1) {
    return false;
  }
  return (
    (spec.subjectNotContainsAny?.length ?? 0) > 0 ||
    (spec.bodyNotContainsAny?.length ?? 0) > 0
  );
}

/** Builds the positive-only composite spec from LLM phrases; null when invalid. */
function buildPositiveSpec(
  normalizeCompositeSpecDto: DraftCompositeSpecDeps["normalizeCompositeSpecDto"],
  categoryName: string,
  llmResult: {
    fromMatchesAny: string[];
    subjectContainsAny: string[];
    bodyContainsAny: string[];
  },
  sender: string,
): CompositeCategoryRuleSpec | null {
  const senderMatchesAny =
    llmResult.fromMatchesAny.length > 0 ? llmResult.fromMatchesAny : [sender];
  try {
    return normalizeCompositeSpecDto({
      categoryName,
      senderMatchesAny,
      subjectContainsAny: llmResult.subjectContainsAny.slice(
        0,
        CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES,
      ),
      bodyContainsAny: llmResult.bodyContainsAny.slice(
        0,
        CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES,
      ),
    } as CreateCompositeCategoryRuleDto);
  } catch {
    return null;
  }
}

/**
 * User-draft fallback when real false positives yielded no exclusions: pre-fill
 * the review UI with the LLM's speculative exclusion suggestions (capped) so the
 * user has something to vet rather than an empty form. `exclusionsDerived` stays
 * false because these are not validated against real false positives — the UI
 * uses that flag to prompt the user to review them.
 */
function buildSuggestedExclusionsResult(
  positiveSpec: CompositeCategoryRuleSpec,
  llmResult: { subjectNotContainsAny: string[]; bodyNotContainsAny: string[] },
  categoryName: string,
  categoryId: string | null,
  allowLlmSuggestedExclusions: boolean,
): DraftCompositeSpecResult {
  const suggestedSubjectNot = allowLlmSuggestedExclusions
    ? llmResult.subjectNotContainsAny.slice(
        0,
        CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
      )
    : [];
  const suggestedBodyNot = allowLlmSuggestedExclusions
    ? llmResult.bodyNotContainsAny.slice(
        0,
        CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
      )
    : [];
  return {
    spec: withSuggestedExclusions(
      positiveSpec,
      suggestedSubjectNot,
      suggestedBodyNot,
    ),
    categoryName,
    categoryId,
    exclusionsDerived: false,
  };
}

/**
 * Turns the derive-exclusions outcome into a draft result. Trusts FP-derived
 * exclusions outright; for auto-generation accepts a clean pass and discards a
 * non-pass; for user drafts pre-fills the review UI with the LLM's speculative
 * exclusions when none were derived from real false positives.
 */
function resolveDraftOutcome(
  deps: Pick<DraftCompositeSpecDeps, "logger">,
  userId: string,
  params: {
    outcome: {
      passes: boolean;
      finalSpec: CompositeCategoryRuleSpec | null;
      truePositives: number;
      falsePositives: number;
    };
    positiveSpec: CompositeCategoryRuleSpec;
    llmResult: {
      subjectNotContainsAny: string[];
      bodyNotContainsAny: string[];
    };
    categoryName: string;
    categoryId: string | null;
    requireDerivedExclusions: boolean;
    allowLlmSuggestedExclusions: boolean;
  },
): DraftCompositeSpecResult | null {
  const { outcome, positiveSpec, llmResult, categoryName, categoryId } = params;
  const derivedSpec = outcome.passes ? outcome.finalSpec : null;

  // Real false positives produced exclusions — trust them, no review needed.
  if (derivedSpec && specHasExclusions(derivedSpec)) {
    return {
      spec: derivedSpec,
      categoryName,
      categoryId,
      exclusionsDerived: true,
    };
  }

  // Auto-generate: a pass with zero false positives is acceptable even without
  // exclusions; a non-pass is discarded.
  if (params.requireDerivedExclusions) {
    if (derivedSpec) {
      return {
        spec: derivedSpec,
        categoryName,
        categoryId,
        exclusionsDerived: true,
      };
    }
    deps.logger.log(
      `[CategoryRules] Skipping auto composite rule — validation failed after derive-exclusions (truePositives=${outcome.truePositives}, falsePositives=${outcome.falsePositives}) for user ${userId} category="${categoryName}"`,
    );
    return null;
  }

  // User draft: no exclusions were derived from real false positives — pre-fill
  // the review UI with the LLM's speculative suggestions instead of an empty
  // form. The create endpoint still requires the user to keep at least one.
  return buildSuggestedExclusionsResult(
    derivedSpec ?? positiveSpec,
    llmResult,
    categoryName,
    categoryId,
    params.allowLlmSuggestedExclusions,
  );
}

/**
 * Shared core for both the auto-generate and user-draft flows. Runs the LLM
 * phrase extraction + exclusion derivation and returns the candidate spec
 * WITHOUT persisting. `enforceThreadCountGate` applies the auto-only minimum
 * sender history check; `requireDerivedExclusions` returns null (rather than a
 * positive-only fallback) when exclusions can't be derived.
 */
export async function buildDraftCompositeSpec(
  deps: DraftCompositeSpecDeps,
  userId: string,
  email: EmailMetadata,
  categoryName: string,
  options: {
    enforceThreadCountGate: boolean;
    requireDerivedExclusions: boolean;
    /**
     * When true (user-initiated drafts), fall back to the LLM's speculative
     * exclusion suggestions if none could be derived from real false positives.
     * The user reviews them before saving. Auto-generation leaves this false so
     * only FP-derived exclusions are ever applied.
     */
    allowLlmSuggestedExclusions?: boolean;
  },
): Promise<DraftCompositeSpecResult | null> {
  const trimmedCategory = categoryName?.trim();
  if (!trimmedCategory) {
    return null;
  }
  const sender = deps.normaliseSender(email.from);
  if (!sender) {
    return null;
  }

  // Issue #1714: only auto-generate rules for senders with enough thread
  // history. User-initiated drafts skip this gate — the user asked explicitly.
  if (options.enforceThreadCountGate) {
    const threadCount = await deps.countDistinctThreadsForSender(
      userId,
      sender,
    );
    if (threadCount < CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT) {
      deps.logger.log(
        `[CategoryRules] Skipping auto composite rule — sender "${sender}" has only ${threadCount} threads (< ${CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT}) for user ${userId}`,
      );
      return null;
    }
  }

  const samples = await fetchSenderSamples(
    deps.emailRepository,
    userId,
    sender,
    email,
  );
  const llmResult =
    await deps.llmCategoriesService.suggestRulesFromEmailSamples(
      trimmedCategory,
      [sender],
      samples,
    );
  if (
    !llmResult ||
    llmResult.subjectContainsAny.length === 0 ||
    llmResult.bodyContainsAny.length === 0
  ) {
    deps.logger.log(
      `[CategoryRules] No usable LLM phrases when drafting composite rule for user ${userId}`,
    );
    return null;
  }

  const positiveSpec = buildPositiveSpec(
    deps.normalizeCompositeSpecDto,
    trimmedCategory,
    llmResult,
    sender,
  );
  if (!positiveSpec) {
    return null;
  }

  const categoryId = await deps.findCategoryId(userId, trimmedCategory);
  const outcome = await deriveExclusionsForCompositeRule({
    emailThreadRepository: deps.emailThreadRepository,
    llmCategoriesService: deps.llmCategoriesService,
    normaliseSender: deps.normaliseSender,
    userId,
    positiveSpec,
    categoryName: trimmedCategory,
    categoryId,
    logger: deps.logger,
  });
  return resolveDraftOutcome(deps, userId, {
    outcome,
    positiveSpec,
    llmResult,
    categoryName: trimmedCategory,
    categoryId,
    requireDerivedExclusions: options.requireDerivedExclusions,
    allowLlmSuggestedExclusions: options.allowLlmSuggestedExclusions ?? false,
  });
}
