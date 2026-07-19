import { Test, TestingModule } from "@nestjs/testing";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { AuditService } from "../audit/audit.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailDebugController } from "./email-debug.controller";
import { EmailsService } from "./emails.service";
import { GmailSyncService } from "./providers/gmail-sync.service";

describe("EmailDebugController", () => {
  let controller: EmailDebugController;

  const mockEmailsService = {
    fixStuckCalculatingThreads: jest.fn(),
    fixStaleUnsyncedThreads: jest.fn(),
    lookupByGmailUrl: jest.fn(),
    lookupByMessageId: jest.fn(),
    lookupThread: jest.fn(),
    getCategoryDebugData: jest.fn(),
  };

  const mockEmailAdminService = {};

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
    findOne: jest.fn().mockResolvedValue({ isAdmin: true }),
    findOneWithTokens: jest.fn().mockResolvedValue(null),
  };

  const mockGmailSyncService = {
    refreshAttachmentsFromGmailForThread: jest.fn(),
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
          provide: GmailSyncService,
          useValue: mockGmailSyncService,
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
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

  describe("refreshAttachmentsFromGmail", () => {
    it("should call refreshAttachmentsFromGmailForThread (not the single-email variant)", async () => {
      const mockResult = {
        threadId: "gmail-thread-hex-id",
        results: [
          {
            emailId: "email-uuid",
            gmailMessageId: "msg-id",
            attachments: [],
          },
        ],
      };
      mockGmailSyncService.refreshAttachmentsFromGmailForThread.mockResolvedValue(
        mockResult,
      );

      const req = { user: { userId: "user-123" } };
      const result = await controller.refreshAttachmentsFromGmail(
        req as any,
        "email-uuid",
      );

      expect(
        mockGmailSyncService.refreshAttachmentsFromGmailForThread,
      ).toHaveBeenCalledWith("user-123", "email-uuid");
      expect(result).toEqual(mockResult);
    });
  });
});
