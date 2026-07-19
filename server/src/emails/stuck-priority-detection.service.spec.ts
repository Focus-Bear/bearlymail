/**
 * Unit tests for StuckPriorityDetectionService.
 *
 * Verifies the safety-net that detects threads stuck at priority=0
 * (due to failed batch prioritisation runs) and re-queues them.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { StuckPriorityDetectionService } from "./stuck-priority-detection.service";

function makeThread(overrides: Partial<EmailThread> = {}): EmailThread {
  const thread = new EmailThread();
  thread.id = "thread-1";
  thread.userId = "user-1";
  thread.threadId = "provider-thread-1";
  thread.priorityScore = 0;
  thread.priorityExplanation = null;
  thread.isProcessingPriority = false;
  thread.priorityRetryCount = 0;
  thread.createdAt = new Date(Date.now() - 10 * 60 * 1000);
  return Object.assign(thread, overrides);
}

function makeEmail(overrides: Partial<Email> = {}): Email {
  const email = new Email();
  email.id = "email-1";
  email.emailThreadId = "thread-1";
  email.userId = "user-1";
  return Object.assign(email, overrides);
}

describe("StuckPriorityDetectionService", () => {
  let service: StuckPriorityDetectionService;
  let mockThreadRepo: jest.Mocked<Repository<EmailThread>>;
  let mockEmailRepo: jest.Mocked<Repository<Email>>;
  let mockBoss: jest.Mocked<Pick<PgBoss, "schedule" | "work" | "send">>;

  beforeEach(async () => {
    mockThreadRepo = {
      // Default to [] so the three detection queries don't return undefined when
      // a test only stubs some of them.
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    mockEmailRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Email>>;

    mockBoss = {
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue("job-id"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StuckPriorityDetectionService,
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: mockBoss,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepo,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockThreadRepo,
        },
        {
          // withUserKey runs the callback directly (per-user key context is
          // exercised in user-encryption.service.spec); here we just pass through.
          provide: UserEncryptionService,
          useValue: {
            withUserKey: jest.fn((_userId: string, fn: () => unknown) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<StuckPriorityDetectionService>(
      StuckPriorityDetectionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("onModuleInit", () => {
    it("registers the PgBoss schedule and worker", async () => {
      await service.onModuleInit();

      expect(mockBoss.schedule).toHaveBeenCalledWith(
        JOB_NAMES.DETECT_STUCK_PRIORITIES,
        expect.any(String),
      );
      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_NAMES.DETECT_STUCK_PRIORITIES,
        { batchSize: 1 },
        expect.any(Function),
      );
    });
  });

  describe("detectAndRequeueStalePriorityThreads", () => {
    it("does nothing when no stuck threads are found", async () => {
      mockThreadRepo.find.mockResolvedValue([]);

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).not.toHaveBeenCalled();
      expect(mockThreadRepo.increment).not.toHaveBeenCalled();
    });

    it("requeues a stuck thread with null explanation", async () => {
      const thread = makeThread({ priorityExplanation: null });
      const email = makeEmail();

      mockThreadRepo.find
        .mockResolvedValueOnce([thread])
        .mockResolvedValueOnce([]);
      mockEmailRepo.findOne.mockResolvedValue(email);

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).toHaveBeenCalledWith(
        JOB_NAMES.REFINE_PRIORITY,
        expect.objectContaining({ userId: thread.userId, emailId: email.id }),
        expect.any(Object),
      );
      expect(mockThreadRepo.increment).toHaveBeenCalledWith(
        { id: thread.id },
        "priorityRetryCount",
        1,
      );
    });

    it("skips a thread that has exceeded MAX_PRIORITY_RETRIES", async () => {
      const thread = makeThread({ priorityRetryCount: 3 });

      mockThreadRepo.find
        .mockResolvedValueOnce([thread])
        .mockResolvedValueOnce([]);
      mockEmailRepo.findOne.mockResolvedValue(null);

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).not.toHaveBeenCalled();
      expect(mockThreadRepo.increment).not.toHaveBeenCalled();
    });

    it("skips requeue when no email found for the thread", async () => {
      const thread = makeThread();

      mockThreadRepo.find
        .mockResolvedValueOnce([thread])
        .mockResolvedValueOnce([]);
      mockEmailRepo.findOne.mockResolvedValue(null);

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).not.toHaveBeenCalled();
    });

    it("requeues a thread stuck with isProcessingPriority=true and clears the flag", async () => {
      const thread = makeThread({ isProcessingPriority: true });
      const email = makeEmail();

      // Queries run in order: null-explanation, empty-breakdown, stuck-processing.
      mockThreadRepo.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([thread]);
      mockEmailRepo.findOne.mockResolvedValue(email);

      await service.detectAndRequeueStalePriorityThreads();

      // The stuck "Calculating…" flag is reset before re-queueing.
      expect(mockThreadRepo.update).toHaveBeenCalledWith(
        { id: thread.id },
        { isProcessingPriority: false },
      );
      expect(mockBoss.send).toHaveBeenCalledWith(
        JOB_NAMES.REFINE_PRIORITY,
        expect.objectContaining({ userId: thread.userId, emailId: email.id }),
        expect.any(Object),
      );
      expect(mockThreadRepo.increment).toHaveBeenCalledWith(
        { id: thread.id },
        "priorityRetryCount",
        1,
      );
    });

    it("deduplicates threads returned from both queries", async () => {
      const thread = makeThread();
      const email = makeEmail();

      mockThreadRepo.find
        .mockResolvedValueOnce([thread])
        .mockResolvedValueOnce([thread]);
      mockEmailRepo.findOne.mockResolvedValue(email);

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).toHaveBeenCalledTimes(1);
    });

    it("continues processing subsequent threads when one requeue fails", async () => {
      const thread1 = makeThread({ id: "thread-1", threadId: "provider-1" });
      const thread2 = makeThread({ id: "thread-2", threadId: "provider-2" });
      const email1 = makeEmail({ id: "email-1", emailThreadId: "thread-1" });
      const email2 = makeEmail({ id: "email-2", emailThreadId: "thread-2" });

      mockThreadRepo.find
        .mockResolvedValueOnce([thread1, thread2])
        .mockResolvedValueOnce([]);
      mockEmailRepo.findOne
        .mockResolvedValueOnce(email1)
        .mockResolvedValueOnce(email2);

      mockBoss.send
        .mockRejectedValueOnce(new Error("PgBoss unavailable"))
        .mockResolvedValueOnce("job-id-2");

      await service.detectAndRequeueStalePriorityThreads();

      expect(mockBoss.send).toHaveBeenCalledTimes(2);
      expect(mockThreadRepo.increment).toHaveBeenCalledTimes(1);
      expect(mockThreadRepo.increment).toHaveBeenCalledWith(
        { id: "thread-2" },
        "priorityRetryCount",
        1,
      );
    });
  });
});
