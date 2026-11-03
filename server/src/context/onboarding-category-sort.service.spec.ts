import { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import type { Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import type { EmailThread } from "../database/entities/email-thread.entity";
import type { User } from "../database/entities/user.entity";
import {
  RULE_CATEGORY_SOURCE,
  USER_CATEGORY_SOURCE,
} from "../emails/category-precedence.helper";
import { RECATEGORIZE_TRIGGER } from "../emails/recategorize-jobs.helper";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
  ONBOARDING_CATEGORY_SORT_OUTCOME,
  OnboardingCategorySortService,
} from "./onboarding-category-sort.service";

const USER_ID = "user-1";
const REFINE_PRIORITY = "refine-priority";

interface OnboardingSortMocks {
  send: jest.Mock;
  executeSql: jest.Mock;
  findUser: jest.Mock;
  queryThreads: jest.Mock;
  checkAiCapacity: jest.Mock;
}

/** Defaults: an onboarding user, nothing running, capacity left, two unsorted threads. */
function buildOnboardingSortService(
  overrides: Partial<OnboardingSortMocks> = {},
): { service: OnboardingCategorySortService; mocks: OnboardingSortMocks } {
  const mocks: OnboardingSortMocks = {
    send: jest.fn(async () => "job-id"),
    executeSql: jest.fn(async () => ({ rows: [] })),
    findUser: jest.fn(async () => ({
      id: USER_ID,
      hasCompletedOnboarding: false,
    })),
    queryThreads: jest.fn(async () => [
      { emailId: "email-a" },
      { emailId: "email-b" },
    ]),
    checkAiCapacity: jest.fn(async () => ({ allowed: true, percentUsed: 10 })),
    ...overrides,
  };
  const boss = {
    send: mocks.send,
    getDb: () => ({ executeSql: mocks.executeSql }),
  } as unknown as PgBoss;
  const service = new OnboardingCategorySortService(
    boss,
    { findOne: mocks.findUser } as unknown as Repository<User>,
    { query: mocks.queryThreads } as unknown as Repository<EmailThread>,
    {
      checkAiCapacity: mocks.checkAiCapacity,
    } as unknown as SubscriptionsService,
  );
  return { service, mocks };
}

describe("OnboardingCategorySortService", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("queues one tagged re-categorisation job per unsorted thread for an onboarding user", async () => {
    const { service, mocks } = buildOnboardingSortService();

    const outcome = await service.sortOnboardingThreadsIntoCategories(USER_ID);

    expect(outcome).toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.QUEUED);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const [jobName, data, options] = mocks.send.mock.calls[0];
    expect(jobName).toBe(REFINE_PRIORITY);
    expect(data).toEqual({
      userId: USER_ID,
      emailId: "email-a",
      forceRecalculate: true,
      recategorizeBatchId: expect.any(String),
      recategorizeTrigger: RECATEGORIZE_TRIGGER.ONBOARDING_CATEGORIES_SAVED,
    });
    expect(options).toMatchObject({ singletonKey: "recategorize-email-a" });
    const batchIds = mocks.send.mock.calls.map(
      ([, jobData]) => jobData.recategorizeBatchId,
    );
    expect(new Set(batchIds).size).toBe(1);
  });

  it("does nothing for a user who already finished onboarding (a Settings re-run)", async () => {
    const { service, mocks } = buildOnboardingSortService({
      findUser: jest.fn(async () => ({
        id: USER_ID,
        hasCompletedOnboarding: true,
      })),
    });

    const outcome = await service.sortOnboardingThreadsIntoCategories(USER_ID);

    expect(outcome).toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.NOT_ONBOARDING);
    expect(mocks.queryThreads).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("only selects triage threads in Other that the user or a rule didn't place", async () => {
    const { service, mocks } = buildOnboardingSortService();

    await service.sortOnboardingThreadsIntoCategories(USER_ID);

    const [sql, params] = mocks.queryThreads.mock.calls[0];
    expect(sql).toContain('thread."categoryId" IS NULL');
    expect(sql).toContain('thread."isArchived" = false');
    expect(sql).toContain('thread."starCount" = $2');
    expect(sql).toContain('thread."categorySource" NOT IN ($3, $4)');
    expect(params.slice(0, 4)).toEqual([
      USER_ID,
      STAR_COUNTS.NONE,
      USER_CATEGORY_SOURCE,
      RULE_CATEGORY_SOURCE,
    ]);
  });

  it("does not queue a second sort while one is still running", async () => {
    const { service, mocks } = buildOnboardingSortService({
      executeSql: jest.fn(async () => ({
        rows: [{ batchId: "batch-running", pending: "40" }],
      })),
    });

    const outcome = await service.sortOnboardingThreadsIntoCategories(USER_ID);

    expect(outcome).toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.ALREADY_RUNNING);
    expect(mocks.send).not.toHaveBeenCalled();
    const [, params] = mocks.executeSql.mock.calls[0];
    expect(params).toEqual([
      REFINE_PRIORITY,
      USER_ID,
      RECATEGORIZE_TRIGGER.ONBOARDING_CATEGORIES_SAVED,
      "completed",
    ]);
  });

  it("skips with a log when the plan's AI capacity is used up", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn");
    const { service, mocks } = buildOnboardingSortService({
      checkAiCapacity: jest.fn(async () => ({
        allowed: false,
        percentUsed: 100,
      })),
    });

    const outcome = await service.sortOnboardingThreadsIntoCategories(USER_ID);

    expect(outcome).toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.AI_CAPACITY_EXCEEDED);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("100%"));
  });

  it("reports nothing to sort when every thread already has a category", async () => {
    const { service, mocks } = buildOnboardingSortService({
      queryThreads: jest.fn(async () => []),
    });

    const outcome = await service.sortOnboardingThreadsIntoCategories(USER_ID);

    expect(outcome).toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.NOTHING_TO_SORT);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("never throws when queuing fails", async () => {
    const { service } = buildOnboardingSortService({
      send: jest.fn(async () => {
        throw new Error("pg-boss down");
      }),
    });

    await expect(
      service.sortOnboardingThreadsIntoCategories(USER_ID),
    ).resolves.toBe(ONBOARDING_CATEGORY_SORT_OUTCOME.FAILED);
  });
});
