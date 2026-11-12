import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { JOB_NAMES } from "../constants/job-names";
import { OnboardingAnalysisStartService } from "../context/onboarding-analysis-start.service";
import { User } from "../database/entities/user.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { EmailProvider } from "./interfaces/email-provider.interface";
import { GmailProvider } from "./providers/gmail.provider";

// The real service pulls in billing (Stripe); this spec only checks it isn't reached.
jest.mock("../context/onboarding-analysis-start.service", () => ({
  OnboardingAnalysisStartService: class {},
}));

type JobBatchHandler = (
  jobs: Array<{ id: string; data: object }>,
) => Promise<unknown>;

const NEW_USER = mockPartial<User>({
  id: "new-user",
  termsAcceptedAt: null,
  hasCompletedOnboarding: false,
});
const CONSENTED_USER = mockPartial<User>({
  id: "consented-user",
  termsAcceptedAt: new Date("2026-11-10T09:00:00Z"),
  hasCompletedOnboarding: false,
});
const CONSENTED_USER_IDS = new Set([CONSENTED_USER.id]);

describe("EmailSyncProcessor — terms-of-use gate", () => {
  let handlers: Map<string, JobBatchHandler>;
  let boss: { schedule: jest.Mock; work: jest.Mock; send: jest.Mock };
  let providerManager: {
    syncAllProviders: jest.Mock;
    getPrimaryProvider: jest.Mock;
  };
  let scanHistory: jest.Mock;
  let startForNewMailbox: jest.Mock;

  async function runJob(name: string, userId: string): Promise<void> {
    const handler = handlers.get(name);
    if (!handler) {
      throw new Error(`No worker registered for ${name}`);
    }
    await handler([{ id: "job-1", data: { userId } }]);
  }

  beforeEach(async () => {
    handlers = new Map();
    boss = {
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn(
        (name: string, _options: object, handler: JobBatchHandler) => {
          handlers.set(name, handler);
          return Promise.resolve(name);
        },
      ),
      send: jest.fn().mockResolvedValue("job-id"),
    };
    scanHistory = jest.fn().mockResolvedValue(undefined);
    providerManager = {
      syncAllProviders: jest.fn().mockResolvedValue(undefined),
      getPrimaryProvider: jest
        .fn()
        .mockResolvedValue(mockPartial<EmailProvider>({ scanHistory })),
    };
    startForNewMailbox = jest.fn().mockResolvedValue(undefined);
    const usersService = mockPartial<UsersService>({
      findAll: jest.fn().mockResolvedValue([NEW_USER, CONSENTED_USER]),
      hasEmailProcessingConsent: jest.fn((userId: string) =>
        Promise.resolve(CONSENTED_USER_IDS.has(userId)),
      ),
    });

    const processor = new EmailSyncProcessor(
      mockPartial<PgBoss>(boss),
      mockPartial<EmailProviderManager>(providerManager),
      usersService,
      mockPartial<GmailProvider>({ syncEmails: jest.fn() }),
      mockPartial<ConfigService>({ get: jest.fn() }),
      mockPartial<CloudWatchService>({
        putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
      }),
      mockPartial<UserEncryptionService>({
        withUserKey: jest.fn((_userId: string, work: () => Promise<void>) =>
          work(),
        ),
      }),
      mockPartial<OnboardingAnalysisStartService>({ startForNewMailbox }),
    );
    await processor.onModuleInit();
  });

  it("fetches nothing for a user who hasn't accepted the terms yet", async () => {
    await runJob(JOB_NAMES.FETCH_USER_EMAILS, NEW_USER.id);

    expect(providerManager.syncAllProviders).not.toHaveBeenCalled();
    expect(startForNewMailbox).not.toHaveBeenCalled();
  });

  it("syncs and starts the onboarding analysis once the terms are accepted", async () => {
    await runJob(JOB_NAMES.FETCH_USER_EMAILS, CONSENTED_USER.id);

    expect(startForNewMailbox).toHaveBeenCalledWith(
      CONSENTED_USER.id,
      expect.any(Function),
    );
    expect(providerManager.syncAllProviders).toHaveBeenCalledWith(
      CONSENTED_USER.id,
      undefined,
    );
  });

  it.each([JOB_NAMES.FETCH_USER_EMAILS_EXTENDED, JOB_NAMES.SYNC_GMAIL])(
    "skips %s before the terms are accepted",
    async (jobName) => {
      await runJob(jobName, NEW_USER.id);

      expect(providerManager.syncAllProviders).not.toHaveBeenCalled();
    },
  );

  it("does not scan mailbox history before the terms are accepted", async () => {
    await runJob(JOB_NAMES.SCAN_HISTORY, NEW_USER.id);

    expect(scanHistory).not.toHaveBeenCalled();
  });

  it("only schedules fetches for users who accepted the terms", async () => {
    await runJob(JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS, "cron");

    const queuedUserIds = boss.send.mock.calls
      .filter(([name]) => name === JOB_NAMES.FETCH_USER_EMAILS)
      .map(([, data]) => (data as { userId: string }).userId);
    expect(queuedUserIds).toEqual([CONSENTED_USER.id]);
  });
});
