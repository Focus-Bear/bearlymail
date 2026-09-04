/**
 * Strong-model sanity gate for AUTO-generated composite category rules.
 *
 * Runs after the cheap persist gate (match → value-add → exclusions) and before
 * anything is written, so a rule that is generic, contradicts its category, or
 * belongs in a different category is never created — deterministic rules win
 * over the LLM categoriser, so a bad one silently mis-files mail. Hand-authored
 * rules never pass through here.
 *
 * Verdicts: "accept" → persist as-is; "reject" → drop; "revise" → the reviewer's
 * corrected rule is re-gated and re-reviewed, and persisted only if that second
 * review accepts it. No verdict at all (disabled, LLM outage) fails OPEN so an
 * outage does not stop rule generation — but the rule is stored unchecked.
 */
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import {
  CategoryRuleSanityCheck,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { CategoryRuleSanityService } from "../llm/category-rule-sanity.service";
import {
  RULE_SANITY_VERDICTS,
  RuleSanityCategory,
  RuleSanityCheckResult,
  RuleSanityRevision,
  RuleSanitySampleEmail,
} from "../llm/llm-rule-sanity";
import { parseCategoryValue } from "../utils/category-format.util";
import { specToSummary } from "./category-rules-persist-gate.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

export interface SanityGateDeps {
  sanityService: CategoryRuleSanityService;
  userContextRepository: Repository<UserContext>;
  /** Validates + normalises a revision into a v3 spec; throws when invalid. */
  normalizeRevision: (
    dto: CreateCompositeCategoryRuleDto,
  ) => CompositeCategoryRuleSpecV3;
  /** Re-runs the cheap persist gate on a revised spec; null when it fails. */
  gateRevisedSpec: (
    spec: CompositeCategoryRuleSpec,
  ) => Promise<CompositeCategoryRuleSpec | null>;
  logger: Logger;
}

export interface SanityGateParams {
  userId: string;
  categoryName: string;
  categoryId: string | null;
  candidateSpec: CompositeCategoryRuleSpec;
  sampleEmails: RuleSanitySampleEmail[];
}

export const SANITY_GATE_REASONS = {
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  REVISION_ACCEPTED: "revision_accepted",
  REVISION_REJECTED: "revision_rejected",
  REVISION_INVALID: "revision_invalid",
  UNAVAILABLE: "unavailable",
} as const;

export type SanityGateReason =
  (typeof SANITY_GATE_REASONS)[keyof typeof SANITY_GATE_REASONS];

export interface SanityGateOutcome {
  shouldPersist: boolean;
  finalSpec: CompositeCategoryRuleSpec | null;
  /** Verdict to store on the persisted rule; null when the review was unavailable. */
  sanityCheck: CategoryRuleSanityCheck | null;
  reason: SanityGateReason;
  detail?: string;
}

interface UserCategories {
  target: RuleSanityCategory;
  others: RuleSanityCategory[];
}

const LOG_PREFIX = "[CategoryRules][sanity]";

/**
 * Splits the user's EMAIL_CATEGORY contexts into the rule's target category
 * (matched by id, falling back to name) and every other category, with
 * descriptions, so the reviewer can spot a better-fitting home for the rule.
 */
async function loadUserCategories(
  userContextRepository: Repository<UserContext>,
  userId: string,
  categoryName: string,
  categoryId: string | null,
): Promise<UserCategories> {
  const contexts = await userContextRepository.find({
    where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    select: { contextId: true, contextValue: true },
  });
  const normalisedTarget = categoryName.trim().toLowerCase();
  let target: RuleSanityCategory = { name: categoryName, description: null };
  const others: RuleSanityCategory[] = [];
  for (const ctx of contexts) {
    if (!ctx.contextValue) continue;
    const parsed = parseCategoryValue(ctx.contextValue);
    const isTarget = categoryId
      ? ctx.contextId === categoryId
      : parsed.name.trim().toLowerCase() === normalisedTarget;
    if (isTarget) {
      target = parsed;
    } else {
      others.push(parsed);
    }
  }
  return { target, others };
}

function sendersOf(spec: CompositeCategoryRuleSpec): string[] {
  return specToSummary(spec).senders.map((sender) => sender.toLowerCase());
}

/**
 * Turns the reviewer's revision into a validated spec. Null when the revision is
 * structurally invalid or tries to BROADEN the sender set — a reviewer may
 * tighten a rule, never widen who it matches.
 */
function buildRevisedSpec(
  deps: Pick<SanityGateDeps, "normalizeRevision">,
  candidateSpec: CompositeCategoryRuleSpec,
  categoryName: string,
  revision: RuleSanityRevision,
): CompositeCategoryRuleSpec | null {
  const allowedSenders = new Set(sendersOf(candidateSpec));
  const broadensSender = revision.fromMatchesAny.some(
    (sender) => !allowedSenders.has(sender.toLowerCase()),
  );
  if (broadensSender) {
    return null;
  }
  const notificationSubtype =
    candidateSpec.v === 3 ? candidateSpec.notificationSubtype : undefined;
  try {
    return deps.normalizeRevision({
      categoryName,
      senderMatchesAny: revision.fromMatchesAny,
      fromMatchesAny: revision.fromMatchesAny,
      subjectContainsAny: revision.subjectContainsAny,
      bodyContainsAny: revision.bodyContainsAny,
      subjectNotContainsAny: revision.subjectNotContainsAny,
      bodyNotContainsAny: revision.bodyNotContainsAny,
      ...(notificationSubtype && { notificationSubtype }),
    } as CreateCompositeCategoryRuleDto);
  } catch {
    return null;
  }
}

function toStoredCheck(
  result: RuleSanityCheckResult,
  model: string,
  revised: boolean,
): CategoryRuleSanityCheck {
  return {
    verdict: revised
      ? RULE_SANITY_VERDICTS.REVISE
      : RULE_SANITY_VERDICTS.ACCEPT,
    confidence: result.confidence,
    reason: result.reason,
    model,
    checkedAt: new Date().toISOString(),
    revised,
  };
}

function describeVerdict(result: RuleSanityCheckResult): string {
  return `${result.reason}${
    result.betterCategoryName
      ? ` (better category: "${result.betterCategoryName}")`
      : ""
  }`;
}

/**
 * Handles a "revise" verdict: validate the revision, re-run the cheap gate on
 * it, then ask the reviewer again. Persists the revision only when that second
 * review accepts it outright; anything else (reject, another revise, no
 * verdict) is treated as a rejection of the original candidate.
 */
async function resolveRevision(
  deps: SanityGateDeps,
  params: SanityGateParams,
  categories: UserCategories,
  firstPass: RuleSanityCheckResult,
): Promise<SanityGateOutcome> {
  const revision = firstPass.suggestedRevision;
  const revisedSpec = revision
    ? buildRevisedSpec(
        deps,
        params.candidateSpec,
        params.categoryName,
        revision,
      )
    : null;
  if (!revisedSpec) {
    return {
      shouldPersist: false,
      finalSpec: null,
      sanityCheck: null,
      reason: SANITY_GATE_REASONS.REVISION_INVALID,
      detail: firstPass.reason,
    };
  }
  const gatedSpec = await deps.gateRevisedSpec(revisedSpec);
  if (!gatedSpec) {
    return {
      shouldPersist: false,
      finalSpec: null,
      sanityCheck: null,
      reason: SANITY_GATE_REASONS.REVISION_REJECTED,
      detail: "revision failed the persist gate",
    };
  }
  const secondPass = await deps.sanityService.checkRule({
    categoryName: categories.target.name,
    categoryDescription: categories.target.description,
    candidate: specToSummary(gatedSpec),
    otherCategories: categories.others,
    sampleEmails: params.sampleEmails,
    userId: params.userId,
  });
  if (!secondPass || secondPass.verdict !== RULE_SANITY_VERDICTS.ACCEPT) {
    return {
      shouldPersist: false,
      finalSpec: null,
      sanityCheck: null,
      reason: SANITY_GATE_REASONS.REVISION_REJECTED,
      detail: secondPass ? describeVerdict(secondPass) : "no second verdict",
    };
  }
  return {
    shouldPersist: true,
    finalSpec: gatedSpec,
    // Store WHY the candidate needed revising (first pass) with the confidence
    // of the review that actually approved the persisted spec (second pass).
    sanityCheck: toStoredCheck(
      { ...secondPass, reason: firstPass.reason },
      deps.sanityService.model,
      true,
    ),
    reason: SANITY_GATE_REASONS.REVISION_ACCEPTED,
    detail: firstPass.reason,
  };
}

export async function evaluateRuleSanityGate(
  deps: SanityGateDeps,
  params: SanityGateParams,
): Promise<SanityGateOutcome> {
  const { userId, categoryName, categoryId, candidateSpec } = params;
  const failOpen = (detail: string): SanityGateOutcome => ({
    shouldPersist: true,
    finalSpec: candidateSpec,
    sanityCheck: null,
    reason: SANITY_GATE_REASONS.UNAVAILABLE,
    detail,
  });

  if (!deps.sanityService.isEnabled) {
    return failOpen("disabled");
  }

  const categories = await loadUserCategories(
    deps.userContextRepository,
    userId,
    categoryName,
    categoryId,
  );
  const firstPass = await deps.sanityService.checkRule({
    categoryName: categories.target.name,
    categoryDescription: categories.target.description,
    candidate: specToSummary(candidateSpec),
    otherCategories: categories.others,
    sampleEmails: params.sampleEmails,
    userId,
  });

  let outcome: SanityGateOutcome;
  if (!firstPass) {
    outcome = failOpen("no verdict");
  } else if (firstPass.verdict === RULE_SANITY_VERDICTS.ACCEPT) {
    outcome = {
      shouldPersist: true,
      finalSpec: candidateSpec,
      sanityCheck: toStoredCheck(firstPass, deps.sanityService.model, false),
      reason: SANITY_GATE_REASONS.ACCEPTED,
      detail: firstPass.reason,
    };
  } else if (firstPass.verdict === RULE_SANITY_VERDICTS.REVISE) {
    outcome = await resolveRevision(deps, params, categories, firstPass);
  } else {
    outcome = {
      shouldPersist: false,
      finalSpec: null,
      sanityCheck: null,
      reason: SANITY_GATE_REASONS.REJECTED,
      detail: describeVerdict(firstPass),
    };
  }

  deps.logger.log(
    `${LOG_PREFIX} category="${categoryName}" outcome=${outcome.reason} persist=${outcome.shouldPersist}${
      outcome.detail ? ` detail="${outcome.detail}"` : ""
    } user=${userId}`,
  );
  return outcome;
}
