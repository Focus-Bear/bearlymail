import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";

describe("BackgroundSummaryQueueService", () => {
  let service: BackgroundSummaryQueueService;
  let boss: { send: jest.Mock };
  let emailRepository: { update: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-1") };
    emailRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      // Default: no usable text, so the deterministic-summary path clears the
      // flag without writing a summary. Tests that exercise the summary set a
      // body explicitly.
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackgroundSummaryQueueService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        { provide: getRepositoryToken(Email), useValue: emailRepository },
        {
          // Pass through: run the callback directly (per-user key context is
          // covered in user-encryption.service.spec).
          provide: UserEncryptionService,
          useValue: {
            withUserKey: jest.fn((_userId: string, fn: () => unknown) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get(BackgroundSummaryQueueService);
  });

  afterEach(() => jest.clearAllMocks());

  describe("queueBackgroundSummary (LLM path — unconditional)", () => {
    it("always enqueues regardless of score and never clears the flag", async () => {
      await service.queueBackgroundSummary({
        userId: "user-1",
        emailId: "email-1",
        threadId: "thread-1",
      });

      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.GENERATE_SUMMARY,
        { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
        expect.objectContaining({
          singletonKey: "generate-summary-email-email-1",
        }),
      );
      expect(emailRepository.update).not.toHaveBeenCalled();
    });

    it("falls back to a deterministic summary when the enqueue fails (body present)", async () => {
      boss.send.mockRejectedValueOnce(new Error("pg-boss down"));
      emailRepository.findOne.mockResolvedValueOnce({
        id: "email-1",
        body: "Quarterly newsletter: three cat facts you might enjoy.",
        htmlBody: null,
      });

      await service.queueBackgroundSummary({
        userId: "user-1",
        emailId: "email-1",
        threadId: "thread-1",
      });

      expect(emailRepository.update).toHaveBeenCalledWith(
        { id: "email-1" },
        expect.objectContaining({
          summary: expect.stringContaining("cat facts"),
          summarySource: "deterministic",
          isProcessingSummary: false,
        }),
      );
    });

    it("clears the processing flag if the enqueue fails and there is no body", async () => {
      boss.send.mockRejectedValueOnce(new Error("pg-boss down"));
      // findOne returns null by default in this suite -> no deterministic text.

      await service.queueBackgroundSummary({
        userId: "user-1",
        emailId: "email-1",
        threadId: "thread-1",
      });

      expect(emailRepository.update).toHaveBeenCalledWith(
        { id: "email-1" },
        { isProcessingSummary: false },
      );
    });
  });

  it("enqueues a background summary regardless of priority score", async () => {
    // High score
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: 90,
    });

    expect(boss.send).toHaveBeenLastCalledWith(
      JOB_NAMES.GENERATE_SUMMARY,
      { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      expect.objectContaining({
        singletonKey: "generate-summary-email-email-1",
      }),
    );

    // Low score
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: 5,
    });

    expect(boss.send).toHaveBeenLastCalledWith(
      JOB_NAMES.GENERATE_SUMMARY,
      { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      expect.objectContaining({
        singletonKey: "generate-summary-email-email-1",
      }),
    );

    // Null score
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: null,
    });

    expect(boss.send).toHaveBeenLastCalledWith(
      JOB_NAMES.GENERATE_SUMMARY,
      { userId: "user-1", emailId: "email-1", threadId: "thread-1" },
      expect.objectContaining({
        singletonKey: "generate-summary-email-email-1",
      }),
    );

    expect(emailRepository.update).not.toHaveBeenCalled();
  });

  it("clears the processing flag if enqueue fails", async () => {
    boss.send.mockRejectedValueOnce(new Error("pg-boss down"));

    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: 90,
    });

    expect(emailRepository.update).toHaveBeenCalledWith(
      { id: "email-1" },
      { isProcessingSummary: false },
    );
  });
});
