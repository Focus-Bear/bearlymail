import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleEvaluationSet } from "../category-rules/category-rules.types";
import { withoutUnsettledGithubConditions } from "../category-rules/category-rules-github-conditions.helper";
import { isGithubSenderEmail } from "../constants/platform-pinning.constants";
import type { CategoryRule } from "../database/entities/category-rule.entity";
import type { Email } from "../database/entities/email.entity";
import type { EmailThread } from "../database/entities/email-thread.entity";
import {
  buildGithubCategorySignals,
  type GithubCategorySignals,
} from "../github/github-category-signals.helper";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { githubSignalsEmailFields } from "./email-github-signals.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

export interface ReleaseStaleRuleCategoryDeps {
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  categoryRulesService: Pick<
    CategoryRulesService,
    "peekMatchingRuleWithTrace" | "loadRuleEvaluationSet"
  >;
  logger: Logger;
}

export interface ReleaseStaleRuleCategoryArgs {
  userId: string;
  email: Email;
  thread: EmailThread | null;
  workerId: string;
  /** Batch callers pass one rules+categories fetch for every email. */
  preloadedRules?: CategoryRuleEvaluationSet;
}

/**
 * True when no email in the thread arrived after `email`. A rule label is only
 * judged against the newest message — releasing it because an OLDER email
 * (reprocessed out of order) doesn't match would undo a correct decision.
 */
async function isNewestEmailInThread(
  emailRepository: Repository<Email>,
  email: Email,
): Promise<boolean> {
  if (!email.emailThreadId) return true;
  const newest = await emailRepository.findOne({
    where: { emailThreadId: email.emailThreadId },
    order: { receivedAt: "DESC" },
    select: { id: true, receivedAt: true },
  });
  if (!newest || newest.id === email.id) return true;
  if (!newest.receivedAt || !email.receivedAt) return false;
  return email.receivedAt >= newest.receivedAt;
}

/**
 * True when some rule matches the newest email, or — for GitHub mail — could
 * match it once the item's volatile facts are refetched.
 */
async function anyRuleCanMatch(
  deps: ReleaseStaleRuleCategoryDeps,
  args: {
    userId: string;
    email: Email;
    thread: EmailThread;
    preloadedRules?: CategoryRuleEvaluationSet;
  },
): Promise<boolean> {
  const { userId, email, thread, preloadedRules } = args;
  if (!isGithubSenderEmail(email.from || "")) {
    const { match } = await deps.categoryRulesService.peekMatchingRuleWithTrace(
      userId,
      buildRuleEmailMetadata(email),
      preloadedRules,
    );
    return Boolean(match?.categoryId);
  }
  const facts = buildGithubCategorySignals(
    githubSignalsEmailFields(email),
    thread.githubMetadata ?? null,
  );
  const ruleSet =
    preloadedRules ??
    (await deps.categoryRulesService.loadRuleEvaluationSet(userId));
  const { match } = await deps.categoryRulesService.peekMatchingRuleWithTrace(
    userId,
    buildRuleEmailMetadata(email, facts),
    withUnsettledGithubConditionsRelaxed(ruleSet, facts),
  );
  return Boolean(match?.categoryId);
}

/** Copies the rule set with {@link withoutUnsettledGithubConditions} applied. */
function withUnsettledGithubConditionsRelaxed(
  ruleSet: CategoryRuleEvaluationSet,
  facts: GithubCategorySignals | null,
): CategoryRuleEvaluationSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map(
      (rule): CategoryRule =>
        rule.compositeSpec
          ? {
              ...rule,
              compositeSpec: withoutUnsettledGithubConditions(
                rule.compositeSpec,
                facts,
              ),
            }
          : rule,
    ),
  };
}

/**
 * A rule decides a thread's category from ONE message. The precedence guard
 * then pins that `rule` label above every automated writer, so when a later
 * message in the thread does NOT match any rule (e.g. the user's own
 * "sorry, wrong time" reply matched a sender=me rule, then an external
 * contact replied) the label stayed forever: the incremental re-categoriser
 * skipped the thread as pinned, batch triage preserved it, and a full re-run's
 * LLM category was blocked by precedence.
 *
 * Called at the start of a refine run for a NEW email: when the thread's
 * category came from a rule and no current rule matches this (newest) email,
 * the stored source is demoted to null so this run's writer (rule, LLM or
 * local model) can decide again. The categoryId stays until that writer
 * replaces it, so the inbox never flashes "Other" mid-run. A still-matching
 * rule keeps the label untouched.
 *
 * GitHub mail is judged with the facts the thread already holds, and any
 * condition those facts cannot settle (a board status that may have moved
 * since the last fetch) is treated as satisfiable: the label is released only
 * when no rule could match whatever the item's current status is. GitHub mail
 * used to be skipped outright, so a coarse rule that matched a "Closed"
 * notification kept the thread when a later "QA Status: Pass" comment matched
 * nothing.
 *
 * Returns true when the label was released. Never throws: a failure leaves
 * the label as it was and the refine run carries on.
 */
export async function releaseStaleRuleCategory(
  deps: ReleaseStaleRuleCategoryDeps,
  args: ReleaseStaleRuleCategoryArgs,
): Promise<boolean> {
  try {
    return await releaseIfUnmatched(deps, args);
  } catch (error) {
    deps.logger.warn(
      `[Worker ${args.workerId}] Stale rule-category check failed for email ${args.email.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

async function releaseIfUnmatched(
  deps: ReleaseStaleRuleCategoryDeps,
  args: ReleaseStaleRuleCategoryArgs,
): Promise<boolean> {
  const { userId, email, thread, workerId, preloadedRules } = args;
  if (!thread || thread.categorySource !== RULE_CATEGORY_SOURCE) return false;
  if (!(await isNewestEmailInThread(deps.emailRepository, email))) {
    return false;
  }
  if (await anyRuleCanMatch(deps, { userId, email, thread, preloadedRules })) {
    return false;
  }

  // Conditional on the stored source so a concurrent user override is never
  // clobbered.
  const result = await deps.emailThreadRepository.update(
    { id: thread.id, categorySource: RULE_CATEGORY_SOURCE },
    { categorySource: null },
  );
  const released = (result.affected ?? 0) > 0;
  if (released) {
    thread.categorySource = null;
    deps.logger.log(
      `[Worker ${workerId}] Released stale rule category on thread ${thread.id}: no rule matches newest email ${email.id}, so this run re-decides the category`,
    );
  }
  return released;
}
