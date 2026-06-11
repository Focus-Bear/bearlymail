import { Test, TestingModule } from "@nestjs/testing";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DeletionReason } from "../database/entities/deleted-account.entity";
import { AccountDeletionProcessor } from "./account-deletion.processor";
import { UsersService } from "./users.service";

jest.mock("../utils/error-logger", () => ({
  logErrorToFile: jest.fn(),
}));

describe("AccountDeletionProcessor", () => {
  let processor: AccountDeletionProcessor;
  let mockBoss: {
    schedule: jest.Mock;
    work: jest.Mock;
  };
  let mockUsersService: {
    findUsersForDeletion: jest.Mock;
    deleteAccount: jest.Mock;
  };

  beforeEach(async () => {
    mockBoss = {
      schedule: jest.fn().mockResolvedValue(undefined),
      work: jest.fn().mockResolvedValue(undefined),
    };

    mockUsersService = {
      findUsersForDeletion: jest.fn(),
      deleteAccount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountDeletionProcessor,
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: mockBoss,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    processor = module.get<AccountDeletionProcessor>(AccountDeletionProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.DATA_RETENTION_DAYS;
  });

  describe("onModuleInit", () => {
    it("schedules the daily cleanup job", async () => {
      await processor.onModuleInit();

      expect(mockBoss.schedule).toHaveBeenCalledWith(
        JOB_NAMES.CLEANUP_INACTIVE_ACCOUNTS,
        "0 3 * * *",
      );
    });

    it("registers a worker for the cleanup job", async () => {
      await processor.onModuleInit();

      expect(mockBoss.work).toHaveBeenCalledWith(
        JOB_NAMES.CLEANUP_INACTIVE_ACCOUNTS,
        { batchSize: 1 },
        expect.any(Function),
      );
    });
  });

  describe("handleCleanupInactiveAccounts", () => {
    it("deletes all inactive accounts with INACTIVITY reason", async () => {
      mockUsersService.findUsersForDeletion.mockResolvedValue([
        "user-1",
        "user-2",
      ]);
      mockUsersService.deleteAccount.mockResolvedValue(undefined);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.findUsersForDeletion).toHaveBeenCalledWith(30);
      expect(mockUsersService.deleteAccount).toHaveBeenCalledWith(
        "user-1",
        DeletionReason.INACTIVITY,
      );
      expect(mockUsersService.deleteAccount).toHaveBeenCalledWith(
        "user-2",
        DeletionReason.INACTIVITY,
      );
      expect(mockUsersService.deleteAccount).toHaveBeenCalledTimes(2);
    });

    it("uses DATA_RETENTION_DAYS env var when set", async () => {
      process.env.DATA_RETENTION_DAYS = "90";
      mockUsersService.findUsersForDeletion.mockResolvedValue([]);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.findUsersForDeletion).toHaveBeenCalledWith(90);
    });

    it("falls back to 30 days when DATA_RETENTION_DAYS is invalid", async () => {
      process.env.DATA_RETENTION_DAYS = "not-a-number";
      mockUsersService.findUsersForDeletion.mockResolvedValue([]);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.findUsersForDeletion).toHaveBeenCalledWith(30);
    });

    it("falls back to 30 days when DATA_RETENTION_DAYS is zero", async () => {
      process.env.DATA_RETENTION_DAYS = "0";
      mockUsersService.findUsersForDeletion.mockResolvedValue([]);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.findUsersForDeletion).toHaveBeenCalledWith(30);
    });

    it("continues deleting remaining accounts after a single failure", async () => {
      mockUsersService.findUsersForDeletion.mockResolvedValue([
        "user-1",
        "user-2",
        "user-3",
      ]);
      mockUsersService.deleteAccount
        // user-1 succeeds
        .mockResolvedValueOnce(undefined)
        // user-2 fails
        .mockRejectedValueOnce(new Error("DB error"))
        // user-3 succeeds
        .mockResolvedValueOnce(undefined);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.deleteAccount).toHaveBeenCalledTimes(3);
    });

    it("does nothing when no inactive accounts are found", async () => {
      mockUsersService.findUsersForDeletion.mockResolvedValue([]);

      await processor.handleCleanupInactiveAccounts();

      expect(mockUsersService.deleteAccount).not.toHaveBeenCalled();
    });
  });
});
