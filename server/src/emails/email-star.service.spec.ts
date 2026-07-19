/**
 * Unit tests for EmailStarService promote-to-Action behaviour: when a thread
 * that was scored cheaply (local model / deterministic rule) is starred into
 * Action, it should be upgraded with a full LLM priority+summary pass.
 */
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailStarService } from "./email-star.service";

type ThreadSource = EmailThread["prioritySource"];

function buildService(thread: Partial<EmailThread>) {
  const emailThreadRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: "thread-uuid",
      userId: "user-1",
      threadId: "provider-thread",
      starCount: 0,
      ...thread,
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as Repository<EmailThread>;

  const boss = {
    send: jest.fn().mockResolvedValue("job-id"),
  } as unknown as jest.Mocked<Pick<PgBoss, "send">>;

  const suggestedRepliesService = {
    queueSuggestedReplyGeneration: jest.fn().mockResolvedValue(undefined),
  };

  const emailProviderManager = {
    getPrimaryProvider: jest.fn().mockResolvedValue(null),
  } as unknown as EmailProviderManager;

  const service = new EmailStarService(
    {} as unknown as Repository<Email>,
    emailThreadRepository,
    emailProviderManager,
    suggestedRepliesService as unknown as never,
    boss as unknown as PgBoss,
  );

  return { service, boss, emailThreadRepository };
}

const getEmailById = jest
  .fn()
  .mockResolvedValue({ id: "email-1", threadId: "provider-thread" } as Email);
const updateThreadStarCount = jest.fn().mockResolvedValue(undefined);

function refinePriorityCalls(boss: jest.Mocked<Pick<PgBoss, "send">>) {
  return boss.send.mock.calls.filter(
    (call) => call[0] === JOB_NAMES.REFINE_PRIORITY,
  );
}

describe("EmailStarService — promote-to-Action LLM upgrade", () => {
  afterEach(() => jest.clearAllMocks());

  it.each<ThreadSource>(["local", "rule"])(
    "re-queues an LLM priority refinement when a %s-scored thread is promoted to Action",
    async (prioritySource) => {
      const { service, boss, emailThreadRepository } = buildService({
        prioritySource,
        starCount: 0,
      });

      await service.setStarCount(
        "user-1",
        "email-1",
        3,
        getEmailById,
        updateThreadStarCount,
      );

      const calls = refinePriorityCalls(boss);
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual(
        expect.objectContaining({
          userId: "user-1",
          emailId: "email-1",
          forceRecalculate: true,
        }),
      );
      // Marks the thread processing so the UI shows "Calculating…" during the upgrade.
      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-uuid" },
        { isProcessingPriority: true },
      );
    },
  );

  it("resets isProcessingPriority when the upgrade job fails to queue", async () => {
    const { service, boss, emailThreadRepository } = buildService({
      prioritySource: "local",
      starCount: 0,
    });
    (boss.send as jest.Mock).mockRejectedValue(new Error("pg-boss down"));

    await service.setStarCount(
      "user-1",
      "email-1",
      3,
      getEmailById,
      updateThreadStarCount,
    );

    // Flag was set true, the send failed, so it must be reset to false.
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-uuid" },
      { isProcessingPriority: true },
    );
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-uuid" },
      { isProcessingPriority: false },
    );
  });

  it("does NOT re-queue when the thread is already LLM-scored", async () => {
    const { service, boss } = buildService({
      prioritySource: "llm",
      starCount: 0,
    });

    await service.setStarCount(
      "user-1",
      "email-1",
      3,
      getEmailById,
      updateThreadStarCount,
    );

    expect(refinePriorityCalls(boss)).toHaveLength(0);
  });

  it("does NOT re-queue when the thread was already in Action (not a fresh promotion)", async () => {
    const { service, boss } = buildService({
      prioritySource: "local",
      starCount: 2,
    });

    await service.setStarCount(
      "user-1",
      "email-1",
      3,
      getEmailById,
      updateThreadStarCount,
    );

    expect(refinePriorityCalls(boss)).toHaveLength(0);
  });
});
