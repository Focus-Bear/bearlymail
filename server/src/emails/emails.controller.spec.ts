import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { ContactsService } from "../contacts/contacts.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { UsersService } from "../users/users.service";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";

describe("EmailsController", () => {
  let controller: EmailsController;
  let emailsService: EmailsService;
  let emailThreadRepository: Repository<EmailThread>;

  const mockEmailsService = {
    getInbox: jest.fn(),
    getInboxSummary: jest.fn(),
    getEmailById: jest.fn(),
    createEmail: jest.fn(),
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    bulkMarkAsRead: jest.fn(),
    bulkMarkAsUnread: jest.fn(),
    archiveEmail: jest.fn(),
    toggleStar: jest.fn(),
    setStarCount: jest.fn(),
    searchEmails: jest.fn(),
    rankSearchResults: jest.fn(),
    expandSearchResults: jest.fn(),
    getPriorityExplanation: jest.fn(),
    getThreadEmails: jest.fn(),
  };

  const mockEmailProviderManager = {
    getPrimaryProvider: jest.fn(),
  };

  const mockContactsService = {};

  const mockBlockedSendersService = {};

  const mockBatchScheduleService = {
    getSchedule: jest.fn(),
    getDefaultSchedule: jest.fn(),
    getNextBatchReleaseTime: jest.fn(),
    getNextScheduledDeliveryTime: jest.fn(),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
  };

  const mockGoogleAccountsService = {
    hasConnectedGmail: jest.fn().mockResolvedValue(true),
  };

  const mockUsersService = {
    findOneWithTokens: jest
      .fn()
      .mockResolvedValue({ googleCalendarAccessToken: "token" }),
  };

  const mockScheduledEmailsService = {
    createScheduledEmail: jest.fn(),
    getSuggestedTimes: jest.fn(),
    checkSendTimeAppropriate: jest.fn(),
    cancelScheduledEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailsController],
      providers: [
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: EmailProviderManager,
          useValue: mockEmailProviderManager,
        },
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
        {
          provide: BlockedSendersService,
          useValue: mockBlockedSendersService,
        },
        {
          provide: BatchScheduleService,
          useValue: mockBatchScheduleService,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
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
        {
          provide: ScheduledEmailsService,
          useValue: mockScheduledEmailsService,
        },
      ],
    }).compile();

    controller = module.get<EmailsController>(EmailsController);
    emailsService = module.get<EmailsService>(EmailsService);
    emailThreadRepository = module.get<Repository<EmailThread>>(
      getRepositoryToken(EmailThread),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getInbox", () => {
    it("should return inbox emails", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockEmails = [{ id: "1", subject: "Test" }];

      mockEmailsService.getInbox.mockResolvedValue({
        emails: mockEmails,
        total: 1,
        hasMore: false,
      });

      const result = await controller.getInbox(
        mockRequest,
        undefined,
        "triage",
      );

      expect(result).toEqual({
        emails: mockEmails,
        total: 1,
        hasMore: false,
        page: 1,
        limit: 50,
      });
      expect(emailsService.getInbox).toHaveBeenCalledWith(
        userId,
        false,
        "triage",
        {
          accountIds: undefined,
          categories: undefined,
          minPriority: undefined,
        },
        { offset: 0, limit: 50 },
      );
    });

    it("should handle includeBatched parameter", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInbox.mockResolvedValue({
        emails: [],
        total: 0,
        hasMore: false,
      });

      await controller.getInbox(mockRequest, "true", "action");

      expect(emailsService.getInbox).toHaveBeenCalledWith(
        userId,
        true,
        "action",
        {
          accountIds: undefined,
          categories: undefined,
          minPriority: undefined,
        },
        { offset: 0, limit: 50 },
      );
    });

    it("should use default mode when not provided", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInbox.mockResolvedValue({
        emails: [],
        total: 0,
        hasMore: false,
      });

      await controller.getInbox(mockRequest);

      expect(emailsService.getInbox).toHaveBeenCalledWith(
        userId,
        false,
        "triage",
        {
          accountIds: undefined,
          categories: undefined,
          minPriority: undefined,
        },
        { offset: 0, limit: 50 },
      );
    });
  });

  describe("getTabCounts", () => {
    it("should return tab counts using getInboxSummary for all three modes", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary
        .mockResolvedValueOnce({ total: 10, categories: [] })  // triage
        .mockResolvedValueOnce({ total: 5, categories: [] })   // action
        .mockResolvedValueOnce({ total: 2, categories: [] });  // follow-up

      const result = await controller.getTabCounts(mockRequest);

      expect(result).toEqual({ triage: 10, action: 5, followUp: 2 });
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledTimes(3);
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(userId, "triage");
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(userId, "action");
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(userId, "follow-up");
    });

    it("should NOT call getInbox (uses getInboxSummary for consistency with inbox display)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary.mockResolvedValue({ total: 0, categories: [] });

      await controller.getTabCounts(mockRequest);

      expect(mockEmailsService.getInbox).not.toHaveBeenCalled();
    });

    it("should return zero counts when inbox is empty", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary.mockResolvedValue({ total: 0, categories: [] });

      const result = await controller.getTabCounts(mockRequest);

      expect(result).toEqual({ triage: 0, action: 0, followUp: 0 });
    });
  });

  describe("getEmail", () => {
    it("should return email by id", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        emailThreadId: null,
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);

      const result = await controller.getEmail(mockRequest, emailId);

      expect(result).toEqual(mockEmail);
      expect(emailsService.getEmailById).toHaveBeenCalledWith(userId, emailId);
    });

    it("should include githubMetadata when available", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const threadId = "thread-123";
      const mockRequest = { user: { userId } };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        emailThreadId: threadId,
      };
      const mockThread = {
        id: threadId,
        userId,
        githubMetadata: {
          links: [
            {
              url: "https://github.com/test/repo/issues/123",
              owner: "test",
              repo: "repo",
              number: 123,
            },
          ],
        },
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);

      const result = await controller.getEmail(mockRequest, emailId);

      expect(result).toEqual({
        ...mockEmail,
        githubMetadata: {
          links: [
            {
              url: "https://github.com/test/repo/issues/123",
              owner: "test",
              repo: "repo",
              number: 123,
            },
          ],
        },
      });
      expect(emailThreadRepository.findOne).toHaveBeenCalledWith({
        where: { id: threadId, userId },
      });
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(controller.getEmail(mockRequest, emailId)).rejects.toThrow(
        "Email not found",
      );
    });
  });

  describe("markAsRead", () => {
    it("should mark email as read", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.markAsRead.mockResolvedValue(undefined);

      await controller.markAsRead(mockRequest, emailId);

      expect(emailsService.markAsRead).toHaveBeenCalledWith(userId, emailId);
    });
  });

  describe("markAsUnread", () => {
    it("should mark email as unread", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.markAsUnread.mockResolvedValue(undefined);

      await controller.markAsUnread(mockRequest, emailId);

      expect(emailsService.markAsUnread).toHaveBeenCalledWith(userId, emailId);
    });
  });

  describe("bulkMarkAsRead", () => {
    it("should bulk mark emails as read", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = { emailIds: ["1", "2", "3"] };

      mockEmailsService.bulkMarkAsRead.mockResolvedValue(undefined);

      const result = await controller.bulkMarkAsRead(mockRequest, body);

      expect(emailsService.bulkMarkAsRead).toHaveBeenCalledWith(
        userId,
        body.emailIds,
      );
      expect(result).toEqual({ message: "Emails marked as read" });
    });
  });

  describe("bulkMarkAsUnread", () => {
    it("should bulk mark emails as unread", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = { emailIds: ["1", "2"] };

      mockEmailsService.bulkMarkAsUnread.mockResolvedValue(undefined);

      const result = await controller.bulkMarkAsUnread(mockRequest, body);

      expect(emailsService.bulkMarkAsUnread).toHaveBeenCalledWith(
        userId,
        body.emailIds,
      );
      expect(result).toEqual({ message: "Emails marked as unread" });
    });
  });

  describe("archiveEmail", () => {
    it("should archive email directly via service", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.archiveEmail.mockResolvedValue(undefined);

      const result = await controller.archiveEmail(mockRequest, emailId);

      expect(emailsService.archiveEmail).toHaveBeenCalledWith(userId, emailId);
      expect(result).toEqual({ message: "Email archived" });
    });
  });

  describe("toggleStar", () => {
    it("should toggle star on email", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const mockResult = { starCount: 1 };

      mockEmailsService.toggleStar.mockResolvedValue(mockResult);

      const result = await controller.toggleStar(mockRequest, emailId);

      expect(emailsService.toggleStar).toHaveBeenCalledWith(userId, emailId);
      expect(result).toEqual(mockResult);
    });
  });

  describe("setStarCount", () => {
    it("should set star count on email", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = { starCount: 2 };
      const mockResult = { starCount: 2 };

      mockEmailsService.setStarCount.mockResolvedValue(mockResult);

      const result = await controller.setStarCount(mockRequest, emailId, body);

      expect(emailsService.setStarCount).toHaveBeenCalledWith(
        userId,
        emailId,
        2,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe("searchEmails", () => {
    it("should search emails with query", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const query = "test query";
      const mockResults = [{ id: "1", subject: "Test" }];

      mockEmailsService.searchEmails.mockResolvedValue(mockResults);

      const result = await controller.searchEmails(mockRequest, query);

      expect(result).toEqual(mockResults);
      expect(emailsService.searchEmails).toHaveBeenCalledWith(
        userId,
        query,
        50,
        undefined,
        undefined,
        false,
      );
    });

    it("should return empty array when query is empty", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      const result = await controller.searchEmails(mockRequest, "");

      expect(result).toEqual([]);
      expect(emailsService.searchEmails).not.toHaveBeenCalled();
    });

    it("should use custom maxResults when provided", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const query = "test";
      const maxResults = "100";

      mockEmailsService.searchEmails.mockResolvedValue([]);

      await controller.searchEmails(mockRequest, query, maxResults);

      expect(emailsService.searchEmails).toHaveBeenCalledWith(
        userId,
        query,
        100,
        undefined,
        undefined,
        false,
      );
    });

    it("should handle search errors gracefully", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const query = "test";
      const error = new Error("Search failed");

      mockEmailsService.searchEmails.mockRejectedValue(error);

      const result = await controller.searchEmails(mockRequest, query);

      expect(result).toEqual([
        {
          id: "no-results",
          subject: "",
          from: "",
          body: "",
          receivedAt: expect.any(String),
          debugInfo: {
            originalQuery: query,
            queriesTried: [],
            message: "Error occurred: Search failed",
            error: true,
          },
        },
      ]);
    });
  });

  describe("getThread", () => {
    it("should return thread emails", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const threadId = "thread-123";
      const mockRequest = { user: { userId } };
      const mockEmail = { id: emailId, threadId };
      const mockThreadEmails = [{ id: "1" }, { id: "2" }];

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailsService.getThreadEmails.mockResolvedValue(mockThreadEmails);

      const result = await controller.getThread(mockRequest, emailId);

      expect(result).toEqual(mockThreadEmails);
      expect(emailsService.getThreadEmails).toHaveBeenCalledWith(
        userId,
        threadId,
        { order: "DESC" },
      );
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(controller.getThread(mockRequest, emailId)).rejects.toThrow(
        "Email not found",
      );
    });
  });

  describe("getPriorityExplanation", () => {
    it("should return priority explanation", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const mockExplanation = { score: 10, reasons: [] };

      mockEmailsService.getPriorityExplanation.mockResolvedValue(
        mockExplanation,
      );

      const result = await controller.getPriorityExplanation(
        mockRequest,
        emailId,
      );

      expect(result).toEqual(mockExplanation);
      expect(emailsService.getPriorityExplanation).toHaveBeenCalledWith(
        userId,
        emailId,
      );
    });
  });

  describe("getBatchStatus", () => {
    it("should return batch status with schedule", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockSchedule = {
        id: "schedule-1",
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as BatchSchedule;
      const nextTime = new Date();

      mockBatchScheduleService.getSchedule.mockResolvedValue(mockSchedule);
      mockBatchScheduleService.getNextScheduledDeliveryTime.mockReturnValue(
        nextTime,
      );

      const result = await controller.getBatchStatus(mockRequest);

      expect(result).toEqual({ nextDelivery: nextTime });
      expect(mockBatchScheduleService.getSchedule).toHaveBeenCalledWith(userId);
    });

    it("should use default schedule when no schedule exists", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const defaultSchedule = { enabled: true };
      const nextTime = new Date();

      mockBatchScheduleService.getSchedule.mockResolvedValue(null);
      mockBatchScheduleService.getDefaultSchedule.mockReturnValue(
        defaultSchedule,
      );
      mockBatchScheduleService.getNextScheduledDeliveryTime.mockReturnValue(
        nextTime,
      );

      const result = await controller.getBatchStatus(mockRequest);

      expect(result).toEqual({ nextDelivery: nextTime });
      expect(mockBatchScheduleService.getDefaultSchedule).toHaveBeenCalled();
    });
  });

  describe("searchEmails", () => {
    it("should return empty array when no query provided", async () => {
      const mockRequest = { user: { userId: "user-123" } };

      const result = await controller.searchEmails(
        mockRequest,
        "",
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual([]);
      expect(mockEmailsService.searchEmails).not.toHaveBeenCalled();
    });

    it("should call searchEmails with skipLlmRanking=false by default", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResults = [{ id: "1", subject: "Test" }];

      mockEmailsService.searchEmails.mockResolvedValue(mockResults);

      const result = await controller.searchEmails(
        mockRequest,
        "test query",
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(mockResults);
      expect(mockEmailsService.searchEmails).toHaveBeenCalledWith(
        userId,
        "test query",
        50,
        undefined,
        undefined,
        false,
      );
    });

    it("should pass skipLlmRanking=true when skipLlm='true'", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResults = [{ id: "1", subject: "Test" }];

      mockEmailsService.searchEmails.mockResolvedValue(mockResults);

      await controller.searchEmails(
        mockRequest,
        "test query",
        undefined,
        undefined,
        "true",
      );

      expect(mockEmailsService.searchEmails).toHaveBeenCalledWith(
        userId,
        "test query",
        50,
        undefined,
        undefined,
        true,
      );
    });

    it("should return no-results marker on error", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.searchEmails.mockRejectedValue(
        new Error("Search failed"),
      );

      const result = await controller.searchEmails(
        mockRequest,
        "test query",
        undefined,
        undefined,
        undefined,
      );

      expect(result).toHaveLength(1);
      expect((result as any[])[0].id).toBe("no-results");
    });
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
