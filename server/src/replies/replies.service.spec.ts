import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { ContextService } from "../context/context.service";
import { WritingStyleLearningService } from "../context/writing-style-learning.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailThreadService } from "../emails/email-thread.service";
import { EmailsService } from "../emails/emails.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { LLMService } from "../llm/llm.service";
import { SnoozeService } from "../snooze/snooze.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { RepliesService } from "./replies.service";

describe("RepliesService", () => {
  let service: RepliesService;
  let module: TestingModule;
  let emailsService: jest.Mocked<EmailsService>;
  let emailProviderManager: jest.Mocked<EmailProviderManager>;
  let contextService: jest.Mocked<ContextService>;
  let llmService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        RepliesService,
        {
          provide: EmailsService,
          useValue: {
            getEmailById: jest.fn(),
            archiveEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getPrimaryProvider: jest.fn(),
          },
        },
        {
          provide: EmailThreadService,
          useValue: {
            findOne: jest.fn(),
            updateThread: jest.fn(),
            updateThreadStarCount: jest.fn(),
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
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: WritingStyleLearningService,
          useValue: {
            learnFromSentEmailBodies: jest.fn(),
          },
        },
        {
          provide: SnoozeService,
          useValue: {
            snoozeEmail: jest.fn(),
          },
        },
        {
          provide: FollowUpsService,
          useValue: {
            createFollowUp: jest.fn(),
            findActiveFollowUpByThread: jest.fn().mockResolvedValue(null),
            cancelFollowUp: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: INJECT_TOKENS.PG_BOSS,
          useValue: {
            send: jest.fn().mockResolvedValue(null),
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

      emailsService.getEmailById.mockResolvedValue(email);
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

      emailsService.getEmailById.mockResolvedValue(email);
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "professional",
        },
      ]);

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

      emailsService.getEmailById.mockResolvedValue(email);

      // Test casual tone
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "casual",
        },
      ]);

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
      ]);

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
      // Other fields unchanged
      expect(updated.trigger).toBe(rule.trigger);
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
      emailsService.getEmailById.mockResolvedValue(email);
      contextService.getUserContext.mockResolvedValue([
        {
          contextKey: "WRITING_STYLE_TONE",
          contextValue: "professional",
        },
      ]);
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
      emailsService.getEmailById.mockResolvedValue(email);
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
      // First word of subject
      expect(rule.trigger).toContain("Test");
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
      receivedAt: new Date("2024-01-15T10:00:00Z"),
    };
    let usersService: jest.Mocked<UsersService>;
    let emailRepository: Record<string, unknown>;
    let emailThreadRepository: Record<string, unknown>;
    let writingStyleLearningService: Record<string, unknown>;

    beforeEach(() => {
      emailsService.getEmailById.mockResolvedValue(email);
      usersService = module.get(UsersService);
      emailRepository = module.get(getRepositoryToken(Email));
      emailThreadRepository = module.get(getRepositoryToken(EmailThread));
      writingStyleLearningService = module.get(WritingStyleLearningService);
      // Mock user for sendReply tests
      usersService.findOne.mockResolvedValue(
        mockPartial({
          id: userId,
          email: "encrypted_user@example.com",
          name: "Test User",
        }),
      );
      emailRepository.create.mockReturnValue({});
      emailRepository.save.mockResolvedValue({});
      emailThreadRepository.findOne.mockResolvedValue({ id: "thread-uuid" });
      writingStyleLearningService.learnFromSentEmailBodies.mockResolvedValue(
        undefined,
      );
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
        sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.sendReply(userId, emailId, "Reply body");

      const dateStr = email.receivedAt.toUTCString();
      const expectedPlainBody = `Reply body\n\nOn ${dateStr}, ${email.from} wrote:\n> Test body\n\nSent from BearlyMail (anti inbox overwhelm system)`;
      const expectedHtmlBody = `Reply body<br><blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #cccccc;padding-left:1ex"><div>On ${dateStr}, ${email.from} wrote:</div>Test body</blockquote>\n\nSent from BearlyMail (anti inbox overwhelm system)`;

      expect(mockProvider.sendReply).toHaveBeenCalledWith(userId, {
        threadId: email.threadId,
        to: email.from,
        subject: "Re: Test Subject",
        body: expectedPlainBody,
        options: {
          attachments: undefined,
          bcc: undefined,
          cc: undefined,
          htmlBody: expectedHtmlBody,
        },
      });
    });

    it("should not add Re: prefix if already present", async () => {
      const emailWithRe = {
        ...email,
        subject: "Re: Test Subject",
      };
      emailsService.getEmailById.mockResolvedValue(emailWithRe);

      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.sendReply(userId, emailId, "Reply body");

      const dateStr = email.receivedAt.toUTCString();
      const expectedPlainBody = `Reply body\n\nOn ${dateStr}, ${email.from} wrote:\n> Test body\n\nSent from BearlyMail (anti inbox overwhelm system)`;

      expect(mockProvider.sendReply).toHaveBeenCalledWith(userId, {
        threadId: email.threadId,
        to: email.from,
        subject: "Re: Test Subject",
        body: expectedPlainBody,
        options: expect.objectContaining({
          attachments: undefined,
          bcc: undefined,
          cc: undefined,
        }),
      });
    });

    it("should use provided recipients for reply-all instead of from address", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      const replyAllRecipients = "sender@example.com, other@example.com";
      await service.sendReply(userId, emailId, "Reply body", {
        recipients: replyAllRecipients,
        cc: "cc@example.com",
      });

      const dateStr = email.receivedAt.toUTCString();
      const expectedPlainBody = `Reply body\n\nOn ${dateStr}, ${email.from} wrote:\n> Test body\n\nSent from BearlyMail (anti inbox overwhelm system)`;

      expect(mockProvider.sendReply).toHaveBeenCalledWith(userId, {
        threadId: email.threadId,
        to: replyAllRecipients,
        subject: "Re: Test Subject",
        body: expectedPlainBody,
        options: expect.objectContaining({
          attachments: undefined,
          bcc: undefined,
          cc: "cc@example.com",
        }),
      });
    });

    it("should fall back to from address when recipients is empty", async () => {
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.sendReply(userId, emailId, "Reply body", {
        recipients: "",
      });

      const dateStr = email.receivedAt.toUTCString();
      const expectedPlainBody = `Reply body\n\nOn ${dateStr}, ${email.from} wrote:\n> Test body\n\nSent from BearlyMail (anti inbox overwhelm system)`;

      expect(mockProvider.sendReply).toHaveBeenCalledWith(userId, {
        threadId: email.threadId,
        to: email.from,
        subject: "Re: Test Subject",
        body: expectedPlainBody,
        options: expect.objectContaining({
          attachments: undefined,
          bcc: undefined,
          cc: undefined,
        }),
      });
    });

    it("should sync star to provider when expectedReplyHours is set (follow-up triage→follow-up fix)", async () => {
      // Regression test: when a user replies to a triage email and sets "follow up in 48hrs",
      // the star must be synced to Gmail immediately. Without this, Gmail still shows the
      // thread as unstarred, so the next email sync resets starCount back to 0 and the
      // thread falls out of Follow-Up mode.
      const syncStarStatusToGmail = jest.fn().mockResolvedValue(undefined);
      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
        syncStarStatusToGmail,
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      const snoozeService = module.get(SnoozeService);
      const followUpsService = module.get(FollowUpsService);
      const emailThreadService = module.get(EmailThreadService);
      (snoozeService.snoozeEmail as jest.Mock).mockResolvedValue(undefined);
      (followUpsService.createFollowUp as jest.Mock).mockResolvedValue(
        undefined,
      );
      (emailThreadService.updateThreadStarCount as jest.Mock).mockResolvedValue(
        undefined,
      );

      await service.sendReply(userId, emailId, "Reply body", {
        expectedReplyHours: 48,
      });

      // Verify star was synced to provider with starCount=1 (STAR_COUNTS.LOW)
      expect(syncStarStatusToGmail).toHaveBeenCalledWith(
        userId,
        email.threadId,
        // STAR_COUNTS.LOW
        1,
      );
    });

    describe("archive-on-no-follow-up (issue #2125)", () => {
      // When the user replies without a follow-up duration, the thread must
      // be archived. Otherwise it stays starred + sent-last and re-qualifies
      // for Follow-Up mode via the implicit "starred + sent-last" rule.
      it("archives the thread when no expectedReplyHours is provided", async () => {
        const mockProvider = {
          sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
        };
        emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

        await service.sendReply(userId, emailId, "Reply body");

        expect(emailsService.archiveEmail).toHaveBeenCalledWith(
          userId,
          emailId,
        );
      });

      it("archives the thread when expectedReplyHours is 0", async () => {
        const mockProvider = {
          sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
        };
        emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

        await service.sendReply(userId, emailId, "Reply body", {
          expectedReplyHours: 0,
        });

        expect(emailsService.archiveEmail).toHaveBeenCalledWith(
          userId,
          emailId,
        );
      });

      it("does NOT archive when keepInAction is true", async () => {
        const mockProvider = {
          sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
        };
        emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

        await service.sendReply(userId, emailId, "Reply body", {
          keepInAction: true,
        });

        expect(emailsService.archiveEmail).not.toHaveBeenCalled();
      });

      it("does NOT archive when expectedReplyHours > 0 (follow-up scheduled)", async () => {
        const mockProvider = {
          sendReply: jest.fn().mockResolvedValue({ messageId: "sent-msg-1" }),
          syncStarStatusToGmail: jest.fn().mockResolvedValue(undefined),
        };
        emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);
        const snoozeService = module.get(SnoozeService);
        const followUpsService = module.get(FollowUpsService);
        const emailThreadService = module.get(EmailThreadService);
        (snoozeService.snoozeEmail as jest.Mock).mockResolvedValue(undefined);
        (followUpsService.createFollowUp as jest.Mock).mockResolvedValue(
          undefined,
        );
        (
          emailThreadService.updateThreadStarCount as jest.Mock
        ).mockResolvedValue(undefined);

        await service.sendReply(userId, emailId, "Reply body", {
          expectedReplyHours: 48,
        });

        expect(emailsService.archiveEmail).not.toHaveBeenCalled();
      });
    });
  });

  describe("quoted reply body (buildReplyQuotedBody / buildReplyQuotedHtmlBody)", () => {
    const userId = "user1";
    const emailId = "email1";
    let usersService: jest.Mocked<UsersService>;
    let emailRepository: Record<string, unknown>;
    let emailThreadRepository: Record<string, unknown>;
    let writingStyleLearningService: Record<string, unknown>;

    beforeEach(() => {
      usersService = module.get(UsersService);
      emailRepository = module.get(getRepositoryToken(Email));
      emailThreadRepository = module.get(getRepositoryToken(EmailThread));
      writingStyleLearningService = module.get(WritingStyleLearningService);
      usersService.findOne.mockResolvedValue(
        mockPartial({
          id: userId,
          email: "encrypted_user@example.com",
          name: "Test User",
          emailSignature: null,
        }),
      );
      emailRepository.create.mockReturnValue({});
      emailRepository.save.mockResolvedValue({});
      emailThreadRepository.findOne.mockResolvedValue({ id: "thread-uuid" });
      writingStyleLearningService.learnFromSentEmailBodies.mockResolvedValue(
        undefined,
      );
    });

    it("should append quoted original body to plain-text reply", async () => {
      const receivedAt = new Date("2024-03-01T12:00:00Z");
      const originalEmail = {
        id: emailId,
        userId,
        subject: "Hello there",
        body: "Original message line 1\nOriginal message line 2",
        htmlBody: null,
        from: "alice@example.com",
        fromName: "Alice",
        threadId: "thread-abc",
        receivedAt,
      };
      emailsService.getEmailById.mockResolvedValue(originalEmail);

      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "msg-quoted-1" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.sendReply(userId, emailId, "My reply");

      const dateStr = receivedAt.toUTCString();
      const callBody: string = mockProvider.sendReply.mock.calls[0][1]
        .body as string;
      expect(callBody).toContain("My reply");
      expect(callBody).toContain(
        `On ${dateStr}, Alice <alice@example.com> wrote:`,
      );
      expect(callBody).toContain("> Original message line 1");
      expect(callBody).toContain("> Original message line 2");
    });

    it("should append quoted HTML body to HTML reply when htmlBody is available", async () => {
      const receivedAt = new Date("2024-03-01T12:00:00Z");
      const originalEmail = {
        id: emailId,
        userId,
        subject: "Hello",
        body: "Plain fallback",
        htmlBody: "<p>Rich content</p>",
        from: "bob@example.com",
        fromName: null,
        threadId: "thread-def",
        receivedAt,
      };
      emailsService.getEmailById.mockResolvedValue(originalEmail);

      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "msg-quoted-2" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await service.sendReply(userId, emailId, "My reply");

      const htmlBody: string = mockProvider.sendReply.mock.calls[0][1].options
        .htmlBody as string;
      expect(htmlBody).toContain("My reply");
      expect(htmlBody).toContain("<blockquote");
      expect(htmlBody).toContain("<p>Rich content</p>");
      expect(htmlBody).toContain("bob@example.com");
    });

    it("should handle gracefully when original email has no body", async () => {
      const receivedAt = new Date("2024-03-01T12:00:00Z");
      const originalEmail = {
        id: emailId,
        userId,
        subject: "Empty",
        body: null,
        htmlBody: null,
        from: "carol@example.com",
        fromName: "Carol",
        threadId: "thread-ghi",
        receivedAt,
      };
      emailsService.getEmailById.mockResolvedValue(originalEmail);

      const mockProvider = {
        sendReply: jest.fn().mockResolvedValue({ messageId: "msg-quoted-3" }),
      };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(mockProvider);

      await expect(
        service.sendReply(userId, emailId, "My reply"),
      ).resolves.not.toThrow();

      const callBody: string = mockProvider.sendReply.mock.calls[0][1]
        .body as string;
      expect(callBody).toContain("My reply");
      // No attribution line should be rendered when original body is null
      expect(callBody).not.toContain("wrote:");
      expect(callBody).not.toContain("On ");
    });
  });
});
