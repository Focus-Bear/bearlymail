import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleEvaluationSet } from "../category-rules/category-rules.types";
import { isGithubSenderEmail } from "../constants/platform-pinning.constants";
import type { Email } from "../database/entities/email.entity";
import type { EmailThread } from "../database/entities/email-thread.entity";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

export interface ReleaseStaleRuleCategoryDeps {
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  categoryRulesService: Pick<CategoryRulesService, "peekMatchingRuleWithTrace">;
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
 * GitHub mail is skipped: rules can pin GitHub facts (state, labels, author
 * kind) that this early check does not fetch, so "no match" here would not
 * mean "no match".
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
  if (isGithubSenderEmail(email.from || "")) return false;
  if (!(await isNewestEmailInThread(deps.emailRepository, email))) {
    return false;
  }

  const { match } = await deps.categoryRulesService.peekMatchingRuleWithTrace(
    userId,
    buildRuleEmailMetadata(email),
    preloadedRules,
  );
  if (match?.categoryId) return false;

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
