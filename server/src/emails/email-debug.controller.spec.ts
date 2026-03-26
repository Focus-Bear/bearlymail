import { Test, TestingModule } from "@nestjs/testing";

import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { UsersService } from "../users/users.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailDebugController } from "./email-debug.controller";
import { EmailsService } from "./emails.service";

describe("EmailDebugController", () => {
  let controller: EmailDebugController;

  const mockEmailsService = {
    getSyncStatus: jest.fn(),
    getSyncHistory: jest.fn(),
    debugStarredThreads: jest.fn(),
    debugOrphanEmails: jest.fn(),
    fixOrphanEmails: jest.fn(),
    fixStuckCalculatingThreads: jest.fn(),
    fixStaleUnsyncedThreads: jest.fn(),
    lookupByGmailUrl: jest.fn(),
    lookupByMessageId: jest.fn(),
    lookupThread: jest.fn(),
    getCategoryDebugData: jest.fn(),
  };

  const mockEmailAdminService = {
    getJobStats: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
    getQueueSize: jest.fn(),
    db: {
      executeSql: jest.fn().mockResolvedValue({ rowCount: 0 }),
    },
  };

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn().mockResolvedValue(true),
  };

  const mockUsersService = {
    findOne: jest.fn().mockResolvedValue({ isAdmin: true }),
    findOneWithTokens: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailDebugController],
      providers: [
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: EmailAdminService,
          useValue: mockEmailAdminService,
        },
        {
          provide: "PG_BOSS",
          useValue: mockBoss,
        },
        {
          provide: GoogleAccountsService,
          useValue: mockGoogleAccountsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    }).compile();

    controller = module.get<EmailDebugController>(EmailDebugController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getSyncStatus", () => {
    it("should return sync status for the user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockStatus = { lastSync: new Date(), status: "ok" };

      mockEmailsService.getSyncStatus.mockResolvedValue(mockStatus);

      const result = await controller.getSyncStatus(mockRequest);

      expect(result).toEqual(mockStatus);
      expect(mockEmailsService.getSyncStatus).toHaveBeenCalledWith(userId);
    });
  });

  describe("getSyncHistory", () => {
    it("should return sync history for the user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockHistory = [{ id: "1", syncedAt: new Date() }];

      mockEmailsService.getSyncHistory.mockResolvedValue(mockHistory);

      const result = await controller.getSyncHistory(mockRequest, "10");

      expect(result).toEqual(mockHistory);
      expect(mockEmailsService.getSyncHistory).toHaveBeenCalledWith(userId, 10);
    });
  });

  describe("debugStarredThreads", () => {
    it("should return starred threads debug info", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResult = { threads: [] };

      mockEmailsService.debugStarredThreads.mockResolvedValue(mockResult);

      const result = await controller.debugStarredThreads(mockRequest);

      expect(result).toEqual(mockResult);
      expect(mockEmailsService.debugStarredThreads).toHaveBeenCalledWith(
        userId,
      );
    });
  });

  describe("debugOrphanEmails", () => {
    it("should return orphan emails debug info", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResult = { orphans: [] };

      mockEmailsService.debugOrphanEmails.mockResolvedValue(mockResult);

      const result = await controller.debugOrphanEmails(mockRequest);

      expect(result).toEqual(mockResult);
      expect(mockEmailsService.debugOrphanEmails).toHaveBeenCalledWith(userId);
    });
  });

  describe("fixOrphanEmails", () => {
    it("should fix orphan emails for the user", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResult = { fixed: 3 };

      mockEmailsService.fixOrphanEmails.mockResolvedValue(mockResult);

      const result = await controller.fixOrphanEmails(mockRequest);

      expect(result).toEqual(mockResult);
      expect(mockEmailsService.fixOrphanEmails).toHaveBeenCalledWith(userId);
    });
  });

  describe("getJobStats", () => {
    it("should return job stats for the default range", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      const mockStats = { jobs: [] };

      mockEmailAdminService.getJobStats.mockResolvedValue(mockStats);

      const result = await controller.getJobStats(mockRequest);

      expect(result).toEqual(mockStats);
      expect(mockEmailAdminService.getJobStats).toHaveBeenCalledWith("all");
    });
  });
});
