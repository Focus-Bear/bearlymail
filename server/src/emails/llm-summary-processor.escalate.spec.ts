import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { LOCAL_CATEGORY_SOURCE } from "./category-precedence.helper";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

// This exercises the REAL escalate → recategoriseFromSummary chain with fully
// injected deps rather than stubbing the helper module (the escalate helper
// calls recategoriseFromSummary via a module-internal reference, so an export
// mock would not intercept it). getThreadSummary returns null so the categoriser
// bails before any write — the observable effect is which deps were reached.

const USER_ID = "74116b93-e8ca-4eab-b200-792788d1b7c5";
const THREAD_ID = "thread-1";
const EMAIL_ID = "email-1";

function buildService(opts: {
  thread: Partial<EmailThread> | null;
  email?: Partial<Email> | null;
}) {
  const emailUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const emailRepository = { update: emailUpdate };

  const threadUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const emailThreadRepository = {
    update: threadUpdate,
    findOne: jest.fn((query: { select?: { lastSummarizedAt?: boolean } }) => {
      // ensureThreadSummaryFresh reads {id, lastSummarizedAt}; return a STALE
      // (null) timestamp so it runs the summariser to fill a missing summary.
      if (query.select?.lastSummarizedAt) {
        return Promise.resolve({ id: THREAD_ID, lastSummarizedAt: null });
      }
      return Promise.resolve(opts.thread);
    }),
  };

  const getEmailById = jest
    .fn()
    .mockResolvedValue(opts.email === undefined ? makeEmail() : opts.email);
  const getThreadEmails = jest
    .fn()
    .mockResolvedValue([
      { id: EMAIL_ID, receivedAt: new Date("2026-06-14T00:00:00.000Z") },
    ]);
  const emailsService = { getEmailById, getThreadEmails };

  const summarizeEmailWithAutoRule = jest
    .fn()
    .mockResolvedValue({ summary: "fresh summary", sentimentScore: null });
  const summarizationService = { summarizeEmailWithAutoRule };

  const getUserContexts = jest.fn().mockResolvedValue([]);
  const priorityCacheService = { getUserContexts };

  // Null summary: recategoriseFromSummary reaches its LLM branch guard and
  // returns without writing — enough to assert the chain was entered.
  const getThreadSummary = jest.fn().mockResolvedValue(null);
  const incrementalSummaryHelper = { getThreadSummary };

  const peekMatchingRuleWithTrace = jest
    .fn()
    .mockResolvedValue({ match: null, snapshot: {} });
  const categoryRulesService = { peekMatchingRuleWithTrace };

  const empty = {} as unknown;
  const service = new LLMSummaryProcessorService(
    emailRepository as unknown as Repository<Email>,
    emailThreadRepository as unknown as Repository<EmailThread>,
    empty as Repository<never>,
    emailsService as never,
    summarizationService as never,
    empty as never,
    priorityCacheService as never,
    empty as never,
    empty as never,
    empty as never,
    incrementalSummaryHelper as never,
    categoryRulesService as unknown as CategoryRulesService,
    empty as never,
  );

  return {
    service,
    getEmailById,
    summarizeEmailWithAutoRule,
    peekMatchingRuleWithTrace,
    getThreadSummary,
  };
}

function makeEmail(): Email {
  return {
    id: EMAIL_ID,
    emailThreadId: THREAD_ID,
    threadId: "provider-t1",
    subject: "Re: PR",
    summary: "",
    receivedAt: new Date("2026-06-14T00:00:00.000Z"),
  } as unknown as Email;
}

describe("LLMSummaryProcessorService.escalateLocalModelCategory", () => {
  it("no-ops (idempotent) when the thread already has a settled category", async () => {
    const { service, getEmailById, summarizeEmailWithAutoRule } = buildService({
      thread: {
        id: THREAD_ID,
        categorySource: "priority",
        categoryId: "cat-1",
      },
    });

    await service.escalateLocalModelCategory({
      userId: USER_ID,
      emailThreadId: THREAD_ID,
      emailId: EMAIL_ID,
      workerId: "job-1",
    });

    // A settled thread must not fetch the email, summarise, or re-categorise.
    expect(getEmailById).not.toHaveBeenCalled();
    expect(summarizeEmailWithAutoRule).not.toHaveBeenCalled();
  });

  it("no-ops when the thread no longer exists", async () => {
    const { service, getEmailById } = buildService({ thread: null });

    await service.escalateLocalModelCategory({
      userId: USER_ID,
      emailThreadId: THREAD_ID,
      emailId: EMAIL_ID,
      workerId: "job-1",
    });

    expect(getEmailById).not.toHaveBeenCalled();
  });

  it("generates a summary when missing, then runs the LLM categorisation", async () => {
    const {
      service,
      getEmailById,
      summarizeEmailWithAutoRule,
      peekMatchingRuleWithTrace,
    } = buildService({
      thread: {
        id: THREAD_ID,
        categorySource: LOCAL_CATEGORY_SOURCE,
        categoryId: null,
      },
    });

    await service.escalateLocalModelCategory({
      userId: USER_ID,
      emailThreadId: THREAD_ID,
      emailId: EMAIL_ID,
      workerId: "job-1",
    });

    expect(getEmailById).toHaveBeenCalledTimes(1);
    // The missing summary is generated BEFORE the categoriser runs.
    expect(summarizeEmailWithAutoRule).toHaveBeenCalledTimes(1);
    // The category-only re-categorisation chain was entered (rules peek first).
    expect(peekMatchingRuleWithTrace).toHaveBeenCalledTimes(1);
  });
});
