import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { RuleThreadRecategoriseOutcome } from "./rule-label-recategorise.helper";
import {
  DEFAULT_RECATEGORISE_CAP,
  MAX_RECATEGORISE_CAP,
  RuleLabelReCategoriseService,
} from "./rule-label-recategorise.service";

const USER_ID = "74116b93-e8ca-4eab-b200-792788d1b7c5";

function makeThread(id: string): EmailThread {
  return {
    id,
    userId: USER_ID,
    categorySource: RULE_CATEGORY_SOURCE,
    categoryId: "issues-id",
  } as unknown as EmailThread;
}

function makeEmail(threadId: string): Email {
  return {
    id: `email-${threadId}`,
    emailThreadId: threadId,
    receivedAt: new Date(),
  } as unknown as Email;
}

function makeOutcome(
  over: Partial<RuleThreadRecategoriseOutcome>,
): RuleThreadRecategoriseOutcome {
  return {
    threadId: "t",
    ruleStillMatched: false,
    matchedRuleId: null,
    changed: false,
    oldCategoryId: "issues-id",
    oldCategoryName: "Issues",
    newCategoryId: "issues-id",
    newCategoryName: "Issues",
    newCategorySource: "priority",
    reSnappedToSameRuleCategory: false,
    ...over,
  };
}

describe("RuleLabelReCategoriseService", () => {
  let service: RuleLabelReCategoriseService;
  let threadRepo: { count: jest.Mock; find: jest.Mock; update: jest.Mock };
  let emailRepo: { findOne: jest.Mock };
  let llmSummaryProcessor: { recategoriseRuleLabelledThread: jest.Mock };
  let categoryRules: { peekMatchingRuleWithTrace: jest.Mock };
  let encryption: { withUserKey: jest.Mock };

  beforeEach(() => {
    threadRepo = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    emailRepo = {
      findOne: jest.fn((opts: { where: { emailThreadId: string } }) =>
        Promise.resolve(makeEmail(opts.where.emailThreadId)),
      ),
    };
    llmSummaryProcessor = { recategoriseRuleLabelledThread: jest.fn() };
    categoryRules = { peekMatchingRuleWithTrace: jest.fn() };
    encryption = {
      // Run the wrapped work inline so the loop executes in tests.
      withUserKey: jest.fn((_userId: string, fn: () => Promise<unknown>) =>
        fn(),
      ),
    };

    service = new RuleLabelReCategoriseService(
      threadRepo as unknown as Repository<EmailThread>,
      emailRepo as unknown as Repository<Email>,
      llmSummaryProcessor as unknown as LLMSummaryProcessorService,
      categoryRules as unknown as CategoryRulesService,
      encryption as unknown as UserEncryptionService,
    );
  });

  it("selects only rule-labelled threads and applies the per-run cap", async () => {
    await service.recategoriseRuleLabelledThreads({ userId: USER_ID });

    expect(threadRepo.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, categorySource: RULE_CATEGORY_SOURCE },
    });
    const findArg = threadRepo.find.mock.calls[0][0];
    expect(findArg.take).toBe(DEFAULT_RECATEGORISE_CAP);
    // Both OR-branches filter to the same user + rule source.
    for (const branch of findArg.where) {
      expect(branch.userId).toBe(USER_ID);
      expect(branch.categorySource).toBe(RULE_CATEGORY_SOURCE);
    }
  });

  it("clamps a limit above the hard maximum", async () => {
    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
      limit: 999999,
    });
    expect(result.cap).toBe(MAX_RECATEGORISE_CAP);
    expect(threadRepo.find.mock.calls[0][0].take).toBe(MAX_RECATEGORISE_CAP);
  });

  it("re-categorises each selected thread via the live pipeline and stamps idempotency", async () => {
    threadRepo.find.mockResolvedValue([makeThread("t1"), makeThread("t2")]);
    llmSummaryProcessor.recategoriseRuleLabelledThread
      .mockResolvedValueOnce(
        makeOutcome({
          threadId: "t1",
          ruleStillMatched: false,
          changed: true,
          newCategoryId: "pr-id",
          newCategoryName: "Pull Requests",
        }),
      )
      .mockResolvedValueOnce(
        makeOutcome({
          threadId: "t2",
          ruleStillMatched: true,
          changed: false,
          newCategorySource: "rule",
        }),
      );

    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
    });

    expect(
      llmSummaryProcessor.recategoriseRuleLabelledThread,
    ).toHaveBeenCalledTimes(2);
    expect(result.changed).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.orphaned).toBe(1);
    expect(result.ruleStillMatches).toBe(1);
    expect(result.estimatedLlmCalls).toBe(1);

    // Idempotency stamp written for each processed thread.
    const stamped = threadRepo.update.mock.calls.filter(
      (call) => call[1].lastRecategorisedAt instanceof Date,
    );
    expect(stamped.map((call) => call[0])).toEqual([
      { id: "t1" },
      { id: "t2" },
    ]);
  });

  it("flags a thread that re-snaps to the same rule category (remaining-bad-rule signal)", async () => {
    threadRepo.find.mockResolvedValue([makeThread("t1")]);
    llmSummaryProcessor.recategoriseRuleLabelledThread.mockResolvedValue(
      makeOutcome({
        threadId: "t1",
        ruleStillMatched: true,
        changed: false,
        newCategorySource: "rule",
        reSnappedToSameRuleCategory: true,
        matchedRuleId: "still-active-rule",
      }),
    );

    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
    });
    expect(result.reSnappedToRule).toBe(1);
  });

  it("counts a failed thread and does NOT stamp it (retryable)", async () => {
    threadRepo.find.mockResolvedValue([makeThread("t1")]);
    llmSummaryProcessor.recategoriseRuleLabelledThread.mockRejectedValue(
      new Error("LLM timeout"),
    );

    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
    });
    expect(result.failed).toBe(1);
    expect(result.changed).toBe(0);
    expect(threadRepo.update).not.toHaveBeenCalled();
  });

  it("dry run performs no writes and classifies via rule peek only", async () => {
    threadRepo.find.mockResolvedValue([makeThread("t1"), makeThread("t2")]);
    categoryRules.peekMatchingRuleWithTrace
      .mockResolvedValueOnce({ match: { categoryId: "issues-id" } })
      .mockResolvedValueOnce({ match: null });

    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.ruleStillMatches).toBe(1);
    expect(result.orphaned).toBe(1);
    expect(result.estimatedLlmCalls).toBe(1);
    expect(
      llmSummaryProcessor.recategoriseRuleLabelledThread,
    ).not.toHaveBeenCalled();
    expect(threadRepo.update).not.toHaveBeenCalled();
  });

  it("skips a selected thread with no newest email", async () => {
    threadRepo.find.mockResolvedValue([makeThread("t1")]);
    emailRepo.findOne.mockResolvedValue(null);

    const result = await service.recategoriseRuleLabelledThreads({
      userId: USER_ID,
    });
    expect(result.skippedNoEmail).toBe(1);
    expect(
      llmSummaryProcessor.recategoriseRuleLabelledThread,
    ).not.toHaveBeenCalled();
  });
});
