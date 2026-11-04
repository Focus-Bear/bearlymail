import type { Repository } from "typeorm";

import { extractRuleIdMarker } from "../category-rules/category-rule-explanation.helper";
import type { CategoryRulesService } from "../category-rules/category-rules.service";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { GithubCategorySignals } from "../github/github-category-signals.helper";
import type {
  CategoryDecisionOutcome,
  CategoryDecisionStepName,
  CategoryDecisionTrace,
} from "./category-decision-trace.types";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/** Where the debug report learned which rule set the thread's category. */
export const CURRENT_RULE_RECORDED_BY = {
  /** The `(rule:<id>)` marker on the thread's category explanation. */
  EXPLANATION: "explanation",
  /** The applied deterministic-rule step of the category decision trace. */
  DECISION_TRACE: "decision-trace",
  /**
   * Nothing recorded the rule (the category predates rule IDs being stored),
   * so the rules were run again on the thread's newest email and this one
   * matches it, into the same category.
   */
  LIVE_MATCH: "live-match",
} as const;

export type CurrentRuleRecordedBy =
  (typeof CURRENT_RULE_RECORDED_BY)[keyof typeof CURRENT_RULE_RECORDED_BY];

/** The deterministic rule behind the thread's current category. */
export interface CurrentCategoryRule {
  ruleId: string;
  /** The rule's category name now, or null when the rule has since been deleted. */
  categoryName: string | null;
  recordedBy: CurrentRuleRecordedBy;
}

export interface CurrentCategoryRuleDeps {
  categoryRuleRepository: Repository<CategoryRule>;
  emailRepository: Repository<Email>;
  categoryRulesService: Pick<CategoryRulesService, "peekMatchingRuleWithTrace">;
  /** The GitHub facts the real rule matcher would see for an email. */
  githubSignalsFor: (email: Email) => Promise<GithubCategorySignals | null>;
}

const RULE_STEP: CategoryDecisionStepName = "deterministic-rule";
const APPLIED_OUTCOME: CategoryDecisionOutcome = "applied";

function ruleIdFromDecisionTrace(
  trace: CategoryDecisionTrace | null | undefined,
): string | null {
  const ruleStep = trace?.steps.find(
    (step) => step.step === RULE_STEP && step.outcome === APPLIED_OUTCOME,
  );
  return ruleStep?.ruleId ?? null;
}

async function liveMatchingRuleId(
  deps: CurrentCategoryRuleDeps,
  userId: string,
  thread: EmailThread,
): Promise<string | null> {
  const newestEmail = await deps.emailRepository.findOne({
    where: { userId, emailThreadId: thread.id },
    order: { receivedAt: "DESC" },
  });
  if (!newestEmail) return null;
  const { match } = await deps.categoryRulesService.peekMatchingRuleWithTrace(
    userId,
    buildRuleEmailMetadata(
      newestEmail,
      await deps.githubSignalsFor(newestEmail),
    ),
  );
  return match && match.categoryId === thread.categoryId ? match.ruleId : null;
}

async function recordedRule(
  deps: CurrentCategoryRuleDeps,
  userId: string,
  thread: EmailThread,
): Promise<{ ruleId: string; recordedBy: CurrentRuleRecordedBy } | null> {
  const fromExplanation = extractRuleIdMarker(thread.categoryExplanation);
  if (fromExplanation) {
    return {
      ruleId: fromExplanation,
      recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION,
    };
  }
  const fromTrace = ruleIdFromDecisionTrace(thread.categoryDecisionTrace);
  if (fromTrace) {
    return {
      ruleId: fromTrace,
      recordedBy: CURRENT_RULE_RECORDED_BY.DECISION_TRACE,
    };
  }
  const fromLiveMatch = await liveMatchingRuleId(deps, userId, thread);
  return fromLiveMatch
    ? { ruleId: fromLiveMatch, recordedBy: CURRENT_RULE_RECORDED_BY.LIVE_MATCH }
    : null;
}

/**
 * The rule that set a rule-decided thread's category, for the debug report.
 * Null when a rule did not set it, or when nothing recorded the rule and no
 * rule matches the newest email into that category any more.
 */
export async function resolveCurrentCategoryRule(
  deps: CurrentCategoryRuleDeps,
  userId: string,
  thread: EmailThread | null,
): Promise<CurrentCategoryRule | null> {
  if (thread?.categorySource !== RULE_CATEGORY_SOURCE) return null;
  const recorded = await recordedRule(deps, userId, thread);
  if (!recorded) return null;
  const rule = await deps.categoryRuleRepository.findOne({
    where: { id: recorded.ruleId, userId },
  });
  return { ...recorded, categoryName: rule?.categoryName ?? null };
}
