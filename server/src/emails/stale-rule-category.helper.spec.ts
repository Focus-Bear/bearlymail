import { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import {
  CLOSED_BODY,
  CLOSED_FROM,
  CLOSED_RECEIVED_AT,
  ISSUE_SUBJECT,
  QA_PASS_BODY,
  QA_PASS_FROM,
  QA_PASS_RECEIVED_AT,
  QA_PASSED_BOARD_RULE,
  STATUS_UPDATE_RULE,
} from "../category-rules/__fixtures__/github-qa-pass.fixture";
import {
  EXTERNAL_FROM,
  EXTERNAL_SUBJECT,
  OUTLOOK_REPLY_HTML,
  OUTLOOK_REPLY_PLAIN,
} from "../category-rules/__fixtures__/quoted-reply.fixture";
import type {
  CategoryRuleEvaluationSet,
  CategoryRuleMatch,
  EmailMetadata,
} from "../category-rules/category-rules.types";
import { evaluateComposite } from "../category-rules/category-rules-auto-composite.helper";
import { findMostSpecificCompositeRuleMatch } from "../category-rules/category-rules-match.helper";
import { CATEGORY_RULE_MATCH_MODES } from "../constants/domain-types";
import type {
  CategoryRule,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import type { Email } from "../database/entities/email.entity";
import type { EmailThread } from "../database/entities/email-thread.entity";
import {
  PRIORITY_CATEGORY_SOURCE,
  RULE_CATEGORY_SOURCE,
  USER_CATEGORY_SOURCE,
} from "./category-precedence.helper";
import {
  releaseStaleRuleCategory,
  type ReleaseStaleRuleCategoryDeps,
} from "./stale-rule-category.helper";

const THREAD_ID = "thread-1";
const NEW_EMAIL_ID = "email-new";
const RESCHEDULE_CATEGORY_ID = "category-reschedule";

const RESCHEDULE_MATCH: CategoryRuleMatch = {
  categoryName: "Meeting Reschedule Requests",
  categoryId: RESCHEDULE_CATEGORY_ID,
  ruleId: "rule-1",
  ruleType: null,
  ruleKind: "composite",
};

function buildExternalReply(overrides: Partial<Email> = {}): Email {
  return {
    id: NEW_EMAIL_ID,
    emailThreadId: THREAD_ID,
    from: EXTERNAL_FROM,
    subject: EXTERNAL_SUBJECT,
    body: OUTLOOK_REPLY_PLAIN,
    htmlBody: OUTLOOK_REPLY_HTML,
    receivedAt: new Date("2026-10-26T00:51:00Z"),
    ...overrides,
  } as Email;
}

function buildThread(categorySource: string | null): EmailThread {
  return {
    id: THREAD_ID,
    categoryId: RESCHEDULE_CATEGORY_ID,
    categorySource,
  } as EmailThread;
}

function buildDeps(options: {
  newestEmail?: Partial<Email> | null;
  match?: CategoryRuleMatch | null;
  affected?: number;
}): ReleaseStaleRuleCategoryDeps & {
  update: jest.Mock;
  peek: jest.Mock;
} {
  const update = jest
    .fn()
    .mockResolvedValue({ affected: options.affected ?? 1 });
  const peek = jest
    .fn()
    .mockResolvedValue({ match: options.match ?? null, snapshot: {} });
  const newest =
    options.newestEmail === undefined
      ? { id: NEW_EMAIL_ID, receivedAt: new Date("2026-10-26T00:51:00Z") }
      : options.newestEmail;
  return {
    emailRepository: {
      findOne: jest.fn().mockResolvedValue(newest),
    } as unknown as Repository<Email>,
    emailThreadRepository: { update } as unknown as Repository<EmailThread>,
    categoryRulesService: {
      peekMatchingRuleWithTrace: peek,
      loadRuleEvaluationSet: jest.fn(),
    },
    logger: new Logger("test"),
    update,
    peek,
  };
}

const run = (
  deps: ReleaseStaleRuleCategoryDeps,
  thread: EmailThread | null,
  email: Email = buildExternalReply(),
) =>
  releaseStaleRuleCategory(deps, {
    userId: "user-1",
    email,
    thread,
    workerId: "worker-1",
  });

describe("releaseStaleRuleCategory", () => {
  it("releases a rule label when an external reply (quoting the user's 'sorry') matches no rule", async () => {
    const deps = buildDeps({ match: null });
    const thread = buildThread(RULE_CATEGORY_SOURCE);

    await expect(run(deps, thread)).resolves.toBe(true);

    expect(deps.update).toHaveBeenCalledWith(
      { id: THREAD_ID, categorySource: RULE_CATEGORY_SOURCE },
      { categorySource: null },
    );
    expect(thread.categorySource).toBeNull();
    // The category stays visible until this run's writer replaces it.
    expect(thread.categoryId).toBe(RESCHEDULE_CATEGORY_ID);
  });

  it("evaluates the rules against the reply's own words, not the quoted message", async () => {
    const deps = buildDeps({ match: null });

    await run(deps, buildThread(RULE_CATEGORY_SOURCE));

    const [, metadata] = deps.peek.mock.calls[0];
    expect(metadata.from).toBe(EXTERNAL_FROM);
    expect(metadata.bodyTextForMatch.toLowerCase()).not.toContain("sorry");
  });

  it("keeps the label when a rule still matches the newest email", async () => {
    const deps = buildDeps({ match: RESCHEDULE_MATCH });
    const thread = buildThread(RULE_CATEGORY_SOURCE);

    await expect(run(deps, thread)).resolves.toBe(false);

    expect(deps.update).not.toHaveBeenCalled();
    expect(thread.categorySource).toBe(RULE_CATEGORY_SOURCE);
  });

  it("never touches a user-pinned or AI-decided category", async () => {
    for (const source of [
      USER_CATEGORY_SOURCE,
      PRIORITY_CATEGORY_SOURCE,
      null,
    ]) {
      const deps = buildDeps({ match: null });
      await expect(run(deps, buildThread(source))).resolves.toBe(false);
      expect(deps.peek).not.toHaveBeenCalled();
      expect(deps.update).not.toHaveBeenCalled();
    }
  });

  it("keeps the label when the email being processed is not the newest in the thread", async () => {
    const deps = buildDeps({
      match: null,
      newestEmail: {
        id: "email-later",
        receivedAt: new Date("2026-10-27T00:00:00Z"),
      },
    });

    await expect(run(deps, buildThread(RULE_CATEGORY_SOURCE))).resolves.toBe(
      false,
    );
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("reports no release when a concurrent write already changed the source", async () => {
    const deps = buildDeps({ match: null, affected: 0 });
    const thread = buildThread(RULE_CATEGORY_SOURCE);

    await expect(run(deps, thread)).resolves.toBe(false);
    expect(thread.categorySource).toBe(RULE_CATEGORY_SOURCE);
  });

  it("never throws — a failed check leaves the label alone", async () => {
    const deps = buildDeps({ match: null });
    deps.peek.mockRejectedValueOnce(new Error("db down"));

    await expect(run(deps, buildThread(RULE_CATEGORY_SOURCE))).resolves.toBe(
      false,
    );
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("releaseStaleRuleCategory — GitHub issue thread closed, then QA passed", () => {
  const STATUS_CATEGORY_ID = "category-status-updates";
  const QA_PASSED_CATEGORY_ID = "category-qa-passed";
  const QA_PASS_EMAIL_ID = "email-qa-pass";

  const normalise = (raw: string): string => {
    const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
    return (match ? match[1] : raw).toLowerCase().trim();
  };

  const rule = (
    id: string,
    categoryId: string,
    spec: CompositeCategoryRuleSpecV3,
  ): CategoryRule =>
    ({
      id,
      categoryId,
      categoryName: categoryId,
      ruleKind: CATEGORY_RULE_MATCH_MODES.COMPOSITE,
      compositeSpec: spec,
      isEnabled: true,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    }) as CategoryRule;

  const ruleSet = (rules: CategoryRule[]): CategoryRuleEvaluationSet => ({
    rules,
    validCategoryIds: new Set(rules.map((entry) => entry.categoryId ?? "")),
    categoryIdByName: new Map(),
  });

  const statusRule = rule(
    "rule-status",
    STATUS_CATEGORY_ID,
    STATUS_UPDATE_RULE,
  );
  const qaBoardRule = rule(
    "rule-qa-board",
    QA_PASSED_CATEGORY_ID,
    QA_PASSED_BOARD_RULE,
  );

  const qaPassComment = {
    id: QA_PASS_EMAIL_ID,
    emailThreadId: THREAD_ID,
    from: QA_PASS_FROM,
    subject: ISSUE_SUBJECT,
    body: QA_PASS_BODY,
    htmlBody: null,
    receivedAt: QA_PASS_RECEIVED_AT,
  } as unknown as Email;

  /** A thread the status rule filed from the "Closed as completed" email. */
  const statusPinnedThread = (): EmailThread =>
    ({
      id: THREAD_ID,
      categoryId: STATUS_CATEGORY_ID,
      categorySource: RULE_CATEGORY_SOURCE,
      githubMetadata: null,
    }) as unknown as EmailThread;

  /** Rules are evaluated for real against whatever set the helper passes. */
  const buildGithubDeps = (loaded: CategoryRuleEvaluationSet) => {
    const deps = buildDeps({
      newestEmail: { id: QA_PASS_EMAIL_ID, receivedAt: QA_PASS_RECEIVED_AT },
    });
    deps.peek.mockImplementation(
      async (
        _userId: string,
        metadata: EmailMetadata,
        preloaded: CategoryRuleEvaluationSet,
      ) => ({
        match: findMostSpecificCompositeRuleMatch(
          preloaded.rules,
          metadata,
          normalise,
        ),
        snapshot: {},
      }),
    );
    (
      deps.categoryRulesService.loadRuleEvaluationSet as jest.Mock
    ).mockResolvedValue(loaded);
    return deps;
  };

  it("the status rule matches the Closed notification but not the QA-pass comment", () => {
    const metadataFor = (from: string, body: string): EmailMetadata => ({
      from,
      subject: ISSUE_SUBJECT,
      bodyTextForMatch: body,
    });

    expect(
      evaluateComposite(
        STATUS_UPDATE_RULE,
        metadataFor(CLOSED_FROM, CLOSED_BODY),
        normalise,
      ).matches,
    ).toBe(true);
    const onQaPass = evaluateComposite(
      STATUS_UPDATE_RULE,
      metadataFor(QA_PASS_FROM, QA_PASS_BODY),
      normalise,
    );
    expect(onQaPass.matches).toBe(false);
    expect(onQaPass.detail.senderMatch).toBe(true);
    expect(onQaPass.detail.subjectMatch).toBe(true);
    expect(onQaPass.detail.bodyMatch).toBe(false);
    expect(CLOSED_RECEIVED_AT.getTime()).toBeLessThan(
      QA_PASS_RECEIVED_AT.getTime(),
    );
  });

  it("releases the status label when no rule can match the newer QA-pass comment", async () => {
    const deps = buildGithubDeps(ruleSet([statusRule]));
    const thread = statusPinnedThread();

    await expect(run(deps, thread, qaPassComment)).resolves.toBe(true);

    expect(deps.update).toHaveBeenCalledWith(
      { id: THREAD_ID, categorySource: RULE_CATEGORY_SOURCE },
      { categorySource: null },
    );
    expect(thread.categorySource).toBeNull();
  });

  it("keeps the label while a board-status rule could match once the card's status is refetched", async () => {
    // The tester moves the card to "QA Passed/Done" seconds after commenting,
    // so the thread's cached facts cannot rule that rule out yet; the refine
    // run refreshes them and lets the QA-passed rule win instead.
    const deps = buildGithubDeps(ruleSet([statusRule, qaBoardRule]));

    await expect(run(deps, statusPinnedThread(), qaPassComment)).resolves.toBe(
      false,
    );
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("keeps the label when the newest GitHub email still matches the rule", async () => {
    const deps = buildGithubDeps(ruleSet([statusRule]));
    const anotherClose = {
      ...qaPassComment,
      from: CLOSED_FROM,
      body: CLOSED_BODY,
    } as Email;

    await expect(run(deps, statusPinnedThread(), anotherClose)).resolves.toBe(
      false,
    );
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("evaluates batch callers' preloaded rules instead of reloading them", async () => {
    const deps = buildGithubDeps(ruleSet([]));

    await expect(
      releaseStaleRuleCategory(deps, {
        userId: "user-1",
        email: qaPassComment,
        thread: statusPinnedThread(),
        workerId: "worker-1",
        preloadedRules: ruleSet([statusRule, qaBoardRule]),
      }),
    ).resolves.toBe(false);
    expect(
      deps.categoryRulesService.loadRuleEvaluationSet,
    ).not.toHaveBeenCalled();
  });
});
