import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { LLMController } from "./llm.controller";
import { LLMService } from "./llm.service";
import { UsersService } from "../users/users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

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
      { text: "Thanks for your email. I'll review this.", tone: "professional" },
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
    usersService: {
      findOne: jest.fn().mockResolvedValue(mockUser),
    },
  };

  const mockUsersService = {
    findOne: jest.fn().mockResolvedValue(mockUser),
    update: jest.fn().mockResolvedValue({ ...mockUser }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LLMController],
      providers: [
        { provide: LLMService, useValue: mockLLMService },
        { provide: UsersService, useValue: mockUsersService },
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
      expect(mockLLMService.checkTone).toHaveBeenCalledWith(
        "Hey! What's up?",
        ["Be professional", "Avoid slang"],
        undefined,
        "test-user-id",
      );
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
      expect(mockLLMService.checkTone).toHaveBeenCalledWith(
        "Test email",
        ["Be professional", "Keep it concise"],
        undefined,
        "test-user-id",
      );
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
        revisedText: undefined,
      });
      // Should not call checkTone service when no rules
      expect(mockLLMService.checkTone).not.toHaveBeenCalled();
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
    });

    it("should handle missing sender info", async () => {
      const response = await request(app.getHttpServer())
        .post("/llm/extract-actions")
        .send({
          emailBody: "Please complete the task.",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith(
        "Please complete the task.",
        undefined,
        "test-user-id",
        undefined,
        {
          name: "Test User",
          email: "test@example.com",
        },
        false,
      );
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

      expect(mockLLMService.extractActionItems).toHaveBeenCalledWith(
        "I will complete this task.",
        undefined,
        "test-user-id",
        {
          from: "test@example.com",
          fromName: "Test User",
        },
        {
          name: "Test User",
          email: "test@example.com",
        },
        true, // isUserSender should be true
      );
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
});
