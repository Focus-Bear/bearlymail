import { QUERY_LIMITS } from "../constants/query-limits";
import { ContextKey, Source } from "../database/entities/user-context.entity";
import { ContextAnalysisFinalizerService } from "./context-analysis-finalizer.service";
import type { StoredBatchResult } from "./context-discovery.types";
import {
  ONBOARDING_CATEGORY_SORT_OUTCOME,
  OnboardingCategorySortService,
} from "./onboarding-category-sort.service";

const completed = (
  overrides: Partial<Extract<StoredBatchResult, { categories: unknown }>>,
): StoredBatchResult => ({
  categories: [],
  vipContacts: [],
  urgentHints: [],
  notUrgentHints: [],
  threadIds: [],
  completedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

describe("ContextAnalysisFinalizerService", () => {
  let contextAnalysisRepository: { findOne: jest.Mock; save: jest.Mock };
  let contextRepository: { find: jest.Mock };
  let usersService: { update: jest.Mock };
  let crudService: {
    createOrUpdateContext: jest.Mock;
    deduplicateExistingContext: jest.Mock;
  };
  let compressionService: { enqueueContextCompressionIfNeeded: jest.Mock };
  let piiRedactionService: { areContextValuesSimilar: jest.Mock };
  let onboardingCategorySortService: {
    sortOnboardingThreadsIntoCategories: jest.Mock;
  };
  let service: ContextAnalysisFinalizerService;

  beforeEach(() => {
    jest.useFakeTimers();
    contextAnalysisRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    contextRepository = { find: jest.fn().mockResolvedValue([]) };
    usersService = { update: jest.fn().mockResolvedValue(undefined) };
    crudService = {
      createOrUpdateContext: jest.fn().mockResolvedValue(undefined),
      deduplicateExistingContext: jest.fn().mockResolvedValue(undefined),
    };
    compressionService = {
      enqueueContextCompressionIfNeeded: jest.fn().mockResolvedValue(false),
    };
    piiRedactionService = { areContextValuesSimilar: jest.fn(() => false) };
    onboardingCategorySortService = {
      sortOnboardingThreadsIntoCategories: jest
        .fn()
        .mockResolvedValue(ONBOARDING_CATEGORY_SORT_OUTCOME.QUEUED),
    };
    service = new ContextAnalysisFinalizerService(
      contextAnalysisRepository as never,
      contextRepository as never,
      usersService as never,
      crudService as never,
      compressionService as never,
      piiRedactionService as never,
      onboardingCategorySortService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("mergeBatchResults", () => {
    it("takes categories from the first completed (category-proposal) batch and merges VIPs across batches", () => {
      const merged = service.mergeBatchResults(
        {
          "0": completed({
            categories: [
              { name: "📰 Newsletters", description: "digests" },
              { name: "🔔 GitHub Notifications", description: "PRs" },
            ],
            vipContacts: [{ name: "Priya Raman", email: "priya@x.io" }],
            threadIds: ["a", "b"],
          }),
          "1": {
            error: "boom",
            failedAt: "2026-09-01T00:00:00.000Z",
            correlationId: "c",
            errorType: "unknown",
          },
          "2": completed({
            categories: [
              { name: "Newsletters", description: "dup" },
              { name: "💸 Invoices & Receipts", description: "billing" },
            ],
            vipContacts: [
              { name: "PRIYA RAMAN", email: "PRIYA@x.io" },
              { name: "Tom Becker" },
            ],
            urgentHints: ["Sentry alerts"],
            threadIds: ["c"],
          }),
        },
        3,
      );
      expect(merged.categories.map((category) => category.name)).toEqual([
        "📰 Newsletters",
        "🔔 GitHub Notifications",
      ]);
      expect(merged.vipContacts.map((contact) => contact.name)).toEqual([
        "Priya Raman",
        "Tom Becker",
      ]);
      expect(merged.urgentHints).toEqual(["Sentry alerts"]);
    });

    it("falls back to the next completed batch's categories when the proposal batch failed", () => {
      const merged = service.mergeBatchResults(
        {
          "0": {
            error: "boom",
            failedAt: "2026-09-01T00:00:00.000Z",
            correlationId: "c",
            errorType: "unknown",
          },
          "1": completed({
            categories: [{ name: "🐞 Bug Reports", description: "bugs" }],
          }),
        },
        2,
      );
      expect(merged.categories.map((category) => category.name)).toEqual([
        "🐞 Bug Reports",
      ]);
    });

    it("merges projects across batches, collapsing near-duplicates", () => {
      const merged = service.mergeBatchResults(
        {
          "0": completed({
            projects: [{ name: "Northwind rollout", reason: "dates" }],
          }),
          // Stored before discovery returned projects.
          "1": completed({}),
          "2": completed({
            projects: [
              { name: "northwind rollout" },
              { name: "Lumen Health pilot" },
            ],
          }),
        },
        3,
      );
      expect(merged.projects).toEqual([
        { name: "Northwind rollout", reason: "dates" },
        { name: "Lumen Health pilot" },
      ]);
    });

    it("caps the merged projects for one analysis", () => {
      const batchResults: Record<string, StoredBatchResult> = {};
      for (let batch = 0; batch < 3; batch++) {
        batchResults[String(batch)] = completed({
          projects: Array.from(
            { length: QUERY_LIMITS.DISCOVERY_MAX_PROJECTS_PER_BATCH },
            (_, index) => ({ name: `Project ${batch}-${index}` }),
          ),
        });
      }
      const merged = service.mergeBatchResults(batchResults, 3);
      expect(merged.projects).toHaveLength(QUERY_LIMITS.DISCOVERY_MAX_PROJECTS);
    });
  });

  describe("finalizeContextAnalysis", () => {
    const options = {
      userId: "user-1",
      analysisRecordId: "analysis-1",
      totalBatches: 1,
      totalThreads: 20,
      sentEmailsCount: 0,
      analysisStats: {
        totalThreads: 20,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
      },
    };

    it("persists the proposed categories as-is (no consolidation), then VIPs and hints, and completes the record", async () => {
      const record = {
        id: "analysis-1",
        analyzedCount: 20,
        stats: {
          batchResults: {
            "0": completed({
              categories: [
                {
                  name: "📰 Newsletters",
                  description: "digests",
                  sourceThreadIds: ["a"],
                },
              ],
              vipContacts: [{ name: "Priya Raman", reason: "client" }],
              projects: [
                { name: "Northwind onboarding rollout", reason: "dates" },
              ],
              urgentHints: ["Production alerts"],
              notUrgentHints: ["Retail promotions"],
              threadIds: ["a"],
            }),
          },
          batchPayloadsForRetry: { 0: [] },
        },
      };
      contextAnalysisRepository.findOne.mockResolvedValue(record);

      await service.finalizeContextAnalysis(options);

      const writes = crudService.createOrUpdateContext.mock.calls.map(
        ([, key, value]) => [key, value],
      );
      expect(writes).toEqual([
        [ContextKey.EMAIL_CATEGORY, "📰 Newsletters - digests"],
        [ContextKey.VIP_CONTACT, "Priya Raman"],
        [ContextKey.WORKING_ON, "Northwind onboarding rollout"],
        [ContextKey.URGENT, "Production alerts"],
        [ContextKey.NOT_IMPORTANT, "Retail promotions"],
      ]);
      expect(crudService.createOrUpdateContext.mock.calls[0][3]).toBe(
        Source.AUTOGENERATED,
      );
      // Each category links to the sample threads the model filed in it.
      expect(crudService.createOrUpdateContext.mock.calls[0][4]).toEqual(
        expect.objectContaining({ sourceThreadIds: ["a"] }),
      );
      // The onboarding "Current projects" group lists WORKING_ON rows; a
      // discovered project lands there at medium priority with its reason.
      expect(crudService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.WORKING_ON,
        "Northwind onboarding rollout",
        Source.AUTOGENERATED,
        expect.objectContaining({ priority: 2, explanation: "dates" }),
      );
      expect(record).toMatchObject({
        status: "completed",
        progress: 100,
        threadCount: 20,
      });
      expect(record.stats.batchPayloadsForRetry).toBeUndefined();
      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        scanProgress: 100,
        scanTotal: 100,
      });
    });

    it("skips values that already exist for the user", async () => {
      contextAnalysisRepository.findOne.mockResolvedValue({
        id: "analysis-1",
        stats: {
          batchResults: {
            "0": completed({
              categories: [{ name: "📰 Newsletters", description: "digests" }],
            }),
          },
        },
      });
      contextRepository.find.mockImplementation(
        async (query: { where: { contextKey: ContextKey } }) =>
          query.where.contextKey === ContextKey.EMAIL_CATEGORY &&
          query.where.source === undefined
            ? [{ contextValue: "📰 newsletters - digests" }]
            : [],
      );

      await service.finalizeContextAnalysis(options);

      expect(crudService.createOrUpdateContext).not.toHaveBeenCalled();
    });
  });

  describe("sorting the onboarding threads into the saved categories", () => {
    const sortOptions = {
      userId: "user-1",
      analysisRecordId: "analysis-1",
      totalBatches: 1,
      totalThreads: 20,
      sentEmailsCount: 0,
      analysisStats: {
        totalThreads: 20,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
      },
    };
    const recordWithCategories = () => ({
      id: "analysis-1",
      stats: {
        batchResults: {
          "0": completed({
            categories: [{ name: "🐞 Bug Reports", description: "bugs" }],
          }),
        },
      },
    });

    /** A real sort service over the given user and pg-boss send. */
    function delegateToRealSortService(options: {
      hasCompletedOnboarding: boolean;
      send: jest.Mock;
    }): void {
      const realSortService = new OnboardingCategorySortService(
        {
          send: options.send,
          getDb: () => ({ executeSql: jest.fn(async () => ({ rows: [] })) }),
        } as never,
        {
          findOne: jest.fn(async () => ({
            id: "user-1",
            hasCompletedOnboarding: options.hasCompletedOnboarding,
          })),
        } as never,
        { query: jest.fn(async () => [{ emailId: "email-a" }]) } as never,
        {
          checkAiCapacity: jest.fn(async () => ({
            allowed: true,
            percentUsed: 0,
          })),
        } as never,
      );
      onboardingCategorySortService.sortOnboardingThreadsIntoCategories.mockImplementation(
        (userId: string) =>
          realSortService.sortOnboardingThreadsIntoCategories(userId),
      );
    }

    it("starts the sort after the categories are saved", async () => {
      contextAnalysisRepository.findOne.mockResolvedValue(
        recordWithCategories(),
      );

      await service.finalizeContextAnalysis(sortOptions);

      const sort =
        onboardingCategorySortService.sortOnboardingThreadsIntoCategories;
      expect(sort).toHaveBeenCalledWith("user-1");
      expect(sort.mock.invocationCallOrder[0]).toBeGreaterThan(
        crudService.createOrUpdateContext.mock.invocationCallOrder[0],
      );
    });

    it("doesn't sort when the analysis proposed no categories", async () => {
      contextAnalysisRepository.findOne.mockResolvedValue({
        id: "analysis-1",
        stats: { batchResults: { "0": completed({}) } },
      });

      await service.finalizeContextAnalysis(sortOptions);

      expect(
        onboardingCategorySortService.sortOnboardingThreadsIntoCategories,
      ).not.toHaveBeenCalled();
    });

    it("queues nothing on a re-run for a user who already finished onboarding", async () => {
      const send = jest.fn(async () => "job-id");
      delegateToRealSortService({ hasCompletedOnboarding: true, send });
      contextAnalysisRepository.findOne.mockResolvedValue(
        recordWithCategories(),
      );

      await service.finalizeContextAnalysis(sortOptions);

      expect(send).not.toHaveBeenCalled();
    });

    it("still completes the analysis when queuing the sort fails", async () => {
      const send = jest.fn(async () => {
        throw new Error("pg-boss down");
      });
      delegateToRealSortService({ hasCompletedOnboarding: false, send });
      const record = recordWithCategories();
      contextAnalysisRepository.findOne.mockResolvedValue(record);

      await expect(
        service.finalizeContextAnalysis(sortOptions),
      ).resolves.toBeUndefined();

      expect(send).toHaveBeenCalled();
      expect(record).toMatchObject({ status: "completed", progress: 100 });
      expect(
        compressionService.enqueueContextCompressionIfNeeded,
      ).toHaveBeenCalledWith("user-1");
    });
  });
});
