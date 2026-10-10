import { ContextKey, Source } from "../database/entities/user-context.entity";
import { ContextAnalysisFinalizerService } from "./context-analysis-finalizer.service";
import type { StoredBatchResult } from "./context-discovery.types";

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
  let llmService: { consolidateEmailCategories: jest.Mock };
  let usersService: { update: jest.Mock };
  let crudService: {
    createOrUpdateContext: jest.Mock;
    deduplicateExistingContext: jest.Mock;
  };
  let compressionService: { enqueueContextCompressionIfNeeded: jest.Mock };
  let piiRedactionService: { areContextValuesSimilar: jest.Mock };
  let service: ContextAnalysisFinalizerService;

  beforeEach(() => {
    jest.useFakeTimers();
    contextAnalysisRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    contextRepository = { find: jest.fn().mockResolvedValue([]) };
    llmService = {
      consolidateEmailCategories: jest.fn(
        async (categories: Array<{ name: string; description: string }>) =>
          categories.map((category) => ({ ...category, isUserAdded: false })),
      ),
    };
    usersService = { update: jest.fn().mockResolvedValue(undefined) };
    crudService = {
      createOrUpdateContext: jest.fn().mockResolvedValue(undefined),
      deduplicateExistingContext: jest.fn().mockResolvedValue(undefined),
    };
    compressionService = {
      enqueueContextCompressionIfNeeded: jest.fn().mockResolvedValue(false),
    };
    piiRedactionService = { areContextValuesSimilar: jest.fn(() => false) };
    service = new ContextAnalysisFinalizerService(
      contextAnalysisRepository as never,
      contextRepository as never,
      llmService as never,
      usersService as never,
      crudService as never,
      compressionService as never,
      piiRedactionService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("mergeBatchResults", () => {
    it("merges categories across batches, skipping failed batches and near-duplicate names", () => {
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
        "💸 Invoices & Receipts",
      ]);
      expect(merged.vipContacts.map((contact) => contact.name)).toEqual([
        "Priya Raman",
        "Tom Becker",
      ]);
      expect(merged.urgentHints).toEqual(["Sentry alerts"]);
      expect(merged.threadIds).toEqual(["a", "b", "c"]);
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

    it("consolidates categories, then persists categories, VIPs and hints and completes the record", async () => {
      const record = {
        id: "analysis-1",
        analyzedCount: 20,
        stats: {
          batchResults: {
            "0": completed({
              categories: [{ name: "📰 Newsletters", description: "digests" }],
              vipContacts: [{ name: "Priya Raman", reason: "client" }],
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

      expect(llmService.consolidateEmailCategories).toHaveBeenCalledWith(
        [{ name: "📰 Newsletters", description: "digests" }],
        [],
        undefined,
        "user-1",
      );
      const writes = crudService.createOrUpdateContext.mock.calls.map(
        ([, key, value]) => [key, value],
      );
      expect(writes).toEqual([
        [ContextKey.EMAIL_CATEGORY, "📰 Newsletters - digests"],
        [ContextKey.VIP_CONTACT, "Priya Raman"],
        [ContextKey.URGENT, "Production alerts"],
        [ContextKey.NOT_IMPORTANT, "Retail promotions"],
      ]);
      expect(crudService.createOrUpdateContext.mock.calls[0][3]).toBe(
        Source.AUTOGENERATED,
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

    it("keeps the discovered list when consolidation fails", async () => {
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
      llmService.consolidateEmailCategories.mockRejectedValue(
        new Error("llm down"),
      );

      await service.finalizeContextAnalysis(options);

      expect(crudService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.EMAIL_CATEGORY,
        "📰 Newsletters - digests",
        Source.AUTOGENERATED,
        expect.anything(),
      );
    });
  });
});
