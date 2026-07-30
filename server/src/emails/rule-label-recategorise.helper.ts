import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { UserContext } from "../database/entities/user-context.entity";
import type { LLMCoreService } from "../llm/llm-core.service";
import { makeCategoryNameByIdLookup } from "./category-lookup.helper";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { recategoriseFromSummary } from "./incremental-recategorise.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/** The "Other" sentinel used in audit output when a thread has no real category. */
const OTHER_CATEGORY_LABEL = "Other";

/**
 * Outcome of re-categorising a single rule-labelled thread through the live
 * category pipeline. Returned to the orchestrator for audit logging and
 * aggregate counts. Category NAMES (not bodies/senders) are the only
 * thread-derived strings surfaced, so audit logs carry no decrypted PII beyond
 * the category name (allowed).
 */
export interface RuleThreadRecategoriseOutcome {
  threadId: string;
  /** A CURRENT (still-present) deterministic rule matched the newest email. */
  ruleStillMatched: boolean;
  matchedRuleId: string | null;
  /** The resolved categoryId actually changed. */
  changed: boolean;
  oldCategoryId: string | null;
  oldCategoryName: string;
  newCategoryId: string | null;
  newCategoryName: string;
  newCategorySource: string | null;
  /**
   * A rule re-applied the SAME category the (supposedly removed) rule had — a
   * signal that a still-active rule keeps filing this thread to that category
   * (i.e. a remaining bad rule, if the label was wrong).
   */
  reSnappedToSameRuleCategory: boolean;
}

export interface RecategoriseRuleThreadDeps {
  emailThreadRepository: Repository<EmailThread>;
  categoryRulesService: CategoryRulesService;
  llmCoreService: LLMCoreService;
  getThreadSummary: (emailThreadId: string) => Promise<string | null>;
  getUserContexts: (userId: string) => Promise<UserContext[]>;
  ensureThreadSummaryFresh: (
    email: Email,
    userId: string,
    workerId: string,
  ) => Promise<void>;
  logger: Logger;
}

export interface RecategoriseRuleThreadArgs {
  thread: EmailThread;
  email: Email;
  userId: string;
  workerId: string;
}

/**
 * Re-categorise ONE thread whose category came from a now-removed over-broad
 * deterministic rule (`categorySource === 'rule'`), through the SAME live
 * category-only pipeline the summary/incremental paths use ({@link
 * recategoriseFromSummary}) — never a bespoke categoriser.
 *
 * The category precedence guard deliberately stops the LLM (`priority`, rank 20)
 * from overwriting a `rule` label (rank 40) so live re-runs can't drift a rule
 * decision. For this deliberate cleanup we demote the stale `rule` source to
 * null FIRST, then run the pipeline (rules-first, else the summary LLM): a
 * still-present good rule re-locks the thread to `rule`; an orphaned label (its
 * rule was deleted) falls through to the LLM, which writes `priority`. User
 * overrides (`categorySource === 'user'`) are never selected by the
 * orchestrator, so they are structurally out of scope here.
 *
 * Failure-safe + idempotent: on any error the original `rule` source is restored
 * so a re-run retries the thread. Must run inside the caller's `withUserKey`
 * scope (encrypted summary/category columns).
 */
export async function recategoriseRuleThread(
  deps: RecategoriseRuleThreadDeps,
  args: RecategoriseRuleThreadArgs,
): Promise<RuleThreadRecategoriseOutcome> {
  const { thread, email, userId, workerId } = args;
  const emailThreadId = thread.id;
  const originalSource = thread.categorySource;
  const originalCategoryId = thread.categoryId;

  const userContexts = await deps.getUserContexts(userId);
  const nameById = makeCategoryNameByIdLookup(userContexts);
  const resolveName = (id: string | null): string =>
    (id && nameById.get(id)) || OTHER_CATEGORY_LABEL;

  // Advisory peek only (no hit-count increment, no write): does a CURRENT rule
  // still match? Used for telemetry and the remaining-bad-rule signal. The
  // authoritative decision is made by recategoriseFromSummary below.
  const { match } = await deps.categoryRulesService.peekMatchingRuleWithTrace(
    userId,
    buildRuleEmailMetadata(email),
  );
  const ruleStillMatched = match?.categoryId != null;

  try {
    await deps.emailThreadRepository.update(
      { id: emailThreadId },
      { categorySource: null },
    );
    thread.categorySource = null;

    await deps.ensureThreadSummaryFresh(email, userId, workerId);

    await recategoriseFromSummary(
      {
        categoryRulesService: deps.categoryRulesService,
        emailThreadRepository: deps.emailThreadRepository,
        getThreadSummary: deps.getThreadSummary,
        llmCoreService: deps.llmCoreService,
        logger: deps.logger,
      },
      { thread, email, userId, workerId, userContexts },
    );
  } catch (error) {
    await deps.emailThreadRepository.update(
      { id: emailThreadId },
      { categorySource: originalSource },
    );
    throw error;
  }

  const updated = await deps.emailThreadRepository.findOne({
    where: { id: emailThreadId },
    select: { id: true, categoryId: true, categorySource: true },
  });
  const newCategoryId = updated?.categoryId ?? null;
  const newCategorySource = updated?.categorySource ?? null;

  return {
    threadId: emailThreadId,
    ruleStillMatched,
    matchedRuleId: match?.ruleId ?? null,
    changed: newCategoryId !== originalCategoryId,
    oldCategoryId: originalCategoryId,
    oldCategoryName: resolveName(originalCategoryId),
    newCategoryId,
    newCategoryName: resolveName(newCategoryId),
    newCategorySource,
    reSnappedToSameRuleCategory:
      newCategorySource === RULE_CATEGORY_SOURCE &&
      newCategoryId === originalCategoryId,
  };
}
