import type { Repository } from "typeorm";

import { CONTEXT_ANALYSIS_STATUS } from "../constants/domain-statuses";
import type { ContextAnalysis } from "../database/entities/context-analysis.entity";
import type { User } from "../database/entities/user.entity";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { UsersService } from "../users/users.service";
import type { ContextAnalysisProgressService } from "./context-analysis-progress.service";
import { OnboardingAnalysisStartService } from "./onboarding-analysis-start.service";

const USER_ID = "user-1";
const NEW_RUN_ID = "new-run";
const EXISTING_RUN_ID = "existing-run";
const ADVISORY_LOCK_SQL = "pg_advisory_xact_lock";

describe("OnboardingAnalysisStartService", () => {
  let latestAnalysis: Partial<ContextAnalysis> | null;
  let user: Partial<User> | null;
  let isAiAllowed: boolean;
  let lockQuery: jest.Mock;
  let startAnalysis: jest.Mock;
  let service: OnboardingAnalysisStartService;
  const mailboxConnected = jest.fn();

  beforeEach(() => {
    latestAnalysis = null;
    user = {
      id: USER_ID,
      hasCompletedOnboarding: false,
      lastEmailSyncAt: null,
    };
    isAiAllowed = true;
    mailboxConnected.mockReset().mockResolvedValue(true);
    lockQuery = jest.fn().mockResolvedValue([]);
    startAnalysis = jest.fn().mockResolvedValue({ analysisId: NEW_RUN_ID });

    const repository = {
      findOne: jest.fn(async () => latestAnalysis),
      manager: {
        transaction: jest.fn(
          async (work: (manager: { query: jest.Mock }) => Promise<unknown>) =>
            work({ query: lockQuery }),
        ),
      },
    } as unknown as Repository<ContextAnalysis>;

    service = new OnboardingAnalysisStartService(
      repository,
      { startAnalysis } as unknown as ContextAnalysisProgressService,
      { findOne: jest.fn(async () => user) } as unknown as UsersService,
      {
        checkAiCapacity: jest.fn(async () => ({
          allowed: isAiAllowed,
          percentUsed: 0,
        })),
      } as unknown as SubscriptionsService,
    );
  });

  describe("joinOrStartAnalysis (setup wizard)", () => {
    it.each([
      CONTEXT_ANALYSIS_STATUS.RUNNING,
      CONTEXT_ANALYSIS_STATUS.PENDING,
      CONTEXT_ANALYSIS_STATUS.COMPLETED,
    ])("joins a %s run instead of superseding it", async (status) => {
      latestAnalysis = { id: EXISTING_RUN_ID, status };

      await expect(service.joinOrStartAnalysis(USER_ID)).resolves.toEqual({
        analysisId: EXISTING_RUN_ID,
      });
      expect(startAnalysis).not.toHaveBeenCalled();
    });

    it("starts a run when the last one failed", async () => {
      latestAnalysis = {
        id: EXISTING_RUN_ID,
        status: CONTEXT_ANALYSIS_STATUS.FAILED,
      };

      await expect(service.joinOrStartAnalysis(USER_ID)).resolves.toEqual({
        analysisId: NEW_RUN_ID,
      });
    });

    it("starts a run when there is none, under the per-user lock", async () => {
      await service.joinOrStartAnalysis(USER_ID);

      expect(startAnalysis).toHaveBeenCalledWith(USER_ID);
      expect(lockQuery).toHaveBeenCalledWith(
        expect.stringContaining(ADVISORY_LOCK_SQL),
        [expect.stringContaining(USER_ID)],
      );
    });
  });

  describe("startForNewMailbox (first sync)", () => {
    it("starts the analysis for a new user whose mailbox is connected", async () => {
      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).toHaveBeenCalledWith(USER_ID);
    });

    it("never starts a second run, even after a failure", async () => {
      latestAnalysis = {
        id: EXISTING_RUN_ID,
        status: CONTEXT_ANALYSIS_STATUS.FAILED,
      };

      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).not.toHaveBeenCalled();
    });

    it("skips users who finished onboarding", async () => {
      user = { ...user, hasCompletedOnboarding: true };

      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).not.toHaveBeenCalled();
      expect(mailboxConnected).not.toHaveBeenCalled();
    });

    it("skips users whose first import already ran (abandoned old sign-ups)", async () => {
      user = { ...user, lastEmailSyncAt: new Date() };

      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).not.toHaveBeenCalled();
    });

    it("waits for a mailbox: the connect flow's login sync has none yet", async () => {
      mailboxConnected.mockResolvedValue(false);

      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).not.toHaveBeenCalled();
    });

    it("respects the plan's AI capacity", async () => {
      isAiAllowed = false;

      await service.startForNewMailbox(USER_ID, mailboxConnected);

      expect(startAnalysis).not.toHaveBeenCalled();
    });

    it("never throws into the sync", async () => {
      startAnalysis.mockRejectedValue(new Error("pgboss down"));

      await expect(
        service.startForNewMailbox(USER_ID, mailboxConnected),
      ).resolves.toBeUndefined();
    });
  });
});
