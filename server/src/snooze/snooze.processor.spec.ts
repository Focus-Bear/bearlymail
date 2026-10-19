import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { JOB_NAMES } from "../constants/job-names";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { SnoozeProcessor } from "./snooze.processor";

type BatchHandler = (jobs: Job<object>[]) => Promise<unknown>;

describe("SnoozeProcessor", () => {
  const userId = "user-1";
  const threadId = "gmail-thread-1";
  const snoozeUntil = "2026-10-16T21:00:00.000Z";

  let handlers: Map<string, BatchHandler>;
  let threadRepository: { update: jest.Mock; find: jest.Mock };
  let provider: { snoozeThread: jest.Mock };
  let emailProviderManager: { getPrimaryProvider: jest.Mock };
  let callOrder: string[];
  let userEncryptionService: { withUserKey: jest.Mock };

  beforeEach(async () => {
    handlers = new Map();
    callOrder = [];
    const boss = {
      schedule: jest.fn(),
      work: jest.fn((name: string, _options: object, handler: BatchHandler) => {
        handlers.set(name, handler);
        return Promise.resolve(`worker-${name}`);
      }),
    };
    threadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([]),
    };
    provider = {
      snoozeThread: jest.fn(async () => {
        callOrder.push("snoozeThread");
      }),
    };
    emailProviderManager = {
      getPrimaryProvider: jest.fn(async () => {
        callOrder.push("getPrimaryProvider");
        return provider;
      }),
    };
    userEncryptionService = {
      withUserKey: jest.fn(
        async (_userId: string, task: () => Promise<unknown>) => {
          callOrder.push("withUserKey:start");
          const result = await task();
          callOrder.push("withUserKey:end");
          return result;
        },
      ),
    };

    const processor = new SnoozeProcessor(
      mockPartial<PgBoss>(boss),
      mockPartial<Repository<EmailThread>>(threadRepository),
      mockPartial<Repository<Email>>({ update: jest.fn() }),
      mockPartial<EmailProviderManager>(emailProviderManager),
      mockPartial<CloudWatchService>({
        putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
      }),
      mockPartial<UserEncryptionService>(userEncryptionService),
    );
    await processor.onModuleInit();
  });

  const runProviderSyncJob = () =>
    handlers.get(JOB_NAMES.SNOOZE_THREAD_PROVIDER_SYNC)!([
      mockPartial<Job<object>>({
        id: "job-1",
        data: { userId, threadId, snoozeUntil },
      }),
    ]);

  describe("snooze-thread-provider-sync (bulk snooze)", () => {
    it("loads the provider under the user's encryption key", async () => {
      await runProviderSyncJob();

      expect(userEncryptionService.withUserKey).toHaveBeenCalledWith(
        userId,
        expect.any(Function),
      );
      // getPrimaryProvider decrypts the user's OAuth rows, so it must run
      // inside withUserKey or the job fails and the provider never snoozes.
      expect(callOrder).toEqual([
        "withUserKey:start",
        "getPrimaryProvider",
        "snoozeThread",
        "withUserKey:end",
      ]);
      expect(provider.snoozeThread).toHaveBeenCalledWith(
        userId,
        threadId,
        new Date(snoozeUntil),
      );
    });

    it("marks the thread synced once the provider has snoozed it", async () => {
      await runProviderSyncJob();

      expect(threadRepository.update).toHaveBeenCalledWith(
        { userId, threadId },
        expect.objectContaining({ syncStatus: "synced" }),
      );
    });

    it("leaves the thread unsynced when no provider is connected", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValueOnce(null);

      await runProviderSyncJob();

      expect(provider.snoozeThread).not.toHaveBeenCalled();
      expect(threadRepository.update).not.toHaveBeenCalled();
    });
  });
});
