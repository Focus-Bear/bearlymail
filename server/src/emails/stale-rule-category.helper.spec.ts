import { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import {
  EXTERNAL_FROM,
  EXTERNAL_SUBJECT,
  OUTLOOK_REPLY_HTML,
  OUTLOOK_REPLY_PLAIN,
} from "../category-rules/__fixtures__/quoted-reply.fixture";
import type { CategoryRuleMatch } from "../category-rules/category-rules.types";
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
    categoryRulesService: { peekMatchingRuleWithTrace: peek },
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

  it("skips GitHub mail, whose rules can depend on facts this check does not load", async () => {
    const deps = buildDeps({ match: null });
    const githubEmail = buildExternalReply({
      from: "Octo Cat <notifications@github.com>",
    });

    await expect(
      run(deps, buildThread(RULE_CATEGORY_SOURCE), githubEmail),
    ).resolves.toBe(false);
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
