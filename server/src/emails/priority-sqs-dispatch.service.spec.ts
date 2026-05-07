import { Test, TestingModule } from "@nestjs/testing";

import { SqsService } from "../aws/sqs.service";
import {
  buildPriorityBatchDeduplicationId,
  type PriorityBatchPayload,
  type PriorityEmailPayload,
  PrioritySqsDispatchService,
  PrioritySqsEnqueueJobContext,
  trimPayloadToSqsLimit,
} from "./priority-sqs-dispatch.service";

function makeEmail(
  overrides: Partial<PriorityEmailPayload> = {},
): PriorityEmailPayload {
  return {
    emailKey: "email-1",
    from: "sender@example.com",
    fromName: "Test Sender",
    subject: "Test Subject",
    body: "Test body content",
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<PrioritySqsEnqueueJobContext> = {},
): PrioritySqsEnqueueJobContext {
  return {
    userId: "user-1",
    analysisId: "analysis-abc",
    emails: [makeEmail()],
    userContext: {
      urgentItems: [],
      notUrgentItems: [],
      goals: [],
      workingOn: [],
      dontCare: [],
      emailCategories: [],
      protoCategories: [],
    },
    totalBatches: 1,
    ...overrides,
  };
}

describe("buildPriorityBatchDeduplicationId", () => {
  it("should build a stable deduplication ID from analysisId and batchIndex", () => {
    expect(buildPriorityBatchDeduplicationId("abc123", 0)).toBe(
      "priority-abc123-batch-0",
    );
    expect(buildPriorityBatchDeduplicationId("xyz", 5)).toBe(
      "priority-xyz-batch-5",
    );
  });

  it("should produce distinct IDs for different batch indices", () => {
    const id0 = buildPriorityBatchDeduplicationId("analysis-1", 0);
    const id1 = buildPriorityBatchDeduplicationId("analysis-1", 1);
    expect(id0).not.toBe(id1);
  });
});

describe("trimPayloadToSqsLimit", () => {
  it("should return the original payload if it is within the SQS limit", () => {
    const payload: PriorityBatchPayload = {
      userId: "user-1",
      batchIndex: 0,
      totalBatches: 1,
      analysisId: "analysis-1",
      emails: [makeEmail({ body: "Short body" })],
      userContext: {
        urgentItems: [],
        notUrgentItems: [],
        goals: [],
        workingOn: [],
        dontCare: [],
        emailCategories: [],
        protoCategories: [],
      },
    };
    expect(trimPayloadToSqsLimit(payload)).toBe(payload);
  });

  it("should trim email bodies when payload exceeds 230 KB", () => {
    // 300 KB body to exceed the SQS soft limit
    const longBody = "x".repeat(300 * 1024);
    const payload: PriorityBatchPayload = {
      userId: "user-1",
      batchIndex: 0,
      totalBatches: 1,
      analysisId: "analysis-1",
      emails: [makeEmail({ body: longBody })],
      userContext: {
        urgentItems: [],
        notUrgentItems: [],
        goals: [],
        workingOn: [],
        dontCare: [],
        emailCategories: [],
        protoCategories: [],
      },
    };
    const trimmed = trimPayloadToSqsLimit(payload);
    expect(trimmed).not.toBe(payload);
    expect(
      Buffer.byteLength(JSON.stringify(trimmed), "utf-8"),
    ).toBeLessThanOrEqual(230 * 1024);
    expect(trimmed.emails[0].body.length).toBeLessThan(longBody.length);
  });

  it("should strip bodies entirely if even 50 chars per email exceeds the limit", () => {
    // 5 emails with huge user context to push payload over limit even with 50-char bodies
    const hugeContext = "x".repeat(250 * 1024);
    const payload: PriorityBatchPayload = {
      userId: "user-1",
      batchIndex: 0,
      totalBatches: 1,
      analysisId: "analysis-1",
      emails: Array.from({ length: 5 }, (_, i) =>
        makeEmail({ emailKey: `email-${i}`, body: "Short body" }),
      ),
      userContext: {
        urgentItems: [{ value: hugeContext }],
        notUrgentItems: [],
        goals: [],
        workingOn: [],
        dontCare: [],
        emailCategories: [],
        protoCategories: [],
      },
    };
    const trimmed = trimPayloadToSqsLimit(payload);
    expect(
      Buffer.byteLength(JSON.stringify(trimmed), "utf-8"),
    ).toBeLessThanOrEqual(230 * 1024);
  });
});

describe("PrioritySqsDispatchService", () => {
  let service: PrioritySqsDispatchService;
  let sqsService: jest.Mocked<SqsService>;

  beforeEach(async () => {
    const mockSqsService: jest.Mocked<Partial<SqsService>> = {
      sendPrioritisationMessageBatch: jest.fn(),
      sendPrioritisationMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrioritySqsDispatchService,
        {
          provide: SqsService,
          useValue: mockSqsService,
        },
      ],
    }).compile();

    service = module.get<PrioritySqsDispatchService>(
      PrioritySqsDispatchService,
    );
    sqsService = module.get(SqsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("enqueueAllBatchesViaSqs", () => {
    it("should dispatch one SQS batch message per batch", async () => {
      sqsService.sendPrioritisationMessageBatch.mockResolvedValue({
        messageIds: ["msg-1", "msg-2"],
        failed: [],
      });

      const ctx = makeContext({ totalBatches: 2 });
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
      const batches = [
        { batchNum: 0, batchPayload: [makeEmail({ emailKey: "e1" })] },
        { batchNum: 1, batchPayload: [makeEmail({ emailKey: "e2" })] },
      ];

      const results = await service.enqueueAllBatchesViaSqs(
        batches,
        ctx,
        enqueueErrors,
      );

      expect(sqsService.sendPrioritisationMessageBatch).toHaveBeenCalledTimes(
        1,
      );
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ jobId: "msg-1", batchNum: 0 });
      expect(results[1]).toEqual({ jobId: "msg-2", batchNum: 1 });
      expect(enqueueErrors).toHaveLength(0);
    });

    it("should record enqueue errors for failed SQS messages", async () => {
      sqsService.sendPrioritisationMessageBatch.mockResolvedValue({
        messageIds: [null, "msg-2"],
        failed: [0],
      });

      const ctx = makeContext({ totalBatches: 2 });
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
      const batches = [
        { batchNum: 0, batchPayload: [makeEmail({ emailKey: "e1" })] },
        { batchNum: 1, batchPayload: [makeEmail({ emailKey: "e2" })] },
      ];

      const results = await service.enqueueAllBatchesViaSqs(
        batches,
        ctx,
        enqueueErrors,
      );

      expect(results[0]).toEqual({ jobId: null, batchNum: 0 });
      expect(results[1]).toEqual({ jobId: "msg-2", batchNum: 1 });
      expect(enqueueErrors).toHaveLength(1);
      // batchNum is 0-indexed internally, reported as batchNum+1 in errors
      expect(enqueueErrors[0].batchNum).toBe(1);
    });

    it("should use unique deduplication IDs per batch", async () => {
      sqsService.sendPrioritisationMessageBatch.mockResolvedValue({
        messageIds: ["msg-1"],
        failed: [],
      });

      const ctx = makeContext({ analysisId: "test-analysis", totalBatches: 1 });
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

      await service.enqueueAllBatchesViaSqs(
        [{ batchNum: 3, batchPayload: [makeEmail()] }],
        ctx,
        enqueueErrors,
      );

      const calledMessages =
        sqsService.sendPrioritisationMessageBatch.mock.calls[0][0];
      expect(calledMessages[0].deduplicationId).toBe(
        "priority-test-analysis-batch-3",
      );
    });

    it("should assign unique MessageGroupIds per batch for parallel processing", async () => {
      sqsService.sendPrioritisationMessageBatch.mockResolvedValue({
        messageIds: ["msg-1", "msg-2"],
        failed: [],
      });

      const ctx = makeContext({ analysisId: "analysis-xyz", totalBatches: 2 });
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

      await service.enqueueAllBatchesViaSqs(
        [
          { batchNum: 0, batchPayload: [makeEmail()] },
          { batchNum: 1, batchPayload: [makeEmail()] },
        ],
        ctx,
        enqueueErrors,
      );

      const calledMessages =
        sqsService.sendPrioritisationMessageBatch.mock.calls[0][0];
      const groupIds = calledMessages.map((msg) => msg.messageGroupId);
      expect(groupIds[0]).toBe("analysis-xyz-batch-0");
      expect(groupIds[1]).toBe("analysis-xyz-batch-1");
      expect(new Set(groupIds).size).toBe(2);
    });
  });

  describe("enqueueSingleBatchViaSqs", () => {
    it("should send a single SQS message and return its ID", async () => {
      sqsService.sendPrioritisationMessage.mockResolvedValue("single-msg-id");

      const ctx = makeContext();
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

      const result = await service.enqueueSingleBatchViaSqs(
        0,
        [makeEmail()],
        ctx,
        enqueueErrors,
      );

      expect(result).toEqual({ jobId: "single-msg-id", batchNum: 0 });
      expect(enqueueErrors).toHaveLength(0);
    });

    it("should record an enqueue error when SQS throws", async () => {
      sqsService.sendPrioritisationMessage.mockRejectedValue(
        new Error("SQS unavailable"),
      );

      const ctx = makeContext();
      const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

      const result = await service.enqueueSingleBatchViaSqs(
        2,
        [makeEmail()],
        ctx,
        enqueueErrors,
      );

      expect(result).toEqual({ jobId: null, batchNum: 2 });
      expect(enqueueErrors).toHaveLength(1);
      expect(enqueueErrors[0].error).toContain("SQS unavailable");
    });
  });
});
