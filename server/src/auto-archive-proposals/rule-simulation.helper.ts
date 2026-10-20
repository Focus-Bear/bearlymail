import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { WorkflowCondition } from "../workflows/types/workflow.types";
import { matchesWorkflowCondition } from "../workflows/workflow-condition-matcher";
import {
  AnalysedEmail,
  ArchiveRuleCondition,
  RuleSimulationStats,
} from "./auto-archive-proposals.types";
import { tallyEngagement } from "./engagement.helper";

/** The workflow condition an approved proposal becomes. */
export function toWorkflowCondition(
  condition: ArchiveRuleCondition,
): WorkflowCondition {
  return {
    fromPatterns: [condition.senderPattern],
    subjectPatterns: condition.subjectPatterns,
    bodyPatterns: condition.bodyPatterns,
    categories: [],
    priorityLevels: [],
    naturalLanguageCondition: null,
  };
}

/**
 * Replays a workflow condition over past emails with the engine's own matcher.
 * Category/priority are left blank: a proposal never sets them, and a
 * suppressing rule that needs them cannot be judged from text alone, so it is
 * treated as matching nothing (it never blocks a proposal by accident).
 */
export function matchingEmails(
  condition: WorkflowCondition,
  emails: AnalysedEmail[],
): AnalysedEmail[] {
  const usesTriageFields =
    (condition.categories?.length ?? 0) > 0 ||
    (condition.priorityLevels?.length ?? 0) > 0;
  if (usesTriageFields) return [];
  return emails.filter((email) =>
    matchesWorkflowCondition(condition, {
      from: email.from,
      subject: email.subject,
      body: email.body,
      category: "",
      priority: "",
    }),
  );
}

/** Engagement of the emails a rule would have archived. */
export function simulateRule(
  condition: ArchiveRuleCondition,
  emails: AnalysedEmail[],
): { matched: AnalysedEmail[]; stats: RuleSimulationStats } {
  const matched = matchingEmails(toWorkflowCondition(condition), emails);
  const tally = tallyEngagement(matched);
  return {
    matched,
    stats: {
      matched: tally.total,
      engaged: tally.engaged,
      strongEngaged: tally.strongEngaged,
      glanced: tally.glanced,
      opened: tally.opened,
      replied: tally.replied,
      starred: tally.starred,
    },
  };
}

/**
 * The precision safeguard: a rule may not have archived anything the user
 * replied to, starred or raised; only a tiny share of emails they opened and
 * read ("about zero"); and only a small share of quick glances.
 */
export function isPrecise(stats: RuleSimulationStats): boolean {
  const config = AUTO_ARCHIVE_PROPOSAL_CONFIG;
  const readCaught = stats.engaged - stats.strongEngaged;
  return (
    stats.strongEngaged <= config.MAX_STRONG_ENGAGEMENT_CAUGHT &&
    readCaught <= Math.floor(stats.matched * config.MAX_OPENED_CAUGHT_SHARE) &&
    stats.glanced <= stats.matched * config.MAX_GLANCED_SHARE
  );
}
