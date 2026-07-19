import { Test, TestingModule } from "@nestjs/testing";

import { AppleMailAccountsService } from "../apple-mail-accounts/apple-mail-accounts.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { Office365AccountsService } from "../office365-accounts/office365-accounts.service";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { ZohoAccountsService } from "../zoho-accounts/zoho-accounts.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSendController } from "./email-send.controller";
import { EmailsService } from "./emails.service";

describe("EmailSendController", () => {
  let controller: EmailSendController;

  const mockEmailsService = {
    getEmailById: jest.fn(),
  };

  const mockEmailProviderManager = {
    getPrimaryProvider: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    findOneWithTokens: jest.fn().mockResolvedValue(null),
  };

  const mockEmailAdminService = {
    trackEmailRecipients: jest.fn(),
    queueBulkRecategorization: jest.fn(),
    getEmailThreadById: jest.fn(),
  };

  const mockBoss = {
    send: jest.fn(),
    getDb: () => ({
      executeSql: jest.fn().mockResolvedValue({ rowCount: 0 }),
    }),
  };

  const mockScheduledEmailsService = {
    scheduleEmail: jest.fn(),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailSendController],
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
          provide: UsersService,
          useValue: mockUsersService,
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
          provide: ScheduledEmailsService,
          useValue: mockScheduledEmailsService,
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
      ],
    })
      .overrideGuard(AiCapacityGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<EmailSendController>(EmailSendController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("sendEmail", () => {
    it("should schedule email when scheduledSendAt is provided", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const scheduledSendAt = new Date(Date.now() + 3600000).toISOString();
      const body = {
        to: ["recipient@example.com"],
        subject: "Test",
        body: "Hello",
        scheduledSendAt,
      };
      const mockScheduled = {
        id: "scheduled-1",
        scheduledSendAt: new Date(scheduledSendAt),
      };

      mockScheduledEmailsService.scheduleEmail.mockResolvedValue(mockScheduled);

      const result = await controller.sendEmail(mockRequest, body);

      expect(result).toEqual({
        success: true,
        scheduledEmailId: mockScheduled.id,
        scheduledSendAt: mockScheduled.scheduledSendAt,
        message: "Email scheduled successfully",
      });
      expect(mockScheduledEmailsService.scheduleEmail).toHaveBeenCalledWith(
        userId,
        // String recipients are normalised to { email } objects.
        expect.objectContaining({
          emailType: "new",
          to: [{ email: "recipient@example.com" }],
        }),
      );
    });

    it("should send email immediately when no scheduledSendAt", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        to: ["recipient@example.com"],
        subject: "Test",
        body: "Hello",
      };
      const mockProvider = {
        sendEmail: jest
          .fn()
          .mockResolvedValue({ messageId: "msg-1", threadId: "thread-1" }),
      };
      const mockUser = { emailSignature: null };

      mockEmailProviderManager.getPrimaryProvider.mockResolvedValue(
        mockProvider,
      );
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockEmailAdminService.trackEmailRecipients.mockResolvedValue(undefined);

      const result = await controller.sendEmail(mockRequest, body);

      expect(result).toEqual({
        success: true,
        messageId: "msg-1",
        threadId: "thread-1",
      });
      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          to: [{ email: "recipient@example.com" }],
          subject: body.subject,
        }),
      );
    });

    it("parses JSON-string recipients and maps uploaded files to attachments (multipart path)", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      // On the multipart/form-data path recipients arrive as JSON strings and
      // files arrive via Multer.
      const body = {
        to: JSON.stringify([{ email: "recipient@example.com", name: "R" }]),
        cc: JSON.stringify([{ email: "cc@example.com" }]),
        subject: "Test",
        body: "Hello",
      } as never;
      const files = [
        {
          originalname: "slides.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("pdf-bytes"),
        },
      ] as Express.Multer.File[];
      const mockProvider = {
        sendEmail: jest
          .fn()
          .mockResolvedValue({ messageId: "msg-1", threadId: "thread-1" }),
      };

      mockEmailProviderManager.getPrimaryProvider.mockResolvedValue(
        mockProvider,
      );
      mockUsersService.findOne.mockResolvedValue({ emailSignature: null });
      mockEmailAdminService.trackEmailRecipients.mockResolvedValue(undefined);

      await controller.sendEmail(mockRequest, body, files);

      expect(mockProvider.sendEmail).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          to: [{ email: "recipient@example.com", name: "R" }],
          cc: [{ email: "cc@example.com" }],
          attachments: [
            {
              filename: "slides.pdf",
              mimeType: "application/pdf",
              content: expect.any(Buffer),
            },
          ],
        }),
      );
    });

    it("should throw when no email provider connected", async () => {
      const mockRequest = { user: { userId: "user-123" } };
      const body = {
        to: ["recipient@example.com"],
        subject: "Test",
        body: "Hello",
      };

      mockEmailProviderManager.getPrimaryProvider.mockResolvedValue(null);

      await expect(controller.sendEmail(mockRequest, body)).rejects.toThrow(
        "No email provider connected",
      );
    });
  });

  describe("recategorizeTriageEmails", () => {
    it("should call queueBulkRecategorization with userId and modes", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockResult = { queued: 5 };

      mockEmailAdminService.queueBulkRecategorization.mockResolvedValue(
        mockResult,
      );

      const result = await controller.recategorizeTriageEmails(
        mockRequest,
        "triage,action",
      );

      expect(result).toEqual(mockResult);
      expect(
        mockEmailAdminService.queueBulkRecategorization,
      ).toHaveBeenCalledWith(userId, "triage,action");
    });
  });
});
