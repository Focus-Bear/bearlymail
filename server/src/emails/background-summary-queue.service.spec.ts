import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";

describe("BackgroundSummaryQueueService", () => {
  let service: BackgroundSummaryQueueService;
  let boss: { send: jest.Mock };
  let emailRepository: { update: jest.Mock };

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-1") };
    emailRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackgroundSummaryQueueService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
        { provide: getRepositoryToken(Email), useValue: emailRepository },
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

    it("clears the processing flag if the enqueue fails", async () => {
      boss.send.mockRejectedValueOnce(new Error("pg-boss down"));

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

  it("enqueues a background summary when the score is above the threshold", async () => {
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: PRIORITY_SCORES.BACKGROUND_SUMMARY_MIN + 1,
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

  it("does NOT enqueue and clears isProcessingSummary at exactly the threshold", async () => {
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: PRIORITY_SCORES.BACKGROUND_SUMMARY_MIN,
    });

    expect(boss.send).not.toHaveBeenCalled();
    expect(emailRepository.update).toHaveBeenCalledWith(
      { id: "email-1" },
      { isProcessingSummary: false },
    );
  });

  it("does NOT enqueue and clears the flag for a low score", async () => {
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: 5,
    });

    expect(boss.send).not.toHaveBeenCalled();
    expect(emailRepository.update).toHaveBeenCalledWith(
      { id: "email-1" },
      { isProcessingSummary: false },
    );
  });

  it("treats a null score as not eligible (clears the flag, no enqueue)", async () => {
    await service.maybeQueueBackgroundSummary({
      userId: "user-1",
      emailId: "email-1",
      threadId: "thread-1",
      priorityScore: null,
    });

    expect(boss.send).not.toHaveBeenCalled();
    expect(emailRepository.update).toHaveBeenCalledWith(
      { id: "email-1" },
      { isProcessingSummary: false },
    );
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
