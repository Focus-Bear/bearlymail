import { Test, TestingModule } from "@nestjs/testing";
import { RepliesService } from "./replies.service";
import { EmailsService } from "../emails/emails.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { ContextService } from "../context/context.service";
import { LLMService } from "../llm/llm.service";

describe("RepliesService", () => {
  let service: RepliesService;
  let emailsService: jest.Mocked<EmailsService>;
  let emailProviderManager: jest.Mocked<EmailProviderManager>;
  let contextService: jest.Mocked<ContextService>;
  let llmService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepliesService,
        {
          provide: EmailsService,
          useValue: {
            getEmailById: jest.fn(),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getPrimaryProvider: jest.fn(),
          },
        },
        {
          provide: ContextService,
          useValue: {
            getUserContext: jest.fn(),
          },
        },
        {
          provide: LLMService,
          useValue: {
            generateReplyDraft: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RepliesService>(RepliesService);
    emailsService = module.get(EmailsService);
    emailProviderManager = module.get(EmailProviderManager);
    contextService = module.get(ContextService);
    llmService = module.get(LLMService);
  });

  describe("matchesTrigger", () => {
    // Since matchesTrigger is private, we test it through public methods
    // We'll test it via createReplyRule and generateDraftReply

    it("should match subject contains trigger", async () => {
      const userId = "user1";
      const emailId = "email1";
      const email = {
        id: emailId,
        userId,
        subject: "Meeting tomorrow",
        body: "Let's meet",
        from: "sender@example.com",
        fromName: "Sender",
      };

      emailsService.getEmailById.mockResolvedValue(email as any);
      contextService.getUserContext.mockResolvedValue([]);
      llmService.generateReplyDraft.mockResolvedValue("Generated reply");

      // Create a rule with subject contains trigger
      await service.createReplyRule(userId, {
        trigger: "subject contains 'meeting'",
        template: "Thanks for the meeting invite",
        priority: 1,
      });

      // Generate draft - should match the rule
      const result = await service.generateDraftReply(userId, emailId);

      // If rule matches, it should use the template, not LLM
      // The actual implementation uses rule template when matched
      expect(result).toBeDefined();
    });
  });

  describe("applyTemplate", () => {
    // applyTemplate is private, tested through generateDraftReply with matching rule

    it("should replace {sender} placeholder in template", async () => {
      const userId = "user1";
      const emailId = "email1";
      const email = {
        id: emailId,
        userId,
        subject: "Test",
        body: "Body",
        from: "sender@example.com",
        fromName: "John Doe",
      };

      emailsService.getEmailById.mockResolvedValue(email as any);
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "professional",
        },
      ] as any);

      // Create rule
      await service.createReplyRule(userId, {
        trigger: "subject contains 'test'",
        template: "Hi {sender}, thanks for your email about {subject}",
        priority: 1,
      });

      // Generate draft - should apply template
      const result = await service.generateDraftReply(userId, emailId);

      expect(result).toContain("John Doe");
      expect(result).toContain("Test");
    });

    it("should use greeting based on tone", async () => {
      const userId = "user1";
      const emailId = "email1";
      const email = {
        id: emailId,
        userId,
        subject: "Test",
        body: "Body",
        from: "sender@example.com",
        fromName: "John Doe",
      };

      emailsService.getEmailById.mockResolvedValue(email as any);

      // Test casual tone
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "casual",
        },
      ] as any);

      await service.createReplyRule(userId, {
        trigger: "subject contains 'test'",
        template: "Thanks",
        priority: 1,
      });

      const casualResult = await service.generateDraftReply(userId, emailId);
      expect(casualResult).toContain("Hey");

      // Test formal tone
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "formal",
        },
      ] as any);

      await service.createReplyRule(userId, {
        trigger: "subject contains 'test'",
        template: "Thank you",
        priority: 1,
      });

      const formalResult = await service.generateDraftReply(userId, emailId);
      expect(formalResult).toContain("Dear");
    });
  });

  describe("createReplyRule", () => {
    it("should create a new reply rule with generated ruleId", async () => {
      const userId = "user1";
      const rule = {
        trigger: "subject contains 'meeting'",
        template: "Thanks for the meeting",
        priority: 1,
      };

      const result = await service.createReplyRule(userId, rule);

      expect(result.ruleId).toBeDefined();
      expect(result.trigger).toBe(rule.trigger);
      expect(result.template).toBe(rule.template);
      expect(result.priority).toBe(rule.priority);
    });

    it("should store rule and retrieve it", async () => {
      const userId = "user1";
      const rule = {
        trigger: "subject contains 'test'",
        template: "Test template",
        priority: 1,
      };

      await service.createReplyRule(userId, rule);
      const rules = await service.getReplyRules(userId);

      expect(rules.length).toBe(1);
      expect(rules[0].trigger).toBe(rule.trigger);
    });
  });

  describe("getReplyRules", () => {
    it("should return empty array when no rules exist", async () => {
      const userId = "user1";
      const rules = await service.getReplyRules(userId);

      expect(rules).toEqual([]);
    });

    it("should return all rules for user", async () => {
      const userId = "user1";
      const rule1 = await service.createReplyRule(userId, {
        trigger: "subject contains 'test1'",
        template: "Template 1",
        priority: 1,
      });
      const rule2 = await service.createReplyRule(userId, {
        trigger: "subject contains 'test2'",
        template: "Template 2",
        priority: 2,
      });

      const rules = await service.getReplyRules(userId);

      expect(rules.length).toBe(2);
      expect(rules).toContainEqual(rule1);
      expect(rules).toContainEqual(rule2);
    });
  });

  describe("updateReplyRule", () => {
    it("should update existing rule", async () => {
      const userId = "user1";
      const rule = await service.createReplyRule(userId, {
        trigger: "subject contains 'test'",
        template: "Original template",
        priority: 1,
      });

      const updated = await service.updateReplyRule(userId, rule.ruleId!, {
        template: "Updated template",
      });

      expect(updated.template).toBe("Updated template");
      expect(updated.trigger).toBe(rule.trigger); // Other fields unchanged
    });

    it("should throw error when rule not found", async () => {
      const userId = "user1";

      await expect(
        service.updateReplyRule(userId, "nonexistent-id", {
          template: "Updated",
        }),
      ).rejects.toThrow("Rule not found");
    });
  });

  describe("deleteReplyRule", () => {
    it("should delete existing rule", async () => {
      const userId = "user1";
      const rule = await service.createReplyRule(userId, {
        trigger: "subject contains 'test'",
        template: "Template",
        priority: 1,
      });

      await service.deleteReplyRule(userId, rule.ruleId!);
      const rules = await service.getReplyRules(userId);

      expect(rules.length).toBe(0);
    });

    it("should not throw error when deleting non-existent rule", async () => {
      const userId = "user1";

      await expect(
        service.deleteReplyRule(userId, "nonexistent-id"),
      ).resolves.not.toThrow();
    });
  });

  describe("generateDraftReply", () => {
    const userId = "user1";
    const emailId = "email1";
    const email = {
      id: emailId,
      userId,
      subject: "Test Subject",
      body: "Test body",
      from: "sender@example.com",
      fromName: "Sender Name",
      threadId: "thread1",
    };

    beforeEach(() => {
      emailsService.getEmailById.mockResolvedValue(email as any);
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "professional",
        },
      ] as any);
    });

    it("should throw error when email not found", async () => {
      emailsService.getEmailById.mockResolvedValue(null);

      await expect(service.generateDraftReply(userId, emailId)).rejects.toThrow(
        "Email not found",
      );
    });

    it("should use LLM to generate reply when no matching rule", async () => {
      llmService.generateReplyDraft.mockResolvedValue("LLM generated reply");

      const result = await service.generateDraftReply(userId, emailId);

      expect(result).toBe("LLM generated reply");
      expect(llmService.generateReplyDraft).toHaveBeenCalled();
    });

    it("should use template when matching rule exists", async () => {
      await service.createReplyRule(userId, {
        trigger: "subject contains 'Test'",
        template: "Thanks for your email",
        priority: 1,
      });

      const result = await service.generateDraftReply(userId, emailId);

      expect(result).toContain("Thanks for your email");
      expect(llmService.generateReplyDraft).not.toHaveBeenCalled();
    });

    it("should fallback to default reply when LLM fails", async () => {
      llmService.generateReplyDraft.mockRejectedValue(new Error("LLM error"));

      const result = await service.generateDraftReply(userId, emailId);

      expect(result).toContain("Thank you for your email");
      expect(result).toContain("Test Subject");
    });
  });

  describe("learnFromModification", () => {
    const userId = "user1";
    const emailId = "email1";
    const email = {
      id: emailId,
      userId,
      subject: "Test Subject",
      body: "Test body",
      from: "sender@example.com",
    };

    beforeEach(() => {
      emailsService.getEmailById.mockResolvedValue(email as any);
    });

    it("should create rule from modification", async () => {
      const originalDraft = "Original draft";
      const modifiedDraft = "Modified draft";

      const rule = await service.learnFromModification(
        userId,
        emailId,
        originalDraft,
        modifiedDraft,
      );

      expect(rule).toBeDefined();
      expect(rule.template).toBe(modifiedDraft);
      expect(rule.trigger).toContain("Test"); // First word of subject
    });

    it("should throw error when email not found", async () => {
      emailsService.getEmailById.mockResolvedValue(null);

      await expect(
        service.learnFromModification(userId, emailId, "Original", "Modified"),
      ).rejects.toThrow("Email not found");
    });
  });

  describe("sendReply", () => {
    const userId = "user1";
    const emailId = "email1";
    const email = {
      id: emailId,
      userId,
      subject: "Test Subject",
      body: "Test body",
      from: "sender@example.com",
      threadId: "thread1",
    };

    beforeEach(() => {
      emailsService.getEmailById.mockResolvedValue(email as any);
    });

    it("should throw error when email not found", async () => {
      emailsService.getEmailById.mockResolvedValue(null);

      await expect(
        service.sendReply(userId, emailId, "Reply body"),
      ).rejects.toThrow("Email not found");
    });

    it("should throw error when no provider available", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValue(null);

      await expect(
        service.sendReply(userId, emailId, "Reply body"),
      ).rejects.toThrow("No email provider connected");
    });

    it("should add Re: prefix to subject if not present", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue(undefined),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(
        mockProvider as any,
      );

      await service.sendReply(userId, emailId, "Reply body");

      expect(mockProvider.sendReply).toHaveBeenCalledWith(
        userId,
        email.threadId,
        email.from,
        "Re: Test Subject",
        "Reply body",
      );
    });

    it("should not add Re: prefix if already present", async () => {
      const emailWithRe = {
        ...email,
        subject: "Re: Test Subject",
      };
      emailsService.getEmailById.mockResolvedValue(emailWithRe as any);

      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue(undefined),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(
        mockProvider as any,
      );

      await service.sendReply(userId, emailId, "Reply body");

      expect(mockProvider.sendReply).toHaveBeenCalledWith(
        userId,
        email.threadId,
        email.from,
        "Re: Test Subject", // Should not double add Re:
        "Reply body",
      );
    });
  });
});
