/**
 * Retroactive application of a category rule to existing threads.
 *
 * Rules used to apply only to email processed AFTER the rule existed: a rule
 * created from the category-debug "Draft rule from this email" flow matched
 * the very thread it was drafted from, but that thread kept its stale category
 * until a new reply forced a re-run (the debug UI even warns about it). On
 * rule create/enable/edit we now evaluate the rule against the user's recent
 * threads (LLM-free, in-memory) and re-file the matches through the category
 * precedence guard — so user-pinned threads are never touched.
 */
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CATEGORY_RULE_MATCH_MODES } from "../constants/domain-types";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { buildCategoryDecisionTrace } from "../emails/category-decision-trace.helper";
import { updateThreadCategoryWithPrecedence } from "../emails/category-precedence.helper";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import { evaluateComposite } from "./category-rules-auto-composite.helper";
import {
  decryptValidationRow,
  ValidationRow,
} from "./category-rules-validate.helper";

/** One representative email per recent thread, with the thread id attached. */
export interface RetroApplyRow extends ValidationRow {
  threadId: string;
}

export interface RetroApplyResult {
  scanned: number;
  matched: number;
  applied: number;
}

/**
 * One representative (most recent) email from each of the user's most
 * recently-updated threads — including "Other" (categoryId NULL) threads,
 * which are the main retro-apply target. Mirrors
 * `fetchRecentCategorisedEmailRows` but keeps the thread id and drops the
 * categorised-only filter.
 */
export async function fetchRecentThreadRowsForRetroApply(
  emailThreadRepository: Repository<EmailThread>,
  userId: string,
): Promise<RetroApplyRow[]> {
  return emailThreadRepository.manager.query(
    `
    WITH recent_threads AS (
      SELECT id, "categoryId"
      FROM email_threads
      WHERE "userId" = $1
      ORDER BY "updatedAt" DESC
      LIMIT $2
    )
    SELECT DISTINCT ON (e."emailThreadId")
      rt.id           AS "threadId",
      e."from"        AS "from",
      e.subject       AS subject,
      e.body          AS body,
      e."htmlBody"    AS "htmlBody",
      rt."categoryId" AS "categoryId"
    FROM recent_threads rt
    INNER JOIN emails e ON e."emailThreadId" = rt.id
    WHERE e."userId" = $1
    ORDER BY e."emailThreadId", e."receivedAt" DESC
    `,
    [userId, CATEGORY_RULE_COMPOSITE.RETRO_APPLY_THREAD_COUNT],
  );
}

/**
 * Pure selection step: which of the scanned threads does the rule match that
 * are not already filed under its category? Split from the orchestrator so it
 * is testable without the raw-SQL fetch or encryption.
 */
export function selectRetroApplyThreadIds(
  rows: RetroApplyRow[],
  spec: CompositeCategoryRuleSpec,
  normaliseSender: (raw: string) => string,
  targetCategoryId: string,
): string[] {
  const threadIds: string[] = [];
  for (const row of rows) {
    if (row.categoryId === targetCategoryId) {
      continue;
    }
    const decrypted = decryptValidationRow(row);
    const evaluation = evaluateComposite(
      spec,
      {
        from: decrypted.from,
        subject: decrypted.subject,
        bodyTextForMatch: buildRuleMatchText(
          decrypted.body,
          decrypted.htmlBody,
        ),
      },
      normaliseSender,
    );
    if (evaluation.matches) {
      threadIds.push(row.threadId);
    }
  }
  return threadIds;
}

/**
 * Entry point for the service: re-files the user's recent threads that this
 * rule matches, when the rule is an enabled composite with a resolvable
 * category link. Runs on create/enable/edit so a new rule fixes the stale
 * threads it was drafted from instead of only future email; the precedence
 * guard keeps user-pinned threads untouched. Never throws.
 */
export async function retroApplyRuleIfEligible(
  deps: {
    emailThreadRepository: Repository<EmailThread>;
    normaliseSender: (raw: string) => string;
    logger?: Logger;
  },
  userId: string,
  rule: CategoryRule,
): Promise<void> {
  if (
    rule.ruleKind !== CATEGORY_RULE_MATCH_MODES.COMPOSITE ||
    !rule.isEnabled ||
    !rule.categoryId ||
    !rule.compositeSpec
  ) {
    return;
  }
  await retroApplyCompositeRuleToRecentThreads(deps, {
    userId,
    ruleId: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.categoryName,
    spec: rule.compositeSpec,
  });
}

/**
 * Applies a just-created/updated composite rule to the user's recent threads.
 * Never throws — a retro-apply failure must not fail the rule CRUD request.
 */
export async function retroApplyCompositeRuleToRecentThreads(
  deps: {
    emailThreadRepository: Repository<EmailThread>;
    normaliseSender: (raw: string) => string;
    logger?: Logger;
  },
  args: {
    userId: string;
    ruleId: string;
    categoryId: string;
    categoryName: string;
    spec: CompositeCategoryRuleSpec;
  },
): Promise<RetroApplyResult> {
  try {
    const rows = await fetchRecentThreadRowsForRetroApply(
      deps.emailThreadRepository,
      args.userId,
    );
    const threadIds = selectRetroApplyThreadIds(
      rows,
      args.spec,
      deps.normaliseSender,
      args.categoryId,
    );
    if (threadIds.length === 0) {
      return { scanned: rows.length, matched: 0, applied: 0 };
    }

    const decidedAt = new Date().toISOString();
    const applied = await updateThreadCategoryWithPrecedence(
      deps.emailThreadRepository,
      {
        whereIdIn: threadIds,
        source: "rule",
        set: {
          categoryId: args.categoryId,
          categorySource: "rule" as const,
          categoryExplanation: `Deterministic rule (category "${args.categoryName}") applied retroactively — the rule was created or updated after this thread was last processed.`,
          // The thread is no longer "Other", so it must not keep a proto link.
          protoCategoryId: null,
          categoryDecisionTrace: buildCategoryDecisionTrace({
            decidedAt,
            source: "rule",
            writtenBy: "retro-apply",
            trigger: "rule-retro",
            finalCategory: args.categoryName,
            finalCategoryId: args.categoryId,
            steps: [
              {
                step: "deterministic-rule",
                outcome: "applied",
                category: args.categoryName,
                categoryId: args.categoryId,
                detail: `Rule ${args.ruleId} applied retroactively on create/update: it matched this thread's most recent email, which was processed before the rule existed.`,
              },
            ],
          }),
        },
      },
    );
    deps.logger?.log(
      `[CategoryRules] Retro-applied rule ${args.ruleId} for user ${args.userId}: scanned=${rows.length} matched=${threadIds.length} applied=${applied} (matched-but-skipped threads are pinned by a higher-precedence source)`,
    );
    return { scanned: rows.length, matched: threadIds.length, applied };
  } catch (error) {
    deps.logger?.warn(
      `[CategoryRules] Retro-apply failed for rule ${args.ruleId} (user ${args.userId}) — rule saved, existing threads unchanged: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { scanned: 0, matched: 0, applied: 0 };
  }
}
