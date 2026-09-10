import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { EMAIL_SEND_STATUS } from "../constants/email-send.constants";
import { EmailSendQueueService } from "../email-send-queue/email-send-queue.service";
import { EmailsService } from "../emails/emails.service";
import { ScheduledEmailsService } from "../scheduled-emails/scheduled-emails.service";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { RepliesController } from "./replies.controller";
import { RepliesService } from "./replies.service";

describe("RepliesController", () => {
  let controller: RepliesController;
  let repliesService: RepliesService;

  const mockRepliesService = {
    generateDraftReply: jest.fn(),
    learnFromModification: jest.fn(),
    getReplyRules: jest.fn(),
    createReplyRule: jest.fn(),
    updateReplyRule: jest.fn(),
    deleteReplyRule: jest.fn(),
    sendReply: jest.fn(),
  };

  const mockScheduledEmailsService = {
    createScheduledEmail: jest.fn(),
    getSuggestedTimes: jest.fn(),
    checkSendTimeAppropriate: jest.fn(),
    cancelScheduledEmail: jest.fn(),
  };

  const mockEmailsService = {
    getEmailById: jest.fn(),
  };

  const mockEmailSendQueueService = {
    queueReply: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RepliesController],
      providers: [
        {
          provide: RepliesService,
          useValue: mockRepliesService,
        },
        {
          provide: ScheduledEmailsService,
          useValue: mockScheduledEmailsService,
        },
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: EmailSendQueueService,
          useValue: mockEmailSendQueueService,
        },
      ],
    })
      .overrideGuard(AiCapacityGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<RepliesController>(RepliesController);
    repliesService = module.get<RepliesService>(RepliesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("generateDraft", () => {
    it("should generate draft reply", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const mockDraft = "Thank you for your email...";

      mockRepliesService.generateDraftReply.mockResolvedValue(mockDraft);

      const result = await controller.generateDraft(mockRequest, emailId);

      expect(result).toEqual({ draft: mockDraft });
      expect(repliesService.generateDraftReply).toHaveBeenCalledWith(
        userId,
        emailId,
        undefined,
      );
    });

    it("should generate draft with provider", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = { provider: "gemini" as const };
      const mockDraft = "Draft reply";

      mockRepliesService.generateDraftReply.mockResolvedValue(mockDraft);

      const result = await controller.generateDraft(mockRequest, emailId, body);

      expect(result).toEqual({ draft: mockDraft });
      expect(repliesService.generateDraftReply).toHaveBeenCalledWith(
        userId,
        emailId,
        "gemini",
      );
    });

    it("should generate draft with openai provider", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = { provider: "openai" as const };
      const mockDraft = "Draft reply";

      mockRepliesService.generateDraftReply.mockResolvedValue(mockDraft);

      await controller.generateDraft(mockRequest, emailId, body);

      expect(repliesService.generateDraftReply).toHaveBeenCalledWith(
        userId,
        emailId,
        "openai",
      );
    });
  });

  describe("learnFromModification", () => {
    it("should learn from draft modification", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        emailId: "email-123",
        originalDraft: "Original draft",
        modifiedDraft: "Modified draft",
      };
      const mockResult = { success: true };

      mockRepliesService.learnFromModification.mockResolvedValue(mockResult);

      const result = await controller.learnFromModification(mockRequest, body);

      expect(result).toEqual(mockResult);
      expect(repliesService.learnFromModification).toHaveBeenCalledWith(
        userId,
        body.emailId,
        body.originalDraft,
        body.modifiedDraft,
      );
    });
  });

  describe("getRules", () => {
    it("should return reply rules", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const mockRules = [
        { id: "rule-1", whenToUse: "When thanking", howToReply: "Be polite" },
      ];

      mockRepliesService.getReplyRules.mockResolvedValue(mockRules);

      const result = await controller.getRules(mockRequest);

      expect(result).toEqual(mockRules);
      expect(repliesService.getReplyRules).toHaveBeenCalledWith(userId);
    });
  });

  describe("createRule", () => {
    it("should create reply rule", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const rule = {
        trigger: "When thanking",
        template: "Be polite and concise",
        priority: 1,
      };
      const mockCreatedRule = { id: "rule-1", ...rule };

      mockRepliesService.createReplyRule.mockResolvedValue(mockCreatedRule);

      const result = await controller.createRule(mockRequest, rule);

      expect(result).toEqual(mockCreatedRule);
      expect(repliesService.createReplyRule).toHaveBeenCalledWith(userId, rule);
    });
  });

  describe("updateRule", () => {
    it("should update reply rule", async () => {
      const userId = "user-123";
      const ruleId = "rule-123";
      const mockRequest = { user: { userId } };
      const updates = { template: "Updated reply style" };
      const mockUpdatedRule = { id: ruleId, ...updates };

      mockRepliesService.updateReplyRule.mockResolvedValue(mockUpdatedRule);

      const result = await controller.updateRule(mockRequest, ruleId, updates);

      expect(result).toEqual(mockUpdatedRule);
      expect(repliesService.updateReplyRule).toHaveBeenCalledWith(
        userId,
        ruleId,
        updates,
      );
    });
  });

  describe("deleteRule", () => {
    it("should delete reply rule", async () => {
      const userId = "user-123";
      const ruleId = "rule-123";
      const mockRequest = { user: { userId } };

      mockRepliesService.deleteReplyRule.mockResolvedValue(undefined);

      const result = await controller.deleteRule(mockRequest, ruleId);

      expect(result).toEqual({ message: "Rule deleted" });
      expect(repliesService.deleteReplyRule).toHaveBeenCalledWith(
        userId,
        ruleId,
      );
    });
  });

  describe("sendReply", () => {
    const userId = "user-123";
    const emailId = "email-123";
    const mockRequest = { user: { userId } };
    const queued = {
      sendId: "send-1",
      status: EMAIL_SEND_STATUS.QUEUED,
    };

    beforeEach(() => {
      mockEmailsService.getEmailById.mockResolvedValue({ id: emailId });
      mockEmailSendQueueService.queueReply.mockResolvedValue(queued);
    });

    it("returns a correlation id without touching the provider", async () => {
      const body = { reply: "Thank you for your email" };

      const result = await controller.sendReply(mockRequest, emailId, body);

      expect(result).toEqual({
        message: "Reply queued for sending",
        queued: true,
        sendId: queued.sendId,
        status: EMAIL_SEND_STATUS.QUEUED,
      });
      expect(repliesService.sendReply).not.toHaveBeenCalled();
      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        {
          body: body.reply,
          attachments: undefined,
          bcc: undefined,
          cc: undefined,
          expectedReplyHours: undefined,
          forwardAttachmentIds: undefined,
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: undefined,
          subject: undefined,
        },
      );
    });

    it("404s for an unknown email instead of queueing", async () => {
      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(
        controller.sendReply(mockRequest, emailId, { reply: "Hi" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockEmailSendQueueService.queueReply).not.toHaveBeenCalled();
    });

    it("base64-encodes attachments into the queued payload", async () => {
      const mockFiles = [
        {
          fieldname: "files",
          originalname: "test.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("test content"),
        },
      ] as Express.Multer.File[];

      await controller.sendReply(
        mockRequest,
        emailId,
        { reply: "Thank you for your email" },
        mockFiles,
      );

      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        expect.objectContaining({
          attachments: [
            {
              filename: "test.pdf",
              mimeType: "application/pdf",
              content: Buffer.from("test content").toString("base64"),
            },
          ],
        }),
      );
    });

    it("recovers the Content-ID of an inline image", async () => {
      const mockFiles = [
        {
          fieldname: "inlineImages",
          originalname: "cid-1::::logo.png",
          mimetype: "image/png",
          buffer: Buffer.from("png"),
        },
      ] as Express.Multer.File[];

      await controller.sendReply(
        mockRequest,
        emailId,
        { reply: "See image" },
        mockFiles,
      );

      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        expect.objectContaining({
          inlineImages: [
            {
              contentId: "cid-1",
              filename: "logo.png",
              mimeType: "image/png",
              content: Buffer.from("png").toString("base64"),
            },
          ],
        }),
      );
    });

    it("queues forward attachment IDs and expected reply hours", async () => {
      await controller.sendReply(mockRequest, emailId, {
        reply: "Thank you for your email",
        forwardAttachmentIds: JSON.stringify(["attach-1", "attach-2"]),
        expectedReplyHours: 24,
      });

      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        expect.objectContaining({
          forwardAttachmentIds: ["attach-1", "attach-2"],
          expectedReplyHours: 24,
        }),
      );
    });

    it("coerces keepInAction string 'true' to boolean", async () => {
      await controller.sendReply(mockRequest, emailId, {
        reply: "Thanks",
        keepInAction: "true",
      });

      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        expect.objectContaining({ keepInAction: true }),
      );
    });

    it("carries reply-all recipients and cc through to the queue", async () => {
      await controller.sendReply(mockRequest, emailId, {
        reply: "Thanks everyone",
        recipients: "sender@example.com, other@example.com",
        cc: "cc@example.com",
      });

      expect(mockEmailSendQueueService.queueReply).toHaveBeenCalledWith(
        userId,
        emailId,
        expect.objectContaining({
          cc: "cc@example.com",
          recipients: "sender@example.com, other@example.com",
        }),
      );
    });
  });
});
