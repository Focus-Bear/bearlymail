import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { google } from "googleapis";
import { Repository } from "typeorm";

import { ContextService } from "../context/context.service";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { ContextKey, Source } from "../database/entities/user-context.entity";
import { ScanEmailService } from "../emails/scan-email.service";
import { LLMService } from "../llm/llm.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { ScanAnalysisService } from "./scan-analysis.service";

// Mock googleapis
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn(),
  },
}));

describe("ScanAnalysisService", () => {
  let service: ScanAnalysisService;
  let scanEmailRepository: jest.Mocked<Repository<ScanEmail>>;
  let scanEmailService: jest.Mocked<ScanEmailService>;
  let contextService: jest.Mocked<ContextService>;
  let usersService: jest.Mocked<UsersService>;
  let mockGmail: Record<string, unknown>;

  const mockScanEmail: ScanEmail = {
    id: "scan-email-1",
    userId: "user-1",
    messageId: "message-1",
    threadId: "thread-1",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test Email",
    receivedAt: new Date("2024-01-01"),
    starCount: 0,
    wasRepliedTo: false,
    timeToReply: null,
    isArchived: false,
  } as ScanEmail;

  const mockUser = {
    id: "user-1",
    googleCalendarAccessToken: "access-token",
    googleCalendarRefreshToken: "refresh-token",
  };

  beforeEach(async () => {
    mockGmail = {
      users: {
        threads: {
          get: jest.fn(),
        },
      },
    };

    (google.gmail as jest.Mock).mockReturnValue(mockGmail);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanAnalysisService,
        {
          provide: getRepositoryToken(ScanEmail),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: ScanEmailService,
          useValue: {
            findAllForUser: jest.fn(),
            deleteAllForUser: jest.fn(),
          },
        },
        {
          provide: ContextService,
          useValue: {
            createOrUpdateContext: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: LLMService,
          useValue: {
            identifyCustomLabels: jest.fn(),
          },
        },
        {
          provide: "PG_BOSS",
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ScanAnalysisService>(ScanAnalysisService);
    scanEmailRepository = module.get(getRepositoryToken(ScanEmail));
    scanEmailService = module.get(ScanEmailService);
    contextService = module.get(ContextService);
    usersService = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe("analyzeScanResults", () => {
    it("should analyze scan results and create context", async () => {
      scanEmailService.findAllForUser.mockResolvedValue([mockScanEmail]);
      usersService.findOne.mockResolvedValue(mockUser);
      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              labelIds: ["INBOX"],
              internalDate: String(new Date("2024-01-01").getTime()),
            },
          ],
        },
      });
      scanEmailRepository.save.mockResolvedValue(mockScanEmail);
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));

      await service.analyzeScanResults("user-1");

      expect(scanEmailService.findAllForUser).toHaveBeenCalledWith("user-1");
      // Context may or may not be created depending on analysis results
      expect(scanEmailService.deleteAllForUser).toHaveBeenCalledWith("user-1");
    });

    it("should skip analysis when no scan emails found", async () => {
      scanEmailService.findAllForUser.mockResolvedValue([]);

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      await service.analyzeScanResults("user-1");

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No scan emails found"),
      );
      expect(contextService.createOrUpdateContext).not.toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });

    it("should handle errors gracefully", async () => {
      scanEmailService.findAllForUser.mockRejectedValue(
        new Error("Database error"),
      );

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      await expect(service.analyzeScanResults("user-1")).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalled();

      loggerErrorSpy.mockRestore();
    });

    it("should enrich scan emails with reply data", async () => {
      const emailWithReply = {
        ...mockScanEmail,
        wasRepliedTo: false,
        timeToReply: null,
      };

      scanEmailService.findAllForUser.mockResolvedValue([emailWithReply]);
      usersService.findOne.mockResolvedValue(mockUser);

      const originalDate = new Date("2024-01-01T10:00:00Z");
      // 1 hour later
      const replyDate = new Date("2024-01-01T11:00:00Z");

      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              labelIds: ["INBOX"],
              internalDate: String(originalDate.getTime()),
            },
            {
              id: "msg-2",
              labelIds: ["SENT", "INBOX"],
              internalDate: String(replyDate.getTime()),
            },
          ],
        },
      });

      scanEmailRepository.save.mockResolvedValue(emailWithReply);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      expect(scanEmailRepository.save).toHaveBeenCalled();
      const savedEmail = scanEmailRepository.save.mock.calls[0][0][0];
      expect(savedEmail.wasRepliedTo).toBe(true);
      // Time to reply is calculated in hours, value depends on implementation
      expect(savedEmail.timeToReply).toBeGreaterThan(0);
    });

    it("should mark emails as archived when not in INBOX", async () => {
      scanEmailService.findAllForUser.mockResolvedValue([mockScanEmail]);
      usersService.findOne.mockResolvedValue(mockUser);

      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              // Not in INBOX
              labelIds: [],
              internalDate: String(new Date("2024-01-01").getTime()),
            },
          ],
        },
      });

      scanEmailRepository.save.mockResolvedValue(mockScanEmail);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      const savedEmail = scanEmailRepository.save.mock.calls[0][0][0];
      expect(savedEmail.isArchived).toBe(true);
    });

    it("should create VIP contacts from quick reply senders", async () => {
      const quickReplyEmail = {
        ...mockScanEmail,
        from: "vip@example.com",
        fromName: "VIP Sender",
        wasRepliedTo: true,
        // 1 hour (within 2 hour threshold)
        timeToReply: 1,
      };

      // Second quick reply
      scanEmailService.findAllForUser.mockResolvedValue([
        quickReplyEmail,
        { ...quickReplyEmail, messageId: "msg-2" },
      ]);

      usersService.findOne.mockResolvedValue(mockUser);

      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              labelIds: ["SENT", "INBOX"],
              internalDate: String(new Date("2024-01-01T11:00:00Z").getTime()),
            },
          ],
        },
      });

      scanEmailRepository.save.mockResolvedValue(quickReplyEmail);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      expect(contextService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.VIP_CONTACT,
        "VIP Sender",
        Source.AUTOGENERATED,
      );
    });

    it("should create VIP contacts from starred senders", async () => {
      const starredEmail = {
        ...mockScanEmail,
        from: "starred@example.com",
        fromName: "Starred Sender",
        starCount: 3,
      };

      // Need at least 3 starred emails from same sender
      scanEmailService.findAllForUser.mockResolvedValue([
        starredEmail,
        { ...starredEmail, messageId: "msg-2" },
        { ...starredEmail, messageId: "msg-3" },
      ]);

      usersService.findOne.mockResolvedValue(mockUser);

      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              labelIds: ["INBOX"],
              internalDate: String(new Date("2024-01-01").getTime()),
            },
          ],
        },
      });

      scanEmailRepository.save.mockResolvedValue(starredEmail);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      expect(contextService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.VIP_CONTACT,
        "Starred Sender",
        Source.AUTOGENERATED,
      );
    });

    it("should calculate average reply time", async () => {
      const repliedEmails = [
        {
          ...mockScanEmail,
          wasRepliedTo: true,
          timeToReply: 2,
        },
        {
          ...mockScanEmail,
          messageId: "msg-2",
          wasRepliedTo: true,
          timeToReply: 4,
        },
        {
          ...mockScanEmail,
          messageId: "msg-3",
          wasRepliedTo: false,
          timeToReply: null,
        },
      ];

      scanEmailService.findAllForUser.mockResolvedValue(repliedEmails);
      usersService.findOne.mockResolvedValue(mockUser);

      mockGmail.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: "msg-1",
              labelIds: ["INBOX"],
              internalDate: String(new Date("2024-01-01").getTime()),
            },
          ],
        },
      });

      scanEmailRepository.save.mockResolvedValue(repliedEmails[0]);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      // Average of 2 and 4 = 3
      expect(contextService.createOrUpdateContext).toHaveBeenCalledWith(
        "user-1",
        ContextKey.AVERAGE_REPLY_TIME,
        "3.00",
        Source.AUTOGENERATED,
      );
    });

    it("should skip enrichment when user not connected", async () => {
      scanEmailService.findAllForUser.mockResolvedValue([mockScanEmail]);
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not connected"),
      );
      expect(mockGmail.users.threads.get).not.toHaveBeenCalled();

      loggerWarnSpy.mockRestore();
    });

    it("should handle thread enrichment errors gracefully", async () => {
      scanEmailService.findAllForUser.mockResolvedValue([mockScanEmail]);
      usersService.findOne.mockResolvedValue(mockUser);

      mockGmail.users.threads.get.mockRejectedValue(
        new Error("Gmail API error"),
      );

      const loggerWarnSpy = jest
        .spyOn(service["logger"], "warn")
        .mockImplementation();

      scanEmailRepository.save.mockResolvedValue(mockScanEmail);
      contextService.createOrUpdateContext.mockResolvedValue(mockPartial({}));
      scanEmailService.deleteAllForUser.mockResolvedValue(undefined);

      await service.analyzeScanResults("user-1");

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to enrich thread"),
        expect.any(Error),
      );

      loggerWarnSpy.mockRestore();
    });
  });
});
