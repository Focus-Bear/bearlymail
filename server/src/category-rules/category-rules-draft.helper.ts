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
      deps.logger.debug(
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
    deps.logger.debug(
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
  });
  if (outcome.passes && outcome.finalSpec) {
    return {
      spec: outcome.finalSpec,
      categoryName: trimmedCategory,
      categoryId,
      exclusionsDerived: true,
    };
  }

  if (options.requireDerivedExclusions) {
    deps.logger.debug(
      `[CategoryRules] Skipping auto composite rule — validation failed after derive-exclusions (truePositives=${outcome.truePositives}, falsePositives=${outcome.falsePositives}) for user ${userId} category="${trimmedCategory}"`,
    );
    return null;
  }

  // User draft: return the positive-only spec so the user can add an exclusion
  // in the review UI (the create endpoint requires at least one).
  return {
    spec: positiveSpec,
    categoryName: trimmedCategory,
    categoryId,
    exclusionsDerived: false,
  };
}
