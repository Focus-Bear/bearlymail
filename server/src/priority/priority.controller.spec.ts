import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "../emails/emails.service";
import { encryptionKeyProvider } from "../encryption/encryption-key-provider";
import { PriorityController } from "./priority.controller";
import { PriorityService } from "./priority.service";
import { PriorityLearningService } from "./priority-learning.service";
import { TriageSuggestionsService } from "./triage-suggestions.service";

describe("PriorityController", () => {
  beforeAll(() => {
    if (!encryptionKeyProvider.isInitialized()) {
      process.env.ENCRYPTION_KEY = "test-encryption-key-32chars!!!!!";
      encryptionKeyProvider.initialize();
    }
  });

  let controller: PriorityController;
  let triageSuggestionsService: TriageSuggestionsService;
  let priorityService: PriorityService;
  let priorityLearningService: PriorityLearningService;
  let emailsService: EmailsService;
  let emailThreadRepository: Repository<EmailThread>;

  const mockTriageSuggestionsService = {
    generateSuggestions: jest.fn(),
    trackOverride: jest.fn(),
  };

  const mockPriorityService = {
    getUserContexts: jest.fn(),
    calculatePriorityWithExplanation: jest.fn(),
    applyUserOverride: jest.fn(),
  };

  const mockPriorityLearningService = {
    storeStarFeedback: jest.fn(),
    processOverrideReason: jest.fn(),
    learnFromUrgencyOverride: jest.fn(),
    learnFromPriorityFeedback: jest.fn(),
  };

  const mockEmailsService = {
    getEmailById: jest.fn(),
    getThreadEmails: jest.fn(),
  };

  const mockEmailThreadRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PriorityController],
      providers: [
        {
          provide: TriageSuggestionsService,
          useValue: mockTriageSuggestionsService,
        },
        {
          provide: PriorityService,
          useValue: mockPriorityService,
        },
        {
          provide: PriorityLearningService,
          useValue: mockPriorityLearningService,
        },
        {
          provide: EmailsService,
          useValue: mockEmailsService,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
      ],
    }).compile();

    controller = module.get<PriorityController>(PriorityController);
    triageSuggestionsService = module.get<TriageSuggestionsService>(
      TriageSuggestionsService,
    );
    priorityService = module.get<PriorityService>(PriorityService);
    priorityLearningService = module.get<PriorityLearningService>(
      PriorityLearningService,
    );
    emailsService = module.get<EmailsService>(EmailsService);
    emailThreadRepository = module.get<Repository<EmailThread>>(
      getRepositoryToken(EmailThread),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getTriageSuggestions", () => {
    it("should return triage suggestions", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = { emailIds: ["email-1", "email-2"] };
      const mockSuggestions = [
        { emailId: "email-1", suggestedStarCount: 2 },
        { emailId: "email-2", suggestedStarCount: 1 },
      ];

      mockTriageSuggestionsService.generateSuggestions.mockResolvedValue(
        mockSuggestions,
      );

      const result = await controller.getTriageSuggestions(mockRequest, body);

      expect(result).toEqual(mockSuggestions);
      expect(triageSuggestionsService.generateSuggestions).toHaveBeenCalledWith(
        userId,
        body.emailIds,
      );
    });
  });

  describe("trackOverride", () => {
    it("should track override", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        emailId: "email-1",
        suggestion: {
          emailId: "email-1",
          suggestedStarCount: 2,
          suggestedArchive: false,
          confidence: 80,
          reasoning: "Test suggestion",
        },
        userAction: { starCount: 3, archived: false },
      };

      mockTriageSuggestionsService.trackOverride.mockResolvedValue(undefined);

      const result = await controller.trackOverride(mockRequest, body);

      expect(result).toEqual({ message: "Override tracked" });
      expect(triageSuggestionsService.trackOverride).toHaveBeenCalledWith(
        userId,
        body.emailId,
        body.suggestion,
        body.userAction,
      );
    });
  });

  describe("getPriorityExplanation", () => {
    it("should return priority explanation", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const mockEmail = { id: emailId, subject: "Test" };
      const mockContexts = [
        { contextKey: "VIP_CONTACT", contextValue: "test" },
      ];
      const mockExplanation = {
        score: 75,
        factors: [
          { type: "VIP_CONTACT", description: "From VIP", contribution: 25 },
        ],
      };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockPriorityService.getUserContexts.mockResolvedValue(mockContexts);
      mockPriorityService.calculatePriorityWithExplanation.mockReturnValue(
        mockExplanation,
      );

      const result = await controller.getPriorityExplanation(
        mockRequest,
        emailId,
      );

      expect(result).toEqual(mockExplanation);
      expect(emailsService.getEmailById).toHaveBeenCalledWith(userId, emailId);
      expect(priorityService.getUserContexts).toHaveBeenCalledWith(userId);
      expect(
        priorityService.calculatePriorityWithExplanation,
      ).toHaveBeenCalledWith(mockEmail, mockContexts);
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(
        controller.getPriorityExplanation(mockRequest, emailId),
      ).rejects.toThrow("Email not found");
    });
  });

  describe("storeStarFeedback", () => {
    it("should store star feedback", async () => {
      const userId = "user-123";
      const mockRequest = { user: { userId } };
      const body = {
        emailId: "email-1",
        userStarCount: 3,
        predictedStarCount: 2,
        explanation: "User feedback",
      };

      mockPriorityLearningService.storeStarFeedback.mockResolvedValue(
        undefined,
      );

      const result = await controller.storeStarFeedback(mockRequest, body);

      expect(result).toEqual({ message: "Feedback stored successfully" });
      expect(priorityLearningService.storeStarFeedback).toHaveBeenCalledWith(
        userId,
        body.emailId,
        body.userStarCount,
        body.predictedStarCount,
        body.explanation,
      );
    });
  });

  describe("setPriorityOverride", () => {
    it("should set priority override", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        priorityScore: 85,
        reasonType: "manual",
        reasonText: "Important email",
      };
      const mockEmail = { id: emailId, subject: "Test" };

      mockPriorityService.applyUserOverride.mockResolvedValue(undefined);
      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockPriorityLearningService.processOverrideReason.mockResolvedValue(
        undefined,
      );

      const result = await controller.setPriorityOverride(
        mockRequest,
        emailId,
        body,
      );

      expect(result).toEqual({
        message: "Priority override applied successfully",
      });
      expect(priorityService.applyUserOverride).toHaveBeenCalledWith(
        userId,
        emailId,
        body.priorityScore,
        body.reasonType,
        body.reasonText,
      );
      expect(
        priorityLearningService.processOverrideReason,
      ).toHaveBeenCalledWith(
        userId,
        mockEmail,
        body.reasonType,
        body.reasonText,
      );
    });

    it("should set priority override without reason", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        priorityScore: 85,
      };

      mockPriorityService.applyUserOverride.mockResolvedValue(undefined);

      const result = await controller.setPriorityOverride(
        mockRequest,
        emailId,
        body,
      );

      expect(result).toEqual({
        message: "Priority override applied successfully",
      });
      expect(
        priorityLearningService.processOverrideReason,
      ).not.toHaveBeenCalled();
    });
  });

  describe("overrideUrgency", () => {
    it("should override urgency for thread", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const mockRequest = { user: { userId } };
      const body = {
        urgencyScore: 90,
        reason: "Urgent matter",
      };
      const mockThread = {
        id: threadId,
        userId,
        threadId: "gmail-thread-123",
        urgencyScore: null,
        urgencyOverrideReason: null,
      };
      const mockEmails = [{ id: "email-1" }];

      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockEmailsService.getThreadEmails.mockResolvedValue(mockEmails);
      mockEmailThreadRepository.save.mockResolvedValue(mockThread);
      mockPriorityLearningService.learnFromUrgencyOverride.mockResolvedValue(
        undefined,
      );

      const result = await controller.overrideUrgency(
        mockRequest,
        threadId,
        body,
      );

      expect(result).toEqual({
        message: "Urgency override applied successfully",
      });
      expect(emailThreadRepository.findOne).toHaveBeenCalledWith({
        where: { id: threadId, userId },
      });
      expect(emailThreadRepository.save).toHaveBeenCalled();
      expect(
        priorityLearningService.learnFromUrgencyOverride,
      ).toHaveBeenCalledWith(
        userId,
        mockEmails[0],
        body.urgencyScore,
        body.reason,
      );
    });

    it("should throw error when thread not found", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const mockRequest = { user: { userId } };
      const body = {
        urgencyScore: 90,
        reason: "Urgent",
      };

      mockEmailThreadRepository.findOne.mockResolvedValue(null);

      await expect(
        controller.overrideUrgency(mockRequest, threadId, body),
      ).rejects.toThrow("Thread not found");
    });

    it("should clamp urgency score to 0-100", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const mockRequest = { user: { userId } };
      const body = {
        // Over 100
        urgencyScore: 150,
        reason: "Test",
      };
      const mockThread = {
        id: threadId,
        userId,
        threadId: "gmail-thread-123",
      };
      const mockEmails = [{ id: "email-1" }];

      mockEmailThreadRepository.findOne.mockResolvedValue(mockThread);
      mockEmailsService.getThreadEmails.mockResolvedValue(mockEmails);
      mockEmailThreadRepository.save.mockResolvedValue(mockThread);

      await controller.overrideUrgency(mockRequest, threadId, body);

      expect(mockEmailThreadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          // Clamped to 100
          urgencyScore: 100,
        }),
      );
    });
  });

  describe("providePriorityFeedback", () => {
    it("should process priority feedback", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        feedback: "This should be higher priority",
        expectedPriority: 80,
      };
      const mockEmail = { id: emailId, subject: "Test" };

      mockEmailsService.getEmailById.mockResolvedValue(mockEmail);
      mockPriorityLearningService.learnFromPriorityFeedback.mockResolvedValue({
        updated: [],
      });

      const result = await controller.providePriorityFeedback(
        mockRequest,
        emailId,
        body,
      );

      expect(result).toEqual({
        message: "Feedback received and will be used to improve prioritization",
        contextUpdated: false,
        contextUpdates: [],
        summary: "No context updates were needed based on your feedback",
      });
      expect(
        priorityLearningService.learnFromPriorityFeedback,
      ).toHaveBeenCalledWith(
        userId,
        mockEmail,
        body.feedback,
        body.expectedPriority,
      );
    });

    it("should throw error when email not found", async () => {
      const userId = "user-123";
      const emailId = "email-123";
      const mockRequest = { user: { userId } };
      const body = {
        feedback: "Test feedback",
      };

      mockEmailsService.getEmailById.mockResolvedValue(null);

      await expect(
        controller.providePriorityFeedback(mockRequest, emailId, body),
      ).rejects.toThrow("Email not found");
    });
  });
});
