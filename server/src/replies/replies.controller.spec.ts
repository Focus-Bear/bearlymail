import { Test, TestingModule } from "@nestjs/testing";

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
    it("should send reply", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = { reply: "Thank you for your email" };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      const result = await controller.sendReply(mockRequest, emailId, body);

      expect(result).toEqual({ message: "Reply sent successfully" });
      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        {
          attachments: [],
          bcc: undefined,
          cc: undefined,
          expectedReplyHours: undefined,
          forwardAttachmentIds: undefined,
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: undefined,
        },
      );
    });

    it("should send reply with attachments", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = { reply: "Thank you for your email" };
      const mockFiles = [
        {
          fieldname: "files",
          originalname: "test.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("test content"),
        },
      ] as Express.Multer.File[];

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      const result = await controller.sendReply(
        mockRequest,
        emailId,
        body,
        mockFiles,
      );

      expect(result).toEqual({ message: "Reply sent successfully" });
      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        {
          attachments: [
            {
              filename: "test.pdf",
              mimeType: "application/pdf",
              content: Buffer.from("test content"),
            },
          ],
          bcc: undefined,
          cc: undefined,
          expectedReplyHours: undefined,
          forwardAttachmentIds: undefined,
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: undefined,
        },
      );
    });

    it("should send reply with forward attachment IDs", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        reply: "Thank you for your email",
        forwardAttachmentIds: JSON.stringify(["attach-1", "attach-2"]),
      };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      const result = await controller.sendReply(mockRequest, emailId, body);

      expect(result).toEqual({ message: "Reply sent successfully" });
      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        {
          attachments: [],
          bcc: undefined,
          cc: undefined,
          expectedReplyHours: undefined,
          forwardAttachmentIds: ["attach-1", "attach-2"],
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: undefined,
        },
      );
    });

    it("should send reply with expected reply hours", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        reply: "Thank you for your email",
        expectedReplyHours: 24,
      };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      const result = await controller.sendReply(mockRequest, emailId, body);

      expect(result).toEqual({ message: "Reply sent successfully" });
      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        {
          attachments: [],
          bcc: undefined,
          cc: undefined,
          expectedReplyHours: 24,
          forwardAttachmentIds: undefined,
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: undefined,
        },
      );
    });

    it("should forward keepInAction=true to the service", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        reply: "Thanks",
        keepInAction: true,
      };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      await controller.sendReply(mockRequest, emailId, body);

      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        expect.objectContaining({ keepInAction: true }),
      );
    });

    it("should coerce keepInAction string 'true' to boolean", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        reply: "Thanks",
        keepInAction: "true",
      };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      await controller.sendReply(mockRequest, emailId, body);

      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        expect.objectContaining({ keepInAction: true }),
      );
    });

    it("should send reply-all with recipients and cc", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        reply: "Thanks everyone",
        recipients: "sender@example.com, other@example.com",
        cc: "cc@example.com",
      };

      mockRepliesService.sendReply.mockResolvedValue(undefined);

      const result = await controller.sendReply(mockRequest, emailId, body);

      expect(result).toEqual({ message: "Reply sent successfully" });
      expect(repliesService.sendReply).toHaveBeenCalledWith(
        userId,
        emailId,
        body.reply,
        {
          attachments: [],
          bcc: undefined,
          cc: "cc@example.com",
          expectedReplyHours: undefined,
          forwardAttachmentIds: undefined,
          inlineImages: undefined,
          isForward: false,
          keepInAction: false,
          recipients: "sender@example.com, other@example.com",
        },
      );
    });
  });
});
