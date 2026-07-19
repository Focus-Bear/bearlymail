import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Email } from "../database/entities/email.entity";
import { AiCapacityGuard } from "../subscriptions/ai-capacity.guard";
import { UsersService } from "../users/users.service";
import { LLMController } from "./llm.controller";
import { LLMService } from "./llm.service";

describe("LLMController (Integration)", () => {
  let app: INestApplication;

  const mockUser = {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    displayName: "Test User",
    jobTitle: "Engineer",
    toneSettings: {
      rules: ["Be professional", "Keep it concise"],
    },
    openAiApiKey: null,
  };

  const mockLLMService = {
    getAvailableProviders: jest.fn().mockReturnValue(["openai", "gemini"]),
    getDefaultProvider: jest.fn().mockReturnValue("openai"),
    checkTone: jest.fn().mockResolvedValue({
      isOk: true,
      suggestions: [],
      revisedText: undefined,
    }),
    extractActionItems: jest.fn().mockResolvedValue([
      {
        action: "Review the document",
        assignedTo: "You",
        deadline: "2026-02-15",
      },
    ]),
    generateReplyOptions: jest.fn().mockResolvedValue([
      {
        text: "Thanks for your email. I'll review this.",
        tone: "professional",
      },
      {
        text: "Thank you! I'll take a look at this soon.",
        tone: "friendly",
      },
    ]),
    disputeToneCheck: jest.fn().mockResolvedValue({
      accepted: false,
      explanation: "The suggestion is valid",
      rulesToRemove: [],
    }),
    askAboutEmail: jest.fn().mockResolvedValue("The deadline is Friday."),
  };

  const mockUsersService = {
    findOne: jest.fn().mockResolvedValue(mockUser),
    update: jest.fn().mockResolvedValue({ ...mockUser }),
  };

  const mockEmailRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockEmailRepository.findOne.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LLMController],
      providers: [
        { provide: LLMService, useValue: mockLLMService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn((context) => {
          const request = context.switchToHttp().getRequest();
          request.user = { userId: "test-user-id" };
          return true;
        }),
      })
      .overrideGuard(AiCapacityGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /llm/providers", () => {
    it("should return available LLM providers", async () => {
      const response = await request(app.getHttpServer())
        .get("/llm/providers")
        .expect(200);

      expect(response.body).toHaveProperty("available");
      expect(response.body).toHaveProperty("default");
      expect(Array.isArray(response.body.available)).toBe(true);
      expect(response.body.available).toContain("openai");
    });
  });

  describe("POST /llm/check-tone", () => {
    it("should check tone of text with user rules", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Hey! What's up?",
          rules: ["Be professional", "Avoid slang"],
        })
        .expect(201);

      expect(response.body).toHaveProperty("isOk");
      expect(response.body).toHaveProperty("suggestions");
      expect(mockLLMService.checkTone).toHaveBeenCalledWith({
        text: "Hey! What's up?",
        rules: ["Be professional", "Avoid slang"],
        userId: "test-user-id",
        scheduledSendAt: null,
        currentTime: null,
      });
    });

    it("should use user tone settings when rules not provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test email",
        })
        .expect(201);

      expect(response.body).toHaveProperty("isOk");
      expect(mockUsersService.findOne).toHaveBeenCalledWith("test-user-id");
      expect(mockLLMService.checkTone).toHaveBeenCalledWith({
        text: "Test email",
        rules: ["Be professional", "Keep it concise"],
        userId: "test-user-id",
        scheduledSendAt: null,
        currentTime: null,
      });
    });

    it("should return isOk: true when user has no tone settings", async () => {
      mockUsersService.findOne.mockResolvedValueOnce({
        ...mockUser,
        toneSettings: { rules: [] },
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test email",
        })
        .expect(201);

      expect(response.body).toEqual({
        isOk: true,
        suggestions: [],
        inappropriateTiming: null,
      });
      // Should not call checkTone service when no rules
      expect(mockLLMService.checkTone).not.toHaveBeenCalled();
    });

    it("should pass scheduledSendAt to checkTone service", async () => {
      const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();

      await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test email",
          rules: ["Be professional"],
          scheduledSendAt: scheduledTime,
        })
        .expect(201);

      expect(mockLLMService.checkTone).toHaveBeenCalledWith({
        text: "Test email",
        rules: ["Be professional"],
        userId: "test-user-id",
        scheduledSendAt: scheduledTime,
        currentTime: null,
      });
    });

    it("should pass currentTime to checkTone service for immediate-send timing checks", async () => {
      const currentTime = new Date().toISOString();

      await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test email",
          rules: ["Be professional"],
          currentTime,
        })
        .expect(201);

      expect(mockLLMService.checkTone).toHaveBeenCalledWith({
        text: "Test email",
        rules: ["Be professional"],
        userId: "test-user-id",
        scheduledSendAt: null,
        currentTime,
      });
    });

    it("should pass both currentTime and scheduledSendAt to checkTone service", async () => {
      const currentTime = new Date().toISOString();
      const scheduledTime = new Date(Date.now() + 3600 * 1000).toISOString();

      await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Scheduled email",
          rules: ["Be professional"],
          currentTime,
          scheduledSendAt: scheduledTime,
        })
        .expect(201);

      expect(mockLLMService.checkTone).toHaveBeenCalledWith({
        text: "Scheduled email",
        rules: ["Be professional"],
        userId: "test-user-id",
        scheduledSendAt: scheduledTime,
        currentTime,
      });
    });

    it("should suppress low-significance results", async () => {
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "low",
        suggestions: ["Consider using more formal language"],
        revisedText: "Dear colleague,",
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Hey there!",
          rules: ["Be professional"],
        })
        .expect(201);

      expect(response.body).toEqual({
        isOk: true,
        suggestions: [],
        attachmentReminder: null,
        inappropriateTiming: null,
      });
    });

    it("should not suppress medium-significance results", async () => {
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "medium",
        suggestions: ["Tone is too casual"],
        revisedText: undefined,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Hey!",
          rules: ["Be professional"],
        })
        .expect(201);

      expect(response.body.isOk).toBe(false);
      expect(response.body.suggestions).toEqual(["Tone is too casual"]);
    });

    it("should return inappropriateTiming field from LLM response", async () => {
      const futureTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: true,
        significance: "high",
        suggestions: [],
        revisedText: undefined,
        inappropriateTiming:
          "Consider sending Monday morning at 08:00 instead of Saturday evening",
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Hi! Quick question...",
          rules: ["Be professional"],
          scheduledSendAt: futureTime,
        })
        .expect(201);

      expect(response.body.inappropriateTiming).toBe(
        "Consider sending Monday morning at 08:00 instead of Saturday evening",
      );
    });

    it("should preserve inappropriateTiming even for low-significance results", async () => {
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "low",
        suggestions: ["Minor phrasing tweak"],
        revisedText: "Dear colleague,",
        inappropriateTiming: "Avoid sending on weekends",
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Hey there!",
          rules: ["Be professional"],
        })
        .expect(201);

      // Low significance suppresses isOk/suggestions, but inappropriateTiming is preserved
      expect(response.body.isOk).toBe(true);
      expect(response.body.suggestions).toEqual([]);
      expect(response.body.inappropriateTiming).toBe(
        "Avoid sending on weekends",
      );
    });

    it("should not filter suggestions when scheduledSendAt is in the past", async () => {
      const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "high",
        suggestions: ["Avoid sending emails late at night"],
        revisedText: undefined,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test",
          rules: ["Be professional"],
          scheduledSendAt: pastTime,
        })
        .expect(201);

      // Past scheduledSendAt → no filtering
      expect(response.body.suggestions).toEqual([
        "Avoid sending emails late at night",
      ]);
    });

    it("should not filter suggestions when scheduledSendAt is invalid", async () => {
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "high",
        suggestions: ["Avoid sending emails on weekends"],
        revisedText: undefined,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test",
          rules: ["Be professional"],
          scheduledSendAt: "not-a-date",
        })
        .expect(201);

      expect(response.body.suggestions).toEqual([
        "Avoid sending emails on weekends",
      ]);
    });

    it("should return result unchanged when no timing suggestions match keywords", async () => {
      const futureTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      mockLLMService.checkTone.mockResolvedValueOnce({
        isOk: false,
        significance: "high",
        suggestions: ["Be more concise", "Avoid passive voice"],
        revisedText: undefined,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/check-tone")
        .send({
          text: "Test email content",
          rules: ["Be professional"],
          scheduledSendAt: futureTime,
        })
        .expect(201);

      // Non-timing suggestions should not be filtered
      expect(response.body.suggestions).toEqual([
        "Be more concise",
        "Avoid passive voice",
      ]);
      expect(response.body.isOk).toBe(false);
    });
  });

  describe("POST /llm/extract-actions", () => {
    it("should extract action items from email body", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please review the document by Friday and send feedback.",
          senderInfo: {
            from: "sender@example.com",
            fromName: "Sender Name",
          },
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(mockLLMService.extractActionItems).toHaveBeenCalled();
      expect(mockUsersService.findOne).toHaveBeenCalledWith("test-user-id");
    });

    it("should handle missing sender info", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please complete the task.",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith({
        emailBody: "Please complete the task.",
        subject: undefined,
        userId: "test-user-id",
        senderInfo: undefined,
        recipientInfo: {
          name: "Test User",
          email: "test@example.com",
        },
        isUserSender: false,
        existingActions: [],
        userName: "Test User",
      });
    });

    it("should detect if user is sender", async () => {
      await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "I will complete this task.",
          senderInfo: {
            from: "test@example.com",
            fromName: "Test User",
          },
        })
        .expect(201);

      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith({
        emailBody: "I will complete this task.",
        subject: undefined,
        userId: "test-user-id",
        senderInfo: {
          from: "test@example.com",
          fromName: "Test User",
        },
        recipientInfo: {
          name: "Test User",
          email: "test@example.com",
        },
        // isUserSender should be true
        isUserSender: true,
        existingActions: [],
        userName: "Test User",
      });
    });

    it("should forward existingActions to service for deduplication", async () => {
      const existingActions = ["Follow up with John", "Send report by Friday"];
      await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please schedule a call.",
          existingActions,
        })
        .expect(201);

      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith({
        emailBody: "Please schedule a call.",
        subject: undefined,
        userId: "test-user-id",
        senderInfo: undefined,
        recipientInfo: {
          name: "Test User",
          email: "test@example.com",
        },
        isUserSender: false,
        existingActions,
        userName: "Test User",
      });
    });

    it("should treat email as user-sent when isSentEmail flag is true", async () => {
      await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "I will complete this task.",
          senderInfo: {
            from: "alias@otherdomain.com",
            fromName: "Test User",
          },
          isSentEmail: true,
        })
        .expect(201);

      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith({
        emailBody: "I will complete this task.",
        subject: undefined,
        userId: "test-user-id",
        senderInfo: {
          from: "alias@otherdomain.com",
          fromName: "Test User",
        },
        recipientInfo: {
          name: "Test User",
          email: "test@example.com",
        },
        // isUserSender should be true because isSentEmail=true, even though emails don't match
        isUserSender: true,
        existingActions: [],
        userName: "Test User",
      });
    });

    it("should return cached actionItemsJson when emailId is provided and cache is populated", async () => {
      const cachedItems = [
        {
          description: "Review the document",
          isCompleted: false,
          source: "llm",
        },
      ];
      mockEmailRepository.findOne.mockResolvedValueOnce({
        id: "email-1",
        actionItemsJson: cachedItems,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please review the document.",
          emailId: "email-1",
        })
        .expect(201);

      expect(response.body).toEqual(cachedItems);
      // LLM should NOT be called when cache hit
      expect(mockLLMService.extractActionItems).not.toHaveBeenCalled();
      expect(mockEmailRepository.findOne).toHaveBeenCalledWith({
        where: { id: "email-1", userId: "test-user-id" },
        select: { id: true, actionItemsJson: true },
      });
    });

    it("should fall through to LLM when emailId provided but actionItemsJson is null", async () => {
      mockEmailRepository.findOne.mockResolvedValueOnce({
        id: "email-2",
        actionItemsJson: null,
      });

      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please complete the task.",
          emailId: "email-2",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      // Cache miss — LLM should be called
      expect(mockLLMService.extractActionItems).toHaveBeenCalled();
    });

    it("should fall through to LLM when no emailId is provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please schedule a meeting.",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(mockLLMService.extractActionItems).toHaveBeenCalled();
      // Repository should not be queried when no emailId
      expect(mockEmailRepository.findOne).not.toHaveBeenCalled();
    });
    it("should treat email as user-sent when isSentEmail hint is true (alias mismatch)", async () => {
      // Sender email does NOT match user email (alias scenario)
      await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "I will follow up with the team tomorrow.",
          senderInfo: {
            from: "alias@otherdomain.com",
            fromName: "Test User Alias",
          },
          isSentEmail: true,
        })
        .expect(201);

      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith({
        emailBody: "I will follow up with the team tomorrow.",
        subject: undefined,
        userId: "test-user-id",
        senderInfo: {
          from: "alias@otherdomain.com",
          fromName: "Test User Alias",
        },
        recipientInfo: {
          name: "Test User",
          email: "test@example.com",
        },
        // isUserSender should be true because isSentEmail hint overrides alias mismatch
        isUserSender: true,
        existingActions: [],
        userName: "Test User",
      });
    });
  });

  describe("POST /llm/suggest-replies", () => {
    it("should generate reply suggestions", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/suggest-replies")
        .send({
          originalEmail: {
            from: "sender@example.com",
            fromName: "Sender",
            subject: "Meeting Request",
            body: "Can we meet next week?",
          },
          context: {
            tone: "professional",
            writingStyle: "concise",
          },
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(mockLLMService.generateReplyOptions).toHaveBeenCalled();
      expect(mockUsersService.findOne).toHaveBeenCalledWith("test-user-id");
    });

    it("should use default tone when not provided", async () => {
      await request(app.getHttpServer())
        .post("/llm/suggest-replies")
        .send({
          originalEmail: {
            from: "sender@example.com",
            subject: "Test",
            body: "Test email",
          },
        })
        .expect(201);

      const callArgs = mockLLMService.generateReplyOptions.mock.calls[0];
      expect(callArgs[1].tone).toBe("professional");
    });

    it("should include user context in reply generation", async () => {
      await request(app.getHttpServer())
        .post("/llm/suggest-replies")
        .send({
          originalEmail: {
            from: "sender@example.com",
            subject: "Test",
            body: "Test email",
          },
        })
        .expect(201);

      const callArgs = mockLLMService.generateReplyOptions.mock.calls[0];
      expect(callArgs[1]).toHaveProperty("userName", "Test User");
      expect(callArgs[1]).toHaveProperty("userJobTitle", "Engineer");
    });
  });

  describe("POST /llm/dispute-tone-check", () => {
    it("should process tone check dispute", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/dispute-tone-check")
        .send({
          emailText: "Hey there!",
          suggestions: ["Use more formal greeting"],
          userArgument: "This is appropriate for the recipient",
        })
        .expect(201);

      expect(response.body).toHaveProperty("accepted");
      expect(response.body).toHaveProperty("explanation");
      expect(response.body).toHaveProperty("rulesUpdated");
      expect(mockLLMService.disputeToneCheck).toHaveBeenCalled();
    });

    it("should update user tone settings when dispute is accepted", async () => {
      mockLLMService.disputeToneCheck.mockResolvedValueOnce({
        accepted: true,
        explanation: "You're right, this is appropriate",
        rulesToRemove: ["Be professional"],
      });

      const response = await request(app.getHttpServer())
        .post("/llm/dispute-tone-check")
        .send({
          emailText: "Hey!",
          suggestions: ["Be more professional"],
          userArgument: "This is fine",
        })
        .expect(201);

      expect(response.body.accepted).toBe(true);
      expect(response.body.rulesUpdated).toBe(true);
      expect(mockUsersService.update).toHaveBeenCalledWith("test-user-id", {
        toneSettings: { rules: ["Keep it concise"] },
      });
    });

    it("should not update settings when dispute is rejected", async () => {
      mockLLMService.disputeToneCheck.mockResolvedValueOnce({
        accepted: false,
        explanation: "The suggestion is valid",
        rulesToRemove: [],
      });

      const response = await request(app.getHttpServer())
        .post("/llm/dispute-tone-check")
        .send({
          emailText: "Test",
          suggestions: ["Test suggestion"],
          userArgument: "I disagree",
        })
        .expect(201);

      expect(response.body.accepted).toBe(false);
      expect(response.body.rulesUpdated).toBe(false);
      expect(mockUsersService.update).not.toHaveBeenCalled();
    });
  });

  // NOTE: POST /llm/ask-email moved to AskAiController (agentic Ask AI).
  // Its behaviour is covered by the ask-ai/* unit tests.
});

// Additional test added to cover isSentEmail hint path (alias mismatch scenario)
// This was missing coverage for the `body.isSentEmail === true` branch
