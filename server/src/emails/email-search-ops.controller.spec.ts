import { Test, TestingModule } from "@nestjs/testing";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailSearchOpsController } from "./email-search-ops.controller";
import { EmailsService } from "./emails.service";

describe("EmailSearchOpsController", () => {
  let controller: EmailSearchOpsController;

  const mockEmailsService = {
    rankSearchResults: jest.fn(),
    expandSearchResults: jest.fn(),
  };

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn().mockResolvedValue(true),
  };

  const mockOffice365AccountsService = {
    hasConnectedOffice365: jest.fn().mockResolvedValue(false),
  };

  const mockZohoAccountsService = {
    hasConnectedZoho: jest.fn().mockResolvedValue(false),
  };

  const mockAppleMailAccountsService = {
    hasConnectedAppleMail: jest.fn().mockResolvedValue(false),
  };

  const mockUsersService = {
    findOneWithTokens: jest
      .fn()
      .mockResolvedValue({ googleCalendarAccessToken: "token" }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailSearchOpsController],
      providers: [
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: GoogleAccountsService,
          useValue: mockGoogleAccountsService,
        },
        {
          provide: Office365AccountsService,
          useValue: mockOffice365AccountsService,
        },
        {
          provide: ZohoAccountsService,
          useValue: mockZohoAccountsService,
        },
        {
          provide: AppleMailAccountsService,
          useValue: mockAppleMailAccountsService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(AiCapacityGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<EmailSearchOpsController>(EmailSearchOpsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("rankSearchResults", () => {
    it("should return empty array when no emailIds provided", async () => {
      const mockRequest = { user: { userId: "user-123" } };

      const result = await controller.rankSearchResults(mockRequest, {
        emailIds: [],
        query: "test",
      });

      expect(result).toEqual([]);
      expect(mockEmailsService.rankSearchResults).not.toHaveBeenCalled();
    });

    it("should call rankSearchResults with correct parameters", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const emailIds = ["id-1", "id-2"];
      const mockRanked = [{ id: "id-1", relevanceScore: 90 }];

      mockEmailsService.rankSearchResults.mockResolvedValue(mockRanked);

      const result = await controller.rankSearchResults(mockRequest, {
        emailIds,
        query: "test query",
        maxResults: 10,
      });

      expect(result).toEqual(mockRanked);
      expect(mockEmailsService.rankSearchResults).toHaveBeenCalledWith(
        userId,
        "test query",
        emailIds,
        10,
      );
    });

    it("should return empty array on error", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.rankSearchResults.mockRejectedValue(
        new Error("Ranking failed"),
      );

      const result = await controller.rankSearchResults(mockRequest, {
        emailIds: ["id-1"],
        query: "test",
      });

      expect(result).toEqual([]);
    });
  });

  describe("expandSearchResults", () => {
    it("should return empty array when no query provided", async () => {
      const mockRequest = { user: { userId: "user-123" } };

      const result = await controller.expandSearchResults(mockRequest, {
        query: "",
        existingEmailIds: ["id-1"],
      });

      expect(result).toEqual([]);
      expect(mockEmailsService.expandSearchResults).not.toHaveBeenCalled();
    });

    it("should call expandSearchResults with correct parameters", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const existingEmailIds = ["id-1", "id-2"];
      const mockExpanded = [{ id: "id-3", subject: "New result" }];

      mockEmailsService.expandSearchResults.mockResolvedValue(mockExpanded);

      const result = await controller.expandSearchResults(mockRequest, {
        query: "test query",
        existingEmailIds,
      });

      expect(result).toEqual(mockExpanded);
      expect(mockEmailsService.expandSearchResults).toHaveBeenCalledWith(
        userId,
        "test query",
        existingEmailIds,
      );
    });

    it("should use empty array when existingEmailIds not provided", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.expandSearchResults.mockResolvedValue([]);

      await controller.expandSearchResults(mockRequest, {
        query: "test query",
        existingEmailIds: undefined as unknown as string[],
      });

      expect(mockEmailsService.expandSearchResults).toHaveBeenCalledWith(
        userId,
        "test query",
        [],
      );
    });

    it("should return empty array on error", async () => {
      const mockRequest = { user: { userId: "user-123" } };

      mockEmailsService.expandSearchResults.mockRejectedValue(
        new Error("Expand failed"),
      );

      const result = await controller.expandSearchResults(mockRequest, {
        query: "test",
        existingEmailIds: [],
      });

      expect(result).toEqual([]);
    });
  });
});
