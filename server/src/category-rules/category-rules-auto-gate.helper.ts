/**
 * The two-stage quality gate every AUTO-generated composite rule must clear
 * before it is written or reconciled into a sibling:
 *   1. the cheap persist gate (mailbox match → value-add → exclusions), then
 *   2. the strong-model sanity review, which may reject or revise the rule.
 * A reviewer revision is re-run through stage 1 (no value-add call) before its
 * second review. Hand-authored rules never pass through here.
 */
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import {
  CategoryRule,
  CategoryRuleSanityCheck,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { CategoryRuleSanityService } from "../llm/category-rule-sanity.service";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import type { RuleSanitySampleEmail } from "../llm/llm-rule-sanity";
import { evaluateRulePersistGate } from "./category-rules-persist-gate.helper";
import { evaluateRuleSanityGate } from "./category-rules-sanity-gate.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

export interface AutoRuleGateDeps {
  categoryRuleRepository: Repository<CategoryRule>;
  emailRepository: Repository<Email>;
  userContextRepository: Repository<UserContext>;
  llmCategoriesService: LLMCategoriesService;
  sanityService: CategoryRuleSanityService;
  normaliseSender: (raw: string) => string;
  normalizeCompositeSpecDto: (
    dto: CreateCompositeCategoryRuleDto,
  ) => CompositeCategoryRuleSpecV3;
  logger: Logger;
}

export interface AutoRuleGateParams {
  userId: string;
  candidateSpec: CompositeCategoryRuleSpec;
  categoryName: string;
  categoryId: string | null;
  sampleEmails: RuleSanitySampleEmail[];
  /** Pre-fetched composite rules, shared with the value-add comparison. */
  compositeRules: CategoryRule[];
}

export interface AutoRuleGateResult {
  spec: CompositeCategoryRuleSpec;
  /** Verdict to store on the rule; null when the review was unavailable. */
  sanityCheck: CategoryRuleSanityCheck | null;
}

/**
 * Re-runs the cheap persist gate (match + exclusion requirement, no value-add
 * LLM call) on a reviewer-revised spec before it is reviewed a second time.
 */
async function gateRevisedSpec(
  deps: AutoRuleGateDeps,
  params: AutoRuleGateParams,
  spec: CompositeCategoryRuleSpec,
): Promise<CompositeCategoryRuleSpec | null> {
  const gate = await evaluateRulePersistGate({
    categoryRuleRepository: deps.categoryRuleRepository,
    emailRepository: deps.emailRepository,
    llmCategoriesService: deps.llmCategoriesService,
    normaliseSender: deps.normaliseSender,
    userId: params.userId,
    categoryName: params.categoryName,
    categoryId: params.categoryId,
    candidateSpec: spec,
    skipValueAdd: true,
  });
  return gate.shouldPersist ? gate.finalSpec : null;
}

/** Returns the final spec to persist (plus its verdict), or null when rejected. */
export async function gateAutoCompositeCandidate(
  deps: AutoRuleGateDeps,
  params: AutoRuleGateParams,
): Promise<AutoRuleGateResult | null> {
  const { userId, categoryName, categoryId } = params;
  const gate = await evaluateRulePersistGate({
    categoryRuleRepository: deps.categoryRuleRepository,
    emailRepository: deps.emailRepository,
    llmCategoriesService: deps.llmCategoriesService,
    normaliseSender: deps.normaliseSender,
    userId,
    categoryName,
    categoryId,
    candidateSpec: params.candidateSpec,
    compositeRules: params.compositeRules,
  });
  if (!gate.shouldPersist || !gate.finalSpec) {
    deps.logger.log(
      `[CategoryRules] Skipping auto composite rule — persist gate rejected (reason=${gate.reason}${gate.detail ? `: ${gate.detail}` : ""}) for user ${userId} category="${categoryName}"`,
    );
    return null;
  }

  // Strong-model review runs last (after the cheap gates, before any write)
  // so a generic / mis-categorised / self-contradictory rule is neither
  // created nor reconciled into an existing sibling.
  const sanity = await evaluateRuleSanityGate(
    {
      sanityService: deps.sanityService,
      userContextRepository: deps.userContextRepository,
      normalizeRevision: deps.normalizeCompositeSpecDto,
      gateRevisedSpec: (spec) => gateRevisedSpec(deps, params, spec),
      logger: deps.logger,
    },
    {
      userId,
      categoryName,
      categoryId,
      candidateSpec: gate.finalSpec,
      sampleEmails: params.sampleEmails,
    },
  );
  if (!sanity.shouldPersist || !sanity.finalSpec) {
    deps.logger.log(
      `[CategoryRules] Skipping auto composite rule — sanity review rejected (reason=${sanity.reason}${sanity.detail ? `: ${sanity.detail}` : ""}) for user ${userId} category="${categoryName}"`,
    );
    return null;
  }
  return { spec: sanity.finalSpec, sanityCheck: sanity.sanityCheck };
}

export interface PersistAutoRuleParams {
  userId: string;
  spec: CompositeCategoryRuleSpec;
  trimmedCategory: string;
  categoryId: string | null;
  sanityCheck: CategoryRuleSanityCheck | null;
}

/** Creates the auto-generated rule (enabled) with its stored sanity verdict. */
export async function persistAutoGeneratedCompositeRule(
  categoryRuleRepository: Repository<CategoryRule>,
  logger: Logger,
  params: PersistAutoRuleParams,
): Promise<CategoryRule> {
  const { userId, spec, trimmedCategory, categoryId, sanityCheck } = params;
  const created = categoryRuleRepository.create({
    userId,
    categoryName: trimmedCategory,
    categoryId,
    ruleKind: "composite",
    compositeSpec: spec,
    sanityCheck,
    ruleType: null,
    pattern: null,
    patternHash: null,
    subjectPrefix: null,
    isEnabled: true,
    hitCount: 0,
  });
  await categoryRuleRepository.save(created);
  logger.log(
    `[CategoryRules] Created composite auto-rule ${created.id} for user ${userId} category="${trimmedCategory}"`,
  );
  return created;
}
