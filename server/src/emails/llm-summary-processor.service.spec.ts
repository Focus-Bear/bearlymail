import type { Repository } from "typeorm";

import type { CloudWatchService } from "../aws/cloudwatch.service";
import type { CategoryRulesService } from "../category-rules/category-rules.service";
import type { ContactTypeClassifierService } from "../crm/contact-type-classifier.service";
import type { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { UserEncryptionService } from "../encryption/user-encryption.service";
import type { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import type { LLMCoreService } from "../llm/llm-core.service";
import type { PriorityCacheService } from "../priority/priority-cache.service";
import type { JobPerformanceTracker } from "../queue/job-performance-tracker";
import type { SummarizationService } from "../summarization/summarization.service";
import type { EmailsService } from "./emails.service";
import { recategoriseFromSummary } from "./incremental-recategorise.helper";
import type { IncrementalSummaryHelperService } from "./incremental-summary-helper.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

jest.mock("./incremental-recategorise.helper", () => ({
  recategoriseFromSummary: jest.fn(),
  threadNeedsLocalModelRecategorisation: jest.fn().mockReturnValue(false),
}));

/** Builds the service with just the collaborators these tests exercise. */
function makeService(mocks: {
  emailRepository?: unknown;
  emailThreadRepository?: unknown;
  emailsService?: unknown;
  summarizationService?: unknown;
  incrementalAnalysisService?: unknown;
  priorityCacheService?: unknown;
  incrementalSummaryHelper?: unknown;
}): LLMSummaryProcessorService {
  return new LLMSummaryProcessorService(
    mocks.emailRepository as Repository<Email>,
    mocks.emailThreadRepository as Repository<EmailThread>,
    {} as Repository<Contact>,
    mocks.emailsService as EmailsService,
    mocks.summarizationService as SummarizationService,
    mocks.incrementalAnalysisService as IncrementalAnalysisService,
    mocks.priorityCacheService as PriorityCacheService,
    {} as ContactTypeClassifierService,
    {} as CloudWatchService,
    {} as UserEncryptionService,
    mocks.incrementalSummaryHelper as IncrementalSummaryHelperService,
    {} as CategoryRulesService,
    {} as LLMCoreService,
  );
}

describe("LLMSummaryProcessorService.ensureThreadSummaryFresh", () => {
  beforeEach(() => jest.clearAllMocks());

  it("regenerates the FULL summary and advances lastSummarizedAt when the stored summary predates the new email", async () => {
    const emailRepository = { update: jest.fn() };
    const emailThreadRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: "t1",
        lastSummarizedAt: new Date("2026-01-01"),
      }),
      update: jest.fn(),
    };
    const summarizationService = {
      summarizeEmailWithAutoRule: jest.fn().mockResolvedValue({
        summary: "Fresh thread summary reflecting the QA pass",
        sentimentScore: null,
      }),
    };
    const emailsService = {
      getThreadEmails: jest.fn().mockResolvedValue([
        { id: "e1", receivedAt: new Date("2026-01-02") },
        { id: "e2", receivedAt: new Date("2026-01-03") },
      ]),
    };

    const service = makeService({
      emailRepository,
      emailThreadRepository,
      summarizationService,
      emailsService,
    });

    const email = {
      id: "e2",
      emailThreadId: "t1",
      threadId: "pt1",
      // Arrived AFTER the last summarisation → the stored summary is stale.
      receivedAt: new Date("2026-01-03"),
      summary: "old bug summary",
    } as unknown as Email;

    await service.ensureThreadSummaryFresh(email, "user-1", "worker-1");

    expect(
      summarizationService.summarizeEmailWithAutoRule,
    ).toHaveBeenCalledWith("user-1", "e2", email);
    // Persisted across every email in the thread (In(...) wraps a FindOperator).
    expect(emailRepository.update).toHaveBeenCalledTimes(1);
    const [whereArg, payload] = emailRepository.update.mock.calls[0];
    expect((whereArg.id as { value: string[] }).value).toEqual(
      expect.arrayContaining(["e1", "e2"]),
    );
    expect(payload).toEqual(
      expect.objectContaining({
        summary: "Fresh thread summary reflecting the QA pass",
        summarySource: "llm",
      }),
    );
    // lastSummarizedAt advanced to the newest email in the thread.
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "t1" },
      { lastSummarizedAt: new Date("2026-01-03") },
    );
    // In-memory summary updated so the immediate caller reads it.
    expect(email.summary).toBe("Fresh thread summary reflecting the QA pass");
  });

  it("is a no-op when the stored summary already covers the new email", async () => {
    const emailThreadRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: "t1",
        lastSummarizedAt: new Date("2026-01-05"),
      }),
      update: jest.fn(),
    };
    const summarizationService = { summarizeEmailWithAutoRule: jest.fn() };

    const service = makeService({
      emailRepository: { update: jest.fn() },
      emailThreadRepository,
      summarizationService,
      emailsService: { getThreadEmails: jest.fn() },
    });

    const email = {
      id: "e1",
      emailThreadId: "t1",
      threadId: "pt1",
      // At or before lastSummarizedAt → the stored summary already covers it.
      receivedAt: new Date("2026-01-04"),
      summary: "already-fresh summary",
    } as unknown as Email;

    await service.ensureThreadSummaryFresh(email, "user-1", "worker-1");

    expect(
      summarizationService.summarizeEmailWithAutoRule,
    ).not.toHaveBeenCalled();
    expect(emailThreadRepository.update).not.toHaveBeenCalled();
    expect(email.summary).toBe("already-fresh summary");
  });

  it("does nothing for an email with no thread", async () => {
    const summarizationService = { summarizeEmailWithAutoRule: jest.fn() };
    const service = makeService({ summarizationService });
    const email = { id: "e1", emailThreadId: null } as unknown as Email;

    await service.ensureThreadSummaryFresh(email, "user-1", "worker-1");

    expect(
      summarizationService.summarizeEmailWithAutoRule,
    ).not.toHaveBeenCalled();
  });
});

describe("LLMSummaryProcessorService.tryIncrementalAnalysis ordering", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refreshes the full summary BEFORE re-categorising, and never uses the lossy incremental update", async () => {
    const incrementalSummaryHelper = {
      getThreadSummary: jest.fn().mockResolvedValue("existing summary"),
      updateSummaryIncrementally: jest.fn(),
    };
    const priorityCacheService = {
      getUserContexts: jest.fn().mockResolvedValue([]),
    };
    const incrementalAnalysisService = {
      formatThreadContextForIncremental: jest.fn().mockReturnValue(""),
      checkIfRecalcNeeded: jest.fn().mockResolvedValue({
        needsFullRecalc: false,
        reason: "no material change",
        suggestedUrgencyDelta: 0,
      }),
    };
    const emailsService = { getThreadEmails: jest.fn().mockResolvedValue([]) };

    const service = makeService({
      emailThreadRepository: { update: jest.fn() },
      emailsService,
      incrementalAnalysisService,
      priorityCacheService,
      incrementalSummaryHelper,
    });

    // ensureThreadSummaryFresh does its own DB work; stub it so we can assert
    // it runs before recategoriseFromSummary.
    const ensureFresh = jest
      .spyOn(service, "ensureThreadSummaryFresh")
      .mockResolvedValue(undefined);

    const thread = {
      id: "t1",
      categoryId: "cat-1",
      urgencyScore: 40,
      priorityExplanation: {
        score: 50,
        breakdown: [{ factor: "Sender", value: 10, description: "known" }],
      },
    } as unknown as EmailThread;
    const email = {
      id: "e1",
      emailThreadId: "t1",
      threadId: "pt1",
      from: "a@b.com",
      subject: "Re: bug",
      body: "QA Status: Pass",
      receivedAt: new Date("2026-01-03"),
    } as unknown as Email;
    const tracker = {
      startPhase: jest.fn(),
      endPhase: jest.fn(),
      finish: jest.fn(),
    } as unknown as JobPerformanceTracker;

    const result = await service.tryIncrementalAnalysis({
      thread,
      email,
      forceRecalculate: false,
      userId: "user-1",
      workerId: "worker-1",
      tracker,
    });

    expect(result.handled).toBe(true);
    // The lossy incremental append is no longer used before categorisation.
    expect(
      incrementalSummaryHelper.updateSummaryIncrementally,
    ).not.toHaveBeenCalled();
    // The full summary refresh runs before the re-categorisation reads it.
    expect(ensureFresh).toHaveBeenCalledWith(email, "user-1", "worker-1");
    expect(recategoriseFromSummary).toHaveBeenCalledTimes(1);
    expect(ensureFresh.mock.invocationCallOrder[0]).toBeLessThan(
      (recategoriseFromSummary as jest.Mock).mock.invocationCallOrder[0],
    );
  });
});
