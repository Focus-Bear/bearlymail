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
import type {
  NotificationSubtypeBreakdownEntry,
  RuleSanitySampleEmail,
} from "../llm/llm-rule-sanity";
import { computeEmailHmac } from "../utils/hmac-email";
import type { EmailMetadata } from "./category-rules.types";
import {
  augmentExclusionsForQaTemplates,
  deriveExclusionsForCompositeRule,
  fetchValidationWindows,
  ValidationWindows,
} from "./category-rules-derive-exclusions.helper";
import { isGithubNotificationSubtype } from "./category-rules-notification-subtype.helper";
import {
  buildNotificationSubtypeBreakdown,
  selectCleanSubtypes,
} from "./category-rules-subtype-breakdown.helper";
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
  /** Rolling-24h cap on auto rule-generation LLM spend; see AUTO_GENERATE_MAX_LLM_ATTEMPTS_PER_DAY. */
  hasExhaustedAutoGenerationBudget: (userId: string) => Promise<boolean>;
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
  /**
   * The emails the LLM phrases were extracted from (current email + recent
   * sender mail), capped — shown to the sanity reviewer so it can judge the
   * rule against what the sender actually sends.
   */
  sampleEmails: RuleSanitySampleEmail[];
  /**
   * Per-sub-stream TP/FP evidence for a GitHub seed (whichever draft path won),
   * shown to the sanity reviewer so it can judge actor/event fit.
   */
  subtypeBreakdown?: NotificationSubtypeBreakdownEntry[];
}

/** What the auto-generation gates need from a draft to review and persist it. */
export type AutoRuleCandidate = Pick<
  DraftCompositeSpecResult,
  "spec" | "categoryName" | "categoryId" | "sampleEmails" | "subtypeBreakdown"
>;

export interface DraftCompositeSpecOptions {
  enforceThreadCountGate: boolean;
  requireDerivedExclusions: boolean;
  /**
   * When true (user-initiated drafts), fall back to the LLM's speculative
   * exclusion suggestions if none could be derived from real false positives.
   * The user reviews them before saving. Auto-generation leaves this false so
   * only FP-derived exclusions are ever applied.
   */
  allowLlmSuggestedExclusions?: boolean;
  /**
   * When true (auto-generation), a GitHub seed first tries a STRUCTURAL rule —
   * sender + the set of clean sub-streams seen among the category's own mail,
   * no phrases — before falling back to LLM phrase drafting. Off for user
   * drafts, whose review UI only round-trips phrases.
   */
  preferStructuralSubtypeSet?: boolean;
}

/** Everything the draft paths share once the gates and category lookup are done. */
interface DraftContext {
  deps: DraftCompositeSpecDeps;
  userId: string;
  email: EmailMetadata;
  sender: string;
  categoryName: string;
  categoryId: string | null;
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

function toSanitySamples(
  sender: string,
  samples: Array<{ subject: string; body: string }>,
): RuleSanitySampleEmail[] {
  return samples
    .slice(0, CATEGORY_RULE_COMPOSITE.SANITY_CHECK_MAX_SAMPLE_EMAILS)
    .map((sample) => ({ from: sender, ...sample }));
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
  notificationSubtype: string | undefined,
): CompositeCategoryRuleSpec | null {
  const senderMatchesAny =
    llmResult.fromMatchesAny.length > 0 ? llmResult.fromMatchesAny : [sender];
  try {
    // Structured sub-stream signal: pin the rule to this email's notification
    // sub-stream (e.g. github:pr:comment:human, github:ci:run_failed) so
    // sibling sub-categories that share the same sender and similar wording
    // don't become false positives. Passed INTO the normaliser (not spread on
    // afterwards) so it can relax the subject/body-phrase requirement for
    // structural rules — a subtype makes phrases optional refinements.
    // Undefined for senders with no resolvable sub-stream, in which case
    // phrases stay mandatory.
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
      ...(notificationSubtype && { notificationSubtype }),
    } as CreateCompositeCategoryRuleDto);
  } catch {
    return null;
  }
}

/**
 * The structural candidate for a GitHub seed: sender + the clean sub-stream
 * set, no phrases. Null when the set is empty or the spec fails validation.
 */
function buildStructuralSpec(
  normalizeCompositeSpecDto: DraftCompositeSpecDeps["normalizeCompositeSpecDto"],
  categoryName: string,
  sender: string,
  notificationSubtypeAny: string[],
): CompositeCategoryRuleSpec | null {
  if (notificationSubtypeAny.length === 0) {
    return null;
  }
  try {
    return normalizeCompositeSpecDto({
      categoryName,
      senderMatchesAny: [sender],
      subjectContainsAny: [],
      bodyContainsAny: [],
      notificationSubtypeAny,
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
): Omit<DraftCompositeSpecResult, "sampleEmails"> {
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
): Omit<DraftCompositeSpecResult, "sampleEmails"> | null {
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
 * Auto-generation only: the user's rolling-24h LLM budget must not be spent
 * and the sender must have enough thread history for a rule to be worth it.
 */
async function passesAutoGenerationGates(
  deps: DraftCompositeSpecDeps,
  userId: string,
  sender: string,
  categoryName: string,
): Promise<boolean> {
  if (await deps.hasExhaustedAutoGenerationBudget(userId)) {
    deps.logger.log(
      `[CategoryRules] Skipping auto composite rule — user ${userId} reached ${CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MAX_LLM_ATTEMPTS_PER_DAY} rule-generation LLM attempts in 24h (category="${categoryName}")`,
    );
    return false;
  }
  const threadCount = await deps.countDistinctThreadsForSender(userId, sender);
  if (threadCount < CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT) {
    deps.logger.log(
      `[CategoryRules] Skipping auto composite rule — sender "${sender}" has only ${threadCount} threads (< ${CATEGORY_RULE_COMPOSITE.AUTO_GENERATE_MIN_THREAD_COUNT}) for user ${userId}`,
    );
    return false;
  }
  return true;
}

/**
 * STRUCTURAL-FIRST path for GitHub seeds. Derives the sub-stream set from the
 * category's own recent mail from this sender (every fine subtype with ≥1 true
 * positive and 0 false positives, plus the seed's own), drafts sender + that
 * set with no phrases, and validates it against the same windows. Returns null
 * — and the breakdown, for the reviewer — when no clean set exists or the
 * candidate fails validation, so the caller can fall back to phrase drafting.
 * Deterministic: no LLM call.
 */
async function draftStructuralSubtypeRule(
  context: DraftContext,
  seedSubtype: string,
  windows: ValidationWindows,
): Promise<{
  draft: Omit<DraftCompositeSpecResult, "sampleEmails"> | null;
  breakdown: NotificationSubtypeBreakdownEntry[];
}> {
  const { deps, userId, sender, categoryName, categoryId } = context;
  const breakdown = buildNotificationSubtypeBreakdown({
    categoryRows: windows.categoryRows,
    broadRows: windows.broadRows,
    senderPatterns: [sender],
    normaliseSender: deps.normaliseSender,
    targetCategoryId: categoryId,
  });
  const subtypes = selectCleanSubtypes(breakdown, seedSubtype);
  const structuralSpec = buildStructuralSpec(
    deps.normalizeCompositeSpecDto,
    categoryName,
    sender,
    subtypes,
  );
  if (!structuralSpec) {
    deps.logger.log(
      `[CategoryRules][structural] No clean sub-stream set for seed=${seedSubtype} (breakdown=${breakdown.length} sub-streams) — falling back to phrase drafting for user ${userId} category="${categoryName}"`,
    );
    return { draft: null, breakdown };
  }

  const guardedSpec = augmentExclusionsForQaTemplates(
    structuralSpec,
    categoryName,
  );
  const outcome = await deriveExclusionsForCompositeRule({
    emailThreadRepository: deps.emailThreadRepository,
    llmCategoriesService: deps.llmCategoriesService,
    normaliseSender: deps.normaliseSender,
    userId,
    positiveSpec: guardedSpec,
    categoryName,
    categoryId,
    logger: deps.logger,
    windows,
  });
  deps.logger.log(
    `[CategoryRules][structural] seed=${seedSubtype} pinned=[${subtypes.join(",")}] TP=${outcome.truePositives} FP=${outcome.falsePositives} passes=${outcome.passes} for user ${userId} category="${categoryName}"`,
  );
  if (!outcome.passes || !outcome.finalSpec) {
    return { draft: null, breakdown };
  }
  return {
    draft: {
      spec: outcome.finalSpec,
      categoryName,
      categoryId,
      exclusionsDerived: true,
    },
    breakdown,
  };
}

/**
 * PHRASE path: LLM-extracted subject/body phrases (plus the seed's subtype pin
 * when one resolved), validated and refined with FP-derived exclusions.
 */
async function draftPhraseRule(
  context: DraftContext,
  samples: Array<{ subject: string; body: string }>,
  options: DraftCompositeSpecOptions,
  windows: ValidationWindows | undefined,
): Promise<Omit<DraftCompositeSpecResult, "sampleEmails"> | null> {
  const { deps, userId, email, sender, categoryName, categoryId } = context;
  const llmResult =
    await deps.llmCategoriesService.suggestRulesFromEmailSamples(
      categoryName,
      [sender],
      samples,
      userId,
      email.notificationSubtype,
    );
  // Structural rules (a resolved notification sub-stream) can persist on
  // sender + subtype alone, so phrases are optional for them. For
  // non-structural senders phrases remain mandatory: without them the rule
  // would be just "sender → category", which is too broad.
  const hasStructuralSubtype = Boolean(email.notificationSubtype);
  const phrasesMissing =
    !llmResult ||
    llmResult.subjectContainsAny.length === 0 ||
    llmResult.bodyContainsAny.length === 0;
  if (!llmResult || (phrasesMissing && !hasStructuralSubtype)) {
    deps.logger.log(
      `[CategoryRules] No usable LLM phrases when drafting composite rule for user ${userId}`,
    );
    return null;
  }

  const positiveSpec = buildPositiveSpec(
    deps.normalizeCompositeSpecDto,
    categoryName,
    llmResult,
    sender,
    email.notificationSubtype,
  );
  if (!positiveSpec) {
    return null;
  }

  // Exclude structured QA test comments from non-QA GitHub categories up front,
  // so the TP/FP validation below already treats QA artefacts as non-matches and
  // the persisted rule never re-files them. No-op for non-GitHub rules and QA
  // categories.
  const guardedSpec = augmentExclusionsForQaTemplates(
    positiveSpec,
    categoryName,
  );
  const outcome = await deriveExclusionsForCompositeRule({
    emailThreadRepository: deps.emailThreadRepository,
    llmCategoriesService: deps.llmCategoriesService,
    normaliseSender: deps.normaliseSender,
    userId,
    positiveSpec: guardedSpec,
    categoryName,
    categoryId,
    logger: deps.logger,
    windows,
  });
  return resolveDraftOutcome(deps, userId, {
    outcome,
    positiveSpec: guardedSpec,
    llmResult,
    categoryName,
    categoryId,
    requireDerivedExclusions: options.requireDerivedExclusions,
    allowLlmSuggestedExclusions: options.allowLlmSuggestedExclusions ?? false,
  });
}

/**
 * Shared core for both the auto-generate and user-draft flows. Returns the
 * candidate spec WITHOUT persisting. For a GitHub seed under
 * `preferStructuralSubtypeSet` the structural sub-stream-set draft is tried
 * first (LLM-free); otherwise — or when it yields nothing — the LLM phrase
 * path runs. `enforceThreadCountGate` applies the auto-only minimum sender
 * history check; `requireDerivedExclusions` returns null (rather than a
 * positive-only fallback) when exclusions can't be derived.
 */
export async function buildDraftCompositeSpec(
  deps: DraftCompositeSpecDeps,
  userId: string,
  email: EmailMetadata,
  categoryName: string,
  options: DraftCompositeSpecOptions,
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
  if (
    options.enforceThreadCountGate &&
    !(await passesAutoGenerationGates(deps, userId, sender, trimmedCategory))
  ) {
    return null;
  }

  const categoryId = await deps.findCategoryId(userId, trimmedCategory);
  const context: DraftContext = {
    deps,
    userId,
    email,
    sender,
    categoryName: trimmedCategory,
    categoryId,
  };
  const samples = await fetchSenderSamples(
    deps.emailRepository,
    userId,
    sender,
    email,
  );
  const sampleEmails = toSanitySamples(sender, samples);

  const seedSubtype = email.notificationSubtype;
  const structuralFirst =
    Boolean(options.preferStructuralSubtypeSet) &&
    isGithubNotificationSubtype(seedSubtype);
  let windows: ValidationWindows | undefined;
  let subtypeBreakdown: NotificationSubtypeBreakdownEntry[] | undefined;
  if (structuralFirst && seedSubtype) {
    windows = await fetchValidationWindows(
      deps.emailThreadRepository,
      userId,
      categoryId,
    );
    const structural = await draftStructuralSubtypeRule(
      context,
      seedSubtype,
      windows,
    );
    subtypeBreakdown = structural.breakdown;
    if (structural.draft) {
      return { ...structural.draft, sampleEmails, subtypeBreakdown };
    }
  }

  const draft = await draftPhraseRule(context, samples, options, windows);
  if (!draft) {
    return null;
  }
  return { ...draft, sampleEmails, subtypeBreakdown };
}
