import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { AuditService } from "../audit/audit.service";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailExportJobService } from "./email-export-job.service";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { GmailProvider } from "./providers/gmail.provider";
import { SearchEnrichmentService } from "./search-enrichment.service";

describe("EmailsController", () => {
  let controller: EmailsController;
  let emailsService: EmailsService;
  let searchEnrichmentService: SearchEnrichmentService;
  let gmailProvider: GmailProvider;

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
    getPriorityExplanation: jest.fn(),
    getThreadEmails: jest.fn(),
    getPriorityCounts: jest.fn(),
    // Default: no connected providers → search uses the legacy path. Individual
    // instant-search tests override this with a Gmail-only provider list.
    getConnectedProviderTypes: jest.fn().mockResolvedValue([]),
  };

  const mockBatchScheduleService = {
    getSchedule: jest.fn(),
    getDefaultSchedule: jest.fn(),
    getNextBatchReleaseTime: jest.fn(),
    getNextScheduledDeliveryTime: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
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

  const mockEmailAdminService = {
    getSystemStats: jest.fn(),
    getUserEmailStats: jest.fn(),
    getEmailThreadById: jest.fn(),
    getEmailStats: jest.fn(),
    blockEmailSender: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
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
          provide: BatchScheduleService,
          useValue: mockBatchScheduleService,
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
        {
          provide: EmailAdminService,
          useValue: mockEmailAdminService,
        },
        {
          provide: GmailProvider,
          useValue: {
            searchEmailsMetadataOnly: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SearchEnrichmentService,
          useValue: {
            startEnrichmentJob: jest.fn().mockResolvedValue("mock-job-id"),
            getStatus: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: EmailExportJobService,
          useValue: {
            requestExport: jest.fn().mockResolvedValue({ exportId: "exp-123" }),
            getStatus: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    controller = module.get<EmailsController>(EmailsController);
    emailsService = module.get<EmailsService>(EmailsService);
    searchEnrichmentService = module.get<SearchEnrichmentService>(
      SearchEnrichmentService,
    );
    gmailProvider = module.get<GmailProvider>(GmailProvider);
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

      const result = await controller.getInbox(mockRequest, {
        mode: "triage",
      });

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

      await controller.getInbox(mockRequest, {
        includeBatched: "true",
        mode: "action",
      });

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

      await controller.getInbox(mockRequest, {});

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
        // triage
        .mockResolvedValueOnce({ total: 10, categories: [] })
        // action
        .mockResolvedValueOnce({ total: 5, categories: [] })
        // follow-up
        .mockResolvedValueOnce({ total: 2, categories: [] });

      const result = await controller.getTabCounts(mockRequest);

      expect(result).toEqual({ triage: 10, action: 5, followUp: 2 });
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledTimes(3);
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "triage",
        undefined,
      );
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "action",
        undefined,
      );
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "follow-up",
        undefined,
      );
    });

    it("should forward minPriority filter to getInboxSummary", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary
        .mockResolvedValueOnce({ total: 4, categories: [] })
        .mockResolvedValueOnce({ total: 2, categories: [] })
        .mockResolvedValueOnce({ total: 1, categories: [] });

      const result = await controller.getTabCounts(mockRequest, "3");

      expect(result).toEqual({ triage: 4, action: 2, followUp: 1 });
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledTimes(3);
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "triage",
        { minPriority: 3 },
      );
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "action",
        { minPriority: 3 },
      );
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "follow-up",
        { minPriority: 3 },
      );
    });

    it("should NOT call getInbox (uses getInboxSummary for consistency with inbox display)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary.mockResolvedValue({
        total: 0,
        categories: [],
      });

      await controller.getTabCounts(mockRequest);

      expect(mockEmailsService.getInbox).not.toHaveBeenCalled();
    });

    it("should return zero counts when inbox is empty", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getInboxSummary.mockResolvedValue({
        total: 0,
        categories: [],
      });

      const result = await controller.getTabCounts(mockRequest);

      expect(result).toEqual({ triage: 0, action: 0, followUp: 0 });
    });

    // Regression test for issue #1088: priority inbox filter returns zero results.
    // Root cause: getInboxSummary in triage mode combined starCount = 0 with
    // minPriority >= N. High-priority threads that have been actioned (starCount > 0)
    // were excluded, so the priority inbox returned zero results even though
    // getPriorityCounts (which has no starCount filter) showed non-zero counts in the UI.
    it("fix(#1088): should return non-zero tab counts when high-priority threads exist, regardless of starCount", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      // The service should be able to return high-priority counts for threads
      // across all triage states (triage/action/follow-up), not just starCount = 0.
      mockEmailsService.getInboxSummary
        // triage — high-priority threads that may have starCount > 0 are now included
        .mockResolvedValueOnce({ total: 7, categories: [] })
        // action
        .mockResolvedValueOnce({ total: 3, categories: [] })
        // follow-up
        .mockResolvedValueOnce({ total: 1, categories: [] });

      const result = await controller.getTabCounts(mockRequest, "50");

      // Should NOT return { triage: 0, action: 0, followUp: 0 } when high-priority threads exist
      expect(result.triage).toBeGreaterThan(0);
      expect(result).toEqual({ triage: 7, action: 3, followUp: 1 });
      expect(mockEmailsService.getInboxSummary).toHaveBeenCalledWith(
        userId,
        "triage",
        { minPriority: 50 },
      );
    });
  });

  describe("getPriorityCounts", () => {
    it("should return priority counts from emailsService.getPriorityCounts", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockCounts = { high: 5, medium: 12, low: 3 };

      mockEmailsService.getPriorityCounts.mockResolvedValue(mockCounts);

      const result = await controller.getPriorityCounts(mockRequest);

      expect(result).toEqual(mockCounts);
      expect(mockEmailsService.getPriorityCounts).toHaveBeenCalledWith(
        userId,
        "triage",
      );
    });

    it("should return zero counts when user has no inbox emails", async () => {
      const userId = "user-456";
      const mockRequest = { user: { userId } };

      mockEmailsService.getPriorityCounts.mockResolvedValue({
        high: 0,
        medium: 0,
        low: 0,
      });

      const result = await controller.getPriorityCounts(mockRequest);

      expect(result).toEqual({ high: 0, medium: 0, low: 0 });
    });

    it("should delegate to emailsService with the authenticated user id and default triage mode", async () => {
      const userId = "user-789";
      const mockRequest = { user: { userId } };

      mockEmailsService.getPriorityCounts.mockResolvedValue({
        high: 1,
        medium: 0,
        low: 0,
      });

      await controller.getPriorityCounts(mockRequest);

      expect(mockEmailsService.getPriorityCounts).toHaveBeenCalledTimes(1);
      expect(mockEmailsService.getPriorityCounts).toHaveBeenCalledWith(
        userId,
        "triage",
      );
    });

    it("should pass valid mode param to emailsService", async () => {
      const userId = "user-789";
      const mockRequest = { user: { userId } };

      mockEmailsService.getPriorityCounts.mockResolvedValue({
        high: 2,
        medium: 1,
        low: 0,
      });

      await controller.getPriorityCounts(mockRequest, "action");

      expect(mockEmailsService.getPriorityCounts).toHaveBeenCalledWith(
        userId,
        "action",
      );
    });

    it("should default to triage mode for unknown mode param", async () => {
      const userId = "user-789";
      const mockRequest = { user: { userId } };

      mockEmailsService.getPriorityCounts.mockResolvedValue({
        high: 0,
        medium: 0,
        low: 0,
      });

      await controller.getPriorityCounts(mockRequest, "unknown-mode");

      expect(mockEmailsService.getPriorityCounts).toHaveBeenCalledWith(
        userId,
        "triage",
      );
    });
  });

  describe("getEmail", () => {
    it("should return email by id", async () => {
      const userId = "user-123";
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
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
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
      const threadId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const mockRequest = { user: { userId } };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        emailThreadId: threadId,
      };
      const mockThread = {
        id: threadId,
        userId,
        priorityScore: 62,
        starCount: 2,
        isProcessingPriority: false,
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
      mockEmailAdminService.getEmailThreadById.mockResolvedValue(mockThread);

      const result = await controller.getEmail(mockRequest, emailId);

      expect(result).toEqual({
        ...mockEmail,
        priorityScore: 62,
        starCount: 2,
        isProcessingPriority: false,
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
      expect(mockEmailAdminService.getEmailThreadById).toHaveBeenCalledWith(
        userId,
        threadId,
      );
    });

    it("should include the canonical thread-level priorityScore so the detail view matches the inbox list", async () => {
      const userId = "user-123";
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
      const threadId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const mockRequest = { user: { userId } };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        emailThreadId: threadId,
      };
      const mockThread = {
        id: threadId,
        userId,
        priorityScore: 47,
        isProcessingPriority: true,
        githubMetadata: null,
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailAdminService.getEmailThreadById.mockResolvedValue(mockThread);

      const result = await controller.getEmail(mockRequest, emailId);

      expect(result).toEqual({
        ...mockEmail,
        priorityScore: 47,
        starCount: 0,
        isProcessingPriority: true,
      });
    });

    it("should return null priorityScore when the thread cannot be found", async () => {
      const userId = "user-123";
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
      const threadId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
      const mockRequest = { user: { userId } };
      const mockEmail = {
        id: emailId,
        subject: "Test",
        emailThreadId: threadId,
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailAdminService.getEmailThreadById.mockResolvedValue(null);

      const result = await controller.getEmail(mockRequest, emailId);

      expect(result).toEqual({
        ...mockEmail,
        priorityScore: null,
        starCount: 0,
        isProcessingPriority: false,
      });
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
      const mockRequest = { user: { userId } };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(controller.getEmail(mockRequest, emailId)).rejects.toThrow(
        "Email not found",
      );
    });

    it("should return 404 for a Gmail hex thread ID (non-UUID) without hitting the DB (#1296)", async () => {
      // Gmail thread IDs look like "19d03cdabc72da73" — hex, no dashes.
      // Passing these to PostgreSQL as UUIDs causes a QueryFailedError (500).
      // The UUID guard in getEmailOrThrow must reject them before DB access.
      const userId = "user-123";
      const gmailThreadId = "19d03cdabc72da73";
      const mockRequest = { user: { userId } };

      await expect(
        controller.getEmail(mockRequest, gmailThreadId),
      ).rejects.toThrow("Email not found");

      // The DB must NOT have been called — the UUID guard should have short-circuited.
      expect(mockEmailsService.getEmailById).not.toHaveBeenCalled();
    });

    it("should return 404 for a plainly invalid id without hitting the DB (#1296)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      await expect(
        controller.getEmail(mockRequest, "not-a-uuid"),
      ).rejects.toThrow("Email not found");

      expect(mockEmailsService.getEmailById).not.toHaveBeenCalled();
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
      expect(emailsService.searchEmails).toHaveBeenCalledWith(userId, query, {
        maxResults: 50,
        accountTypes: undefined,
        skipLlmRanking: false,
        skipLlmFallback: false,
        skipSync: false,
      });
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

      expect(emailsService.searchEmails).toHaveBeenCalledWith(userId, query, {
        maxResults: 100,
        accountTypes: undefined,
        skipLlmRanking: false,
        skipLlmFallback: false,
        skipSync: false,
      });
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
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
      const threadId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
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
      const emailId = "04547756-9d11-42b4-beae-227d52377fcd";
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
        {
          maxResults: 50,
          accountTypes: undefined,
          skipLlmRanking: false,
          skipLlmFallback: false,
          skipSync: false,
        },
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
        {
          maxResults: 50,
          accountTypes: undefined,
          skipLlmRanking: true,
          skipLlmFallback: true,
          skipSync: false,
          maxSyncThreads: 5,
        },
      );
    });

    it("should pass maxSyncThreads: 5 for Phase 1 (skipLlm=true)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.searchEmails.mockResolvedValue([]);

      await controller.searchEmails(
        mockRequest,
        "budget report",
        undefined,
        undefined,
        "true",
      );

      const callArgs = mockEmailsService.searchEmails.mock.calls[0][2];
      expect(callArgs.maxSyncThreads).toBe(5);
      expect(callArgs.skipSync).toBe(false);
    });

    it("should NOT pass maxSyncThreads when skipLlm is false (syncLimit falls back to MAX_THREADS_TO_SYNC)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.searchEmails.mockResolvedValue([]);

      await controller.searchEmails(
        mockRequest,
        "budget report",
        undefined,
        undefined,
        undefined,
      );

      const callArgs = mockEmailsService.searchEmails.mock.calls[0][2];
      expect(callArgs.maxSyncThreads).toBeUndefined();
      // When maxSyncThreads is undefined, email-search.service falls back to
      // MAX_THREADS_TO_SYNC (10) — the downstream syncLimit fallback test.
      expect(callArgs.skipSync).toBe(false);
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
      expect((result as { id: string }[])[0].id).toBe("no-results");
    });

    it("should use the instant path (not the legacy service) when the user is Gmail-only", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      mockEmailsService.getConnectedProviderTypes.mockResolvedValue(["gmail"]);
      (gmailProvider.searchEmailsMetadataOnly as jest.Mock).mockResolvedValue([
        { messageId: "m1", threadId: "t1", subject: "Hi", from: "a@gmail.com" },
      ]);

      const result = (await controller.searchEmails(
        mockRequest,
        "test query",
        undefined,
        undefined,
        "true",
      )) as { enrichmentJobId: string | null; results: unknown[] };

      expect(mockEmailsService.searchEmails).not.toHaveBeenCalled();
      expect(gmailProvider.searchEmailsMetadataOnly).toHaveBeenCalledWith(
        userId,
        "test query",
        50,
      );
      expect(searchEnrichmentService.startEnrichmentJob).toHaveBeenCalled();
      expect(result.enrichmentJobId).toBe("mock-job-id");
      expect(result.results).toHaveLength(1);
    });

    it("should use the legacy path when the user has a non-Gmail provider (mixed accounts)", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockEmailsService.getConnectedProviderTypes.mockResolvedValue([
        "gmail",
        "office365",
      ]);
      mockEmailsService.searchEmails.mockResolvedValue([
        { id: "1", subject: "Test" },
      ]);

      await controller.searchEmails(
        mockRequest,
        "test query",
        undefined,
        undefined,
        "true",
      );

      expect(mockEmailsService.searchEmails).toHaveBeenCalled();
      expect(gmailProvider.searchEmailsMetadataOnly).not.toHaveBeenCalled();
    });

    it("should honour INSTANT_SEARCH_ENABLED=false as a kill switch even for Gmail-only users", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      mockEmailsService.getConnectedProviderTypes.mockResolvedValue(["gmail"]);
      mockEmailsService.searchEmails.mockResolvedValue([]);
      const previous = process.env.INSTANT_SEARCH_ENABLED;
      process.env.INSTANT_SEARCH_ENABLED = "false";

      try {
        await controller.searchEmails(
          mockRequest,
          "test query",
          undefined,
          undefined,
          "true",
        );
        expect(mockEmailsService.searchEmails).toHaveBeenCalled();
        expect(gmailProvider.searchEmailsMetadataOnly).not.toHaveBeenCalled();
      } finally {
        process.env.INSTANT_SEARCH_ENABLED = previous;
      }
    });
  });

  describe("exportEmails", () => {
    it("enqueues an export job and writes an audit record (without the password)", async () => {
      const userId = "user-123";
      const mockRequest = {
        user: { userId },
        ip: "10.0.0.5",
        headers: { "user-agent": "Test-UA/1.0" },
      };

      const result = await controller.exportEmails(mockRequest, {
        password: "super-secret-password",
      });

      expect(result).toEqual({ exportId: "exp-123" });

      expect(mockAuditService.log).toHaveBeenCalledTimes(1);
      const auditArg = mockAuditService.log.mock.calls[0][0];
      expect(auditArg).toEqual({
        userId,
        action: "EMAIL_BULK_EXPORT",
        targetType: "user_emails",
        targetId: userId,
        ipAddress: "10.0.0.5",
        userAgent: "Test-UA/1.0",
      });
      // The export password must never be logged.
      expect(JSON.stringify(auditArg)).not.toContain("super-secret-password");
    });

    it("still returns when audit logging is missing ip/user-agent", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };

      await controller.exportEmails(mockRequest, { password: "password123" });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: "EMAIL_BULK_EXPORT",
          ipAddress: null,
          userAgent: null,
        }),
      );
    });
  });

  // rankSearchResults and expandSearchResults tests live in email-search-ops.controller.spec.ts
  // (methods extracted to EmailSearchOpsController)

  describe("getSearchEnrichmentStatus", () => {
    it("should return 404 when job does not exist", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      jest.spyOn(searchEnrichmentService, "getStatus").mockReturnValue(null);

      await expect(
        controller.getSearchEnrichmentStatus(
          mockRequest,
          "non-existent-job-id",
        ),
      ).rejects.toThrow(NotFoundException);

      expect(searchEnrichmentService.getStatus).toHaveBeenCalledWith(
        "non-existent-job-id",
        "user-123",
      );
    });

    it("should return 404 when job belongs to a different user", async () => {
      // getStatus returns null for both missing jobs AND wrong-owner jobs to avoid
      // leaking job existence to unauthorised callers.
      const mockRequest = { user: { userId: "attacker-user" } };
      jest.spyOn(searchEnrichmentService, "getStatus").mockReturnValue(null);

      await expect(
        controller.getSearchEnrichmentStatus(mockRequest, "victim-job-id"),
      ).rejects.toThrow(NotFoundException);

      expect(searchEnrichmentService.getStatus).toHaveBeenCalledWith(
        "victim-job-id",
        "attacker-user",
      );
    });

    it("should return 200 with correct progress and results shape", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      const mockStatusResponse = {
        jobId: "job-abc-123",
        status: "in-progress" as const,
        progress: { total: 10, enriched: 3, failed: 0 },
        enrichedResults: [
          {
            messageId: "msg-1",
            threadId: "thread-1",
            subject: "Test Subject",
            from: "sender@example.com",
            date: new Date().toISOString(),
            snippet: "Test snippet",
            isRead: false,
            labelIds: [],
            enrichmentStatus: "enriched" as const,
            id: "db-id-1",
            body: "Full body text",
            priorityScore: 75,
          },
        ],
      };

      jest
        .spyOn(searchEnrichmentService, "getStatus")
        .mockReturnValue(mockStatusResponse);

      const result = await controller.getSearchEnrichmentStatus(
        mockRequest,
        "job-abc-123",
      );

      expect(result).toEqual(mockStatusResponse);
      expect(result.progress.total).toBe(10);
      expect(result.progress.enriched).toBe(3);
      expect(result.enrichedResults).toHaveLength(1);
      expect(result.enrichedResults[0].messageId).toBe("msg-1");
      expect(searchEnrichmentService.getStatus).toHaveBeenCalledWith(
        "job-abc-123",
        "user-123",
      );
    });
  });
});
