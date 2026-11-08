import type { Repository } from "typeorm";

import type { CategoryRule } from "../database/entities/category-rule.entity";
import type { Email } from "../database/entities/email.entity";
import type { EmailThread } from "../database/entities/email-thread.entity";
import {
  CURRENT_RULE_RECORDED_BY,
  type CurrentCategoryRuleDeps,
  resolveCurrentCategoryRule,
} from "./category-debug-current-rule.helper";

const USER_ID = "user-1";
const CATEGORY_ID = "ctx-human-github";
const CATEGORY_NAME = "🐛 Human GitHub issue status updates";
/** Two rules share the category name, as in the reported account. */
const RULE_NOW_MATCHING = "11111111-2222-4333-8444-555555555555";
const RULE_FROM_OLD_TRACE = "692f8698-5a2e-458f-bfef-0ae9f9af1cd8";

function buildDeps(options: {
  liveMatch?: { ruleId: string; categoryId: string } | null;
  existingRuleIds?: string[];
}): CurrentCategoryRuleDeps & {
  peek: jest.Mock;
} {
  const existing = new Set(options.existingRuleIds ?? [RULE_NOW_MATCHING]);
  const peek = jest.fn(async () => ({
    match: options.liveMatch
      ? { ...options.liveMatch, categoryName: CATEGORY_NAME }
      : null,
    snapshot: null,
  }));
  return {
    peek,
    categoryRulesService: { peekMatchingRuleWithTrace: peek } as never,
    categoryRuleRepository: {
      findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
        existing.has(where.id)
          ? { id: where.id, categoryName: CATEGORY_NAME }
          : null,
      ),
    } as unknown as Repository<CategoryRule>,
    emailRepository: {
      findOne: jest.fn(async () => ({
        id: "email-newest",
        from: "notifications@github.com",
        subject: "Re: [Focus-Bear/Mac-App] Blocking stops (Issue #2928)",
        body: "catherineisonline left a comment",
      })),
    } as unknown as Repository<Email>,
    githubSignalsFor: jest.fn(async () => null),
  };
}

function thread(overrides: Partial<EmailThread>): EmailThread {
  return {
    id: "thread-1",
    categoryId: CATEGORY_ID,
    categorySource: "rule",
    categoryExplanation: null,
    categoryDecisionTrace: null,
    ...overrides,
  } as EmailThread;
}

describe("resolveCurrentCategoryRule", () => {
  it("is null when a rule did not set the category", async () => {
    const deps = buildDeps({});

    await expect(
      resolveCurrentCategoryRule(
        deps,
        USER_ID,
        thread({ categorySource: "priority" }),
      ),
    ).resolves.toBeNull();
  });

  it("reads the rule from the explanation's (rule:<id>) marker", async () => {
    const deps = buildDeps({});

    const rule = await resolveCurrentCategoryRule(
      deps,
      USER_ID,
      thread({
        categoryExplanation: `Incremental re-categorisation: deterministic rule matched "${CATEGORY_NAME}". (rule:${RULE_NOW_MATCHING})`,
      }),
    );

    expect(rule).toEqual({
      ruleId: RULE_NOW_MATCHING,
      categoryName: CATEGORY_NAME,
      recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION,
    });
    expect(deps.peek).not.toHaveBeenCalled();
  });

  it("falls back to the applied rule step of the decision trace", async () => {
    const deps = buildDeps({});

    const rule = await resolveCurrentCategoryRule(
      deps,
      USER_ID,
      thread({
        categoryExplanation: "Rule matched.",
        categoryDecisionTrace: {
          steps: [
            {
              step: "deterministic-rule",
              outcome: "applied",
              category: CATEGORY_NAME,
              categoryId: CATEGORY_ID,
              ruleId: RULE_NOW_MATCHING,
              detail: "",
            },
          ],
        } as EmailThread["categoryDecisionTrace"],
      }),
    );

    expect(rule?.recordedBy).toBe(CURRENT_RULE_RECORDED_BY.DECISION_TRACE);
    expect(rule?.ruleId).toBe(RULE_NOW_MATCHING);
  });

  it("re-matches the newest email for a category set before rule IDs were recorded, ignoring the stale processing-time trace", async () => {
    const deps = buildDeps({
      liveMatch: { ruleId: RULE_NOW_MATCHING, categoryId: CATEGORY_ID },
    });

    const rule = await resolveCurrentCategoryRule(
      deps,
      USER_ID,
      thread({
        categoryExplanation: `Incremental re-categorisation: deterministic rule matched "${CATEGORY_NAME}".`,
        categoryRuleTrace: {
          winningRuleId: RULE_FROM_OLD_TRACE,
        } as EmailThread["categoryRuleTrace"],
      }),
    );

    expect(rule).toEqual({
      ruleId: RULE_NOW_MATCHING,
      categoryName: CATEGORY_NAME,
      recordedBy: CURRENT_RULE_RECORDED_BY.LIVE_MATCH,
    });
  });

  it("does not claim a live match that files the email somewhere else", async () => {
    const deps = buildDeps({
      liveMatch: { ruleId: RULE_NOW_MATCHING, categoryId: "ctx-other" },
    });

    await expect(
      resolveCurrentCategoryRule(deps, USER_ID, thread({})),
    ).resolves.toBeNull();
  });

  it("keeps the recorded ID but no name when the rule was deleted", async () => {
    const deps = buildDeps({ existingRuleIds: [] });

    const rule = await resolveCurrentCategoryRule(
      deps,
      USER_ID,
      thread({ categoryExplanation: `x (rule:${RULE_NOW_MATCHING})` }),
    );

    expect(rule).toEqual({
      ruleId: RULE_NOW_MATCHING,
      categoryName: null,
      recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION,
    });
  });
});
