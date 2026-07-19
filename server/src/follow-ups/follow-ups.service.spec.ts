import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { ContextService } from "../context/context.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { EmailsService } from "../emails/emails.service";
import { LLMService } from "../llm/llm.service";
import { mockPartial } from "../test/helpers/mock-utils";
import { UsersService } from "../users/users.service";
import { FollowUpsService } from "./follow-ups.service";

jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    // Simple mock - returns as-is
    EncryptionHelper: {
      decrypt: jest.fn((encryptedValue: string) => encryptedValue),
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

describe("FollowUpsService", () => {
  let service: FollowUpsService;
  let followUpRepository: jest.Mocked<Repository<FollowUp>>;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let emailRepository: jest.Mocked<Repository<Email>>;
  let llmService: jest.Mocked<LLMService>;
  let usersService: jest.Mocked<UsersService>;
  let contextService: jest.Mocked<ContextService>;
  let emailsService: jest.Mocked<EmailsService>;
  let boss: jest.Mocked<PgBoss>;

  const mockFollowUp: FollowUp = {
    id: "follow-up-1",
    userId: "user-1",
    threadId: "thread-1",
    emailThreadId: "email-thread-1",
    status: FollowUpStatus.AWAITING_REPLY,
    followUpDueAt: new Date("2024-01-15"),
    followUpDays: 7,
    subject: "Test Subject",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as FollowUp;

  const mockEmailThread: EmailThread = {
    id: "email-thread-1",
    userId: "user-1",
    threadId: "thread-1",
  } as EmailThread;

  const mockEmail: Email = mockPartial({
    id: "email-1",
    userId: "user-1",
    threadId: "thread-1",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test Subject",
    body: "Test body",
    receivedAt: new Date("2024-01-01"),
    labels: [],
    getPriorityScore: jest.fn().mockReturnValue(50),
  });

  const mockUser = {
    id: "user-1",
    email: "user@example.com",
    googleCalendarAccessToken: "token",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        {
          provide: getRepositoryToken(FollowUp),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: LLMService,
          useValue: {
            generateFollowUpDraft: jest.fn(),
            generateText: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: ContextService,
          useValue: {
            getUserContext: jest.fn(),
          },
        },
        {
          provide: EmailsService,
          useValue: {
            getInbox: jest.fn(),
          },
        },
        {
          provide: "PG_BOSS",
          useValue: {
            send: jest.fn().mockResolvedValue({ id: "job-1" }),
          },
        },
      ],
    }).compile();

    service = module.get<FollowUpsService>(FollowUpsService);
    followUpRepository = module.get(getRepositoryToken(FollowUp));
    emailThreadRepository = module.get(getRepositoryToken(EmailThread));
    emailRepository = module.get(getRepositoryToken(Email));
    llmService = module.get(LLMService);
    usersService = module.get(UsersService);
    contextService = module.get(ContextService);
    emailsService = module.get(EmailsService);
    boss = module.get("PG_BOSS");
    jest.clearAllMocks();
  });

  describe("createFollowUp", () => {
    it("should create a follow-up with email context", async () => {
      emailThreadRepository.findOne.mockResolvedValue(mockEmailThread);
      emailRepository.find.mockResolvedValue([mockEmail]);
      usersService.findOne.mockResolvedValue(mockUser);
      followUpRepository.create.mockReturnValue(mockFollowUp as FollowUp);
      followUpRepository.save.mockResolvedValue(mockFollowUp);

      const result = await service.createFollowUp("user-1", "thread-1", 7);

      expect(emailThreadRepository.findOne).toHaveBeenCalledWith({
        where: { userId: "user-1", threadId: "thread-1" },
      });
      expect(emailRepository.find).toHaveBeenCalledWith({
        where: { userId: "user-1", threadId: "thread-1" },
        order: { receivedAt: "DESC" },
        take: 10,
      });
      expect(followUpRepository.create).toHaveBeenCalled();
      expect(followUpRepository.save).toHaveBeenCalled();
      expect(result).toEqual(mockFollowUp);
    });

    it("should handle missing email thread", async () => {
      const followUpWithoutThread = {
        ...mockFollowUp,
        emailThreadId: undefined,
      };
      emailThreadRepository.findOne.mockResolvedValue(null);
      emailRepository.find.mockResolvedValue([mockEmail]);
      usersService.findOne.mockResolvedValue(mockUser);
      followUpRepository.create.mockReturnValue(
        followUpWithoutThread as FollowUp,
      );
      followUpRepository.save.mockResolvedValue(followUpWithoutThread);

      const result = await service.createFollowUp("user-1", "thread-1", 7);

      expect(result.emailThreadId).toBeUndefined();
    });

    it("should calculate followUpDueAt correctly", async () => {
      emailThreadRepository.findOne.mockResolvedValue(mockEmailThread);
      emailRepository.find.mockResolvedValue([mockEmail]);
      usersService.findOne.mockResolvedValue(mockUser);
      followUpRepository.create.mockReturnValue(mockFollowUp as FollowUp);
      followUpRepository.save.mockResolvedValue(mockFollowUp);

      const beforeCreate = new Date();
      await service.createFollowUp("user-1", "thread-1", 7);
      const afterCreate = new Date();

      const createdCall = followUpRepository.create.mock.calls[0][0];
      const dueDate = new Date(createdCall.followUpDueAt as Date | string);
      const expectedMin = new Date(beforeCreate);
      expectedMin.setDate(expectedMin.getDate() + 7);
      const expectedMax = new Date(afterCreate);
      expectedMax.setDate(expectedMax.getDate() + 7);

      expect(dueDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
      expect(dueDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    });

    it("should capture last their reply and last my reply", async () => {
      const theirEmail = mockPartial({
        ...mockEmail,
        from: "them@example.com",
        labels: [],
        getPriorityScore: jest.fn().mockReturnValue(50),
      });
      const myEmail = mockPartial({
        ...mockEmail,
        id: "email-2",
        from: "user@example.com",
        labels: ["SENT"],
        getPriorityScore: jest.fn().mockReturnValue(50),
      });

      emailThreadRepository.findOne.mockResolvedValue(mockEmailThread);
      emailRepository.find.mockResolvedValue([theirEmail, myEmail]);
      usersService.findOne.mockResolvedValue(mockUser);
      followUpRepository.create.mockReturnValue(mockFollowUp as FollowUp);
      followUpRepository.save.mockResolvedValue(mockFollowUp);

      await service.createFollowUp("user-1", "thread-1", 7);

      const createdCall = followUpRepository.create.mock.calls[0][0];
      expect(createdCall.lastTheirReply).toBe(theirEmail.body);
      expect(createdCall.lastMyReply).toBe(myEmail.body);
    });
  });

  describe("getDueFollowUps", () => {
    it("should return follow-ups that are due", async () => {
      const dueFollowUp = {
        ...mockFollowUp,
        status: FollowUpStatus.FOLLOW_UP_DUE,
      };
      followUpRepository.find.mockResolvedValue([dueFollowUp]);

      const result = await service.getDueFollowUps("user-1");

      expect(followUpRepository.find).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          { userId: "user-1", status: FollowUpStatus.FOLLOW_UP_DUE },
          // LessThanOrEqual
          {
            userId: "user-1",
            status: FollowUpStatus.AWAITING_REPLY,
            followUpDueAt: expect.any(Object),
          },
        ]),
        order: { followUpDueAt: "ASC" },
      });
      expect(result).toEqual([dueFollowUp]);
    });

    it("should return empty array when no due follow-ups", async () => {
      followUpRepository.find.mockResolvedValue([]);

      const result = await service.getDueFollowUps("user-1");

      expect(result).toEqual([]);
    });
  });

  describe("getAwaitingReplyFollowUps", () => {
    it("should return all awaiting reply follow-ups", async () => {
      const awaitingFollowUp = {
        ...mockFollowUp,
        status: FollowUpStatus.AWAITING_REPLY,
      };
      followUpRepository.find.mockResolvedValue([awaitingFollowUp]);

      const result = await service.getAwaitingReplyFollowUps("user-1");

      expect(followUpRepository.find).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          status: FollowUpStatus.AWAITING_REPLY,
        },
        order: { followUpDueAt: "ASC" },
      });
      expect(result).toEqual([awaitingFollowUp]);
    });
  });

  describe("markAsReplied", () => {
    it("should update follow-up status to completed", async () => {
      followUpRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.markAsReplied("user-1", "thread-1");

      expect(followUpRepository.update).toHaveBeenCalledTimes(2);
      expect(followUpRepository.update).toHaveBeenCalledWith(
        {
          userId: "user-1",
          threadId: "thread-1",
          status: FollowUpStatus.AWAITING_REPLY,
        },
        { status: FollowUpStatus.COMPLETED },
      );
      expect(followUpRepository.update).toHaveBeenCalledWith(
        {
          userId: "user-1",
          threadId: "thread-1",
          status: FollowUpStatus.FOLLOW_UP_DUE,
        },
        { status: FollowUpStatus.COMPLETED },
      );
    });
  });

  describe("generateFollowUpDrafts", () => {
    it("should generate draft for due follow-ups", async () => {
      // Past due
      const dueFollowUp = {
        ...mockFollowUp,
        status: FollowUpStatus.AWAITING_REPLY,
        followUpDueAt: new Date(Date.now() - 1000),
        lastTheirReply: "Their reply",
        lastTheirReplyFrom: "them@example.com",
      };

      followUpRepository.find.mockResolvedValue([dueFollowUp]);
      llmService.generateFollowUpDraft.mockResolvedValue(
        "Generated draft text",
      );
      followUpRepository.save.mockResolvedValue({
        ...dueFollowUp,
        draftFollowUp: "Generated draft text",
        status: FollowUpStatus.FOLLOW_UP_DUE,
      });

      const result = await service.generateFollowUpDrafts("user-1");

      expect(llmService.generateFollowUpDraft).toHaveBeenCalled();
      expect(followUpRepository.save).toHaveBeenCalled();
      expect(result[0].draftFollowUp).toBe("Generated draft text");
      expect(result[0].status).toBe(FollowUpStatus.FOLLOW_UP_DUE);
    });

    it("should skip follow-ups that already have drafts", async () => {
      const followUpWithDraft = {
        ...mockFollowUp,
        draftFollowUp: "Existing draft",
      };

      followUpRepository.find.mockResolvedValue([followUpWithDraft]);

      const result = await service.generateFollowUpDrafts("user-1");

      expect(llmService.generateFollowUpDraft).not.toHaveBeenCalled();
      expect(result).toEqual([followUpWithDraft]);
    });

    it("should handle LLM generation errors gracefully", async () => {
      const dueFollowUp = {
        ...mockFollowUp,
        status: FollowUpStatus.AWAITING_REPLY,
        followUpDueAt: new Date(Date.now() - 1000),
      };

      followUpRepository.find.mockResolvedValue([dueFollowUp]);
      llmService.generateFollowUpDraft.mockRejectedValue(
        new Error("LLM error"),
      );

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      const result = await service.generateFollowUpDrafts("user-1");

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(result).toEqual([dueFollowUp]);

      loggerErrorSpy.mockRestore();
    });
  });

  describe("updateDraft", () => {
    it("should update follow-up draft", async () => {
      followUpRepository.findOne.mockResolvedValue(mockFollowUp);
      followUpRepository.save.mockResolvedValue({
        ...mockFollowUp,
        draftFollowUp: "Updated draft",
      });

      const result = await service.updateDraft(
        "follow-up-1",
        "user-1",
        "Updated draft",
      );

      expect(followUpRepository.findOne).toHaveBeenCalledWith({
        where: { id: "follow-up-1", userId: "user-1" },
      });
      expect(mockFollowUp.draftFollowUp).toBe("Updated draft");
      expect(result.draftFollowUp).toBe("Updated draft");
    });

    it("should throw error when follow-up not found", async () => {
      followUpRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateDraft("nonexistent-id", "user-1", "Draft"),
      ).rejects.toThrow("Follow-up not found");
    });
  });

  describe("completeFollowUp", () => {
    it("should mark follow-up as completed", async () => {
      followUpRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.completeFollowUp("follow-up-1", "user-1", false);

      expect(followUpRepository.update).toHaveBeenCalledWith(
        { id: "follow-up-1", userId: "user-1" },
        { status: FollowUpStatus.COMPLETED },
      );
    });

    it("should mark follow-up as cancelled when cancelled is true", async () => {
      followUpRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.completeFollowUp("follow-up-1", "user-1", true);

      expect(followUpRepository.update).toHaveBeenCalledWith(
        { id: "follow-up-1", userId: "user-1" },
        { status: FollowUpStatus.CANCELLED },
      );
    });
  });

  describe("cancelFollowUp", () => {
    it("should cancel follow-up", async () => {
      followUpRepository.update.mockResolvedValue(mockPartial({ affected: 1 }));

      await service.cancelFollowUp("follow-up-1", "user-1");

      expect(followUpRepository.update).toHaveBeenCalledWith(
        { id: "follow-up-1", userId: "user-1" },
        { status: FollowUpStatus.CANCELLED },
      );
    });
  });

  describe("getFollowUp", () => {
    it("should return follow-up by id", async () => {
      followUpRepository.findOne.mockResolvedValue(mockFollowUp);

      const result = await service.getFollowUp("follow-up-1", "user-1");

      expect(followUpRepository.findOne).toHaveBeenCalledWith({
        where: { id: "follow-up-1", userId: "user-1" },
      });
      expect(result).toEqual(mockFollowUp);
    });

    it("should return null when follow-up not found", async () => {
      followUpRepository.findOne.mockResolvedValue(null);

      const result = await service.getFollowUp("nonexistent-id", "user-1");

      expect(result).toBeNull();
    });
  });

  describe("getThreadsForFollowUp", () => {
    it("should delegate to emailsService.getInbox with follow-up mode", async () => {
      const mockEmails = [mockEmail];
      emailsService.getInbox.mockResolvedValue({
        emails: mockEmails,
        total: 1,
        hasMore: false,
      });

      const result = await service.getThreadsForFollowUp("user-1");

      expect(emailsService.getInbox).toHaveBeenCalledWith(
        "user-1",
        false,
        "follow-up",
      );
      expect(result).toEqual(mockEmails);
    });
  });

  describe("calculateWaitingDuration", () => {
    it("should calculate business days since last user message", async () => {
      // Fixed "now" and last-message dates — relative Date.now() spans are flaky
      // (weekends, holidays, DST) once normalized to start-of-day in calculateBusinessDays.
      const friday = new Date(2024, 0, 12, 12, 0, 0);
      const monday = new Date(2024, 0, 8, 9, 0, 0);
      jest.useFakeTimers({ now: friday });
      try {
        usersService.findOne.mockResolvedValue(mockUser);

        const userEmail = mockPartial({
          ...mockEmail,
          from: "user@example.com",
          labels: ["SENT"],
          receivedAt: monday,
          getPriorityScore: jest.fn().mockReturnValue(50),
        });

        emailRepository.find.mockResolvedValue([userEmail]);

        const result = await service.calculateWaitingDuration(
          "user-1",
          "thread-1",
        );

        // Mon 2024-01-08 → Fri 2024-01-12 inclusive = 5 business days (see business-days.util.spec)
        expect(result).toBe(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should return 0 when no user messages found", async () => {
      usersService.findOne.mockResolvedValue(mockUser);
      emailRepository.find.mockResolvedValue([
        mockPartial({
          ...mockEmail,
          from: "them@example.com",
          labels: [],
          getPriorityScore: jest.fn().mockReturnValue(50),
        }),
      ]);

      const result = await service.calculateWaitingDuration(
        "user-1",
        "thread-1",
      );

      expect(result).toBe(0);
    });

    it("should throw error when user not connected to Gmail", async () => {
      usersService.findOne.mockResolvedValue(
        mockPartial({
          ...mockUser,
          googleCalendarAccessToken: null,
        }),
      );

      await expect(
        service.calculateWaitingDuration("user-1", "thread-1"),
      ).rejects.toThrow("User not connected to Gmail");
    });
  });

  describe("generateDraftsForThreads", () => {
    it("should create follow-up and queue draft generation job", async () => {
      const newFollowUp = {
        ...mockFollowUp,
        draftFollowUp: undefined,
        generationStatus: "pending" as const,
      };
      emailRepository.find.mockResolvedValue([mockEmail]);
      emailThreadRepository.findOne.mockResolvedValue(mockEmailThread);
      followUpRepository.findOne.mockResolvedValue(null);
      followUpRepository.create.mockReturnValue(newFollowUp as FollowUp);
      followUpRepository.save.mockResolvedValue(newFollowUp as FollowUp);

      await service.generateDraftsForThreads("user-1", ["thread-1"]);

      expect(followUpRepository.save).toHaveBeenCalled();
      expect(boss.send).toHaveBeenCalledWith(
        "generate-follow-up-draft",
        expect.objectContaining({
          userId: "user-1",
          threadId: "thread-1",
          followUpId: newFollowUp.id,
        }),
        expect.any(Object),
      );
    });

    it("should skip threads that already have drafts", async () => {
      const existingFollowUp = {
        ...mockFollowUp,
        draftFollowUp: "Existing draft",
      };

      followUpRepository.findOne.mockResolvedValue(existingFollowUp);

      await service.generateDraftsForThreads("user-1", ["thread-1"]);

      expect(boss.send).not.toHaveBeenCalled();
    });

    it("should skip threads currently generating", async () => {
      const generatingFollowUp = {
        ...mockFollowUp,
        generationStatus: "generating",
      } as FollowUp;

      followUpRepository.findOne.mockResolvedValue(generatingFollowUp);

      await service.generateDraftsForThreads("user-1", ["thread-1"]);

      expect(boss.send).not.toHaveBeenCalled();
    });

    it("should handle multiple threads", async () => {
      const newFollowUp = {
        ...mockFollowUp,
        draftFollowUp: undefined,
        generationStatus: "pending" as const,
      };
      emailRepository.find.mockResolvedValue([mockEmail]);
      emailThreadRepository.findOne.mockResolvedValue(mockEmailThread);
      followUpRepository.findOne.mockResolvedValue(null);
      followUpRepository.create.mockReturnValue(newFollowUp as FollowUp);
      followUpRepository.save.mockResolvedValue(newFollowUp as FollowUp);

      await service.generateDraftsForThreads("user-1", [
        "thread-1",
        "thread-2",
      ]);

      expect(boss.send).toHaveBeenCalledTimes(2);
    });
  });

  describe("reviewAndCleanupDraft", () => {
    it("should review and cleanup draft using LLM", async () => {
      followUpRepository.findOne.mockResolvedValue(mockFollowUp);
      contextService.getUserContext.mockResolvedValue([]);
      llmService.generateText.mockResolvedValue("Cleaned up draft");

      const result = await service.reviewAndCleanupDraft(
        "follow-up-1",
        "user-1",
        "Original draft",
        "Recipient Name",
      );

      expect(llmService.generateText).toHaveBeenCalled();
      expect(result).toBe("Cleaned up draft");
    });

    it("should throw error when follow-up not found", async () => {
      followUpRepository.findOne.mockResolvedValue(null);

      await expect(
        service.reviewAndCleanupDraft("nonexistent-id", "user-1", "Draft"),
      ).rejects.toThrow("Follow-up not found");
    });

    it("should return original draft when LLM fails", async () => {
      followUpRepository.findOne.mockResolvedValue(mockFollowUp);
      contextService.getUserContext.mockResolvedValue([]);
      llmService.generateText.mockRejectedValue(new Error("LLM error"));

      const loggerErrorSpy = jest
        .spyOn(service["logger"], "error")
        .mockImplementation();

      const result = await service.reviewAndCleanupDraft(
        "follow-up-1",
        "user-1",
        "Original draft",
      );

      expect(result).toBe("Original draft");
      loggerErrorSpy.mockRestore();
    });
  });
});
