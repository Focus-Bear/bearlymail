import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BlockedKeywordsService } from "../blocked-keywords/blocked-keywords.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { ActionItem } from "../database/entities/action-item.entity";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { SuggestedRepliesService } from "../suggested-replies/suggested-replies.service";
import { UsersService } from "../users/users.service";
import { EmailLifecycleService } from "./email-lifecycle.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailThreadService } from "./email-thread.service";

jest.mock("../utils/hmac-email", () => ({
  computeEmailHmac: jest.fn().mockReturnValue("hmac-hash"),
  computeRecipientsHmac: jest.fn().mockReturnValue("hmac-recipients"),
}));

jest.mock("../queue/job-priorities", () => ({
  getJobPriority: jest.fn().mockReturnValue(10),
}));

describe("EmailLifecycleService", () => {
  let service: EmailLifecycleService;
  let emailRepository: jest.Mocked<Repository<Email>>;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let actionItemRepository: jest.Mocked<Repository<ActionItem>>;
  let contactRepository: jest.Mocked<any>;
  let blockedSendersService: jest.Mocked<BlockedSendersService>;
  let blockedKeywordsService: jest.Mocked<BlockedKeywordsService>;
  let batchScheduleService: jest.Mocked<BatchScheduleService>;
  let emailThreadService: jest.Mocked<EmailThreadService>;
  let usersService: jest.Mocked<UsersService>;
  let boss: { send: jest.Mock };

  beforeEach(async () => {
    boss = { send: jest.fn().mockResolvedValue("job-id") };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLifecycleService,
        {
          provide: getRepositoryToken(Email),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ActionItem),
          useValue: {
            delete: jest.fn(),
          },
        },
        {
          provide: "ContactRepository",
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: getRepositoryToken(Contact),
          useValue: {
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: "PG_BOSS",
          useValue: boss,
        },
        {
          provide: BlockedSendersService,
          useValue: {
            isSenderBlocked: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: BlockedKeywordsService,
          useValue: {
            checkSubjectForBlockedKeywords: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: BatchScheduleService,
          useValue: {
            getSchedule: jest.fn().mockResolvedValue(null),
            getDefaultSchedule: jest.fn().mockReturnValue({
              isEnabled: false,
              urgentBypassSchedule: false,
            }),
            getNextBatchReleaseTime: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: EmailThreadService,
          useValue: {
            getOrCreateEmailThread: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            isUserActive: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getPrimaryProvider: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: SuggestedRepliesService,
          useValue: {
            queueSuggestedReplyGeneration: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<EmailLifecycleService>(EmailLifecycleService);
    emailRepository = module.get(getRepositoryToken(Email));
    emailThreadRepository = module.get(getRepositoryToken(EmailThread));
    actionItemRepository = module.get(getRepositoryToken(ActionItem));
    blockedSendersService = module.get(BlockedSendersService);
    blockedKeywordsService = module.get(BlockedKeywordsService);
    batchScheduleService = module.get(BatchScheduleService);
    emailThreadService = module.get(EmailThreadService);
    usersService = module.get(UsersService);
    contactRepository = module.get(getRepositoryToken(Contact));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("checkIfUrgent", () => {
    it("returns true when subject contains urgent keyword", () => {
      expect(service.checkIfUrgent({ subject: "URGENT: server down" })).toBe(
        true,
      );
      expect(service.checkIfUrgent({ subject: "This is critical" })).toBe(true);
      expect(service.checkIfUrgent({ subject: "need this asap" })).toBe(true);
    });

    it("returns false when subject has no urgent keywords", () => {
      expect(service.checkIfUrgent({ subject: "Weekly standup notes" })).toBe(
        false,
      );
      expect(service.checkIfUrgent({ subject: "" })).toBe(false);
      expect(service.checkIfUrgent({})).toBe(false);
    });

    it("returns true when subject ends with urgent keyword", () => {
      expect(service.checkIfUrgent({ subject: "Please review urgent" })).toBe(
        true,
      );
    });

    it("returns true when subject starts with urgent keyword", () => {
      expect(
        service.checkIfUrgent({ subject: "emergency shutdown required" }),
      ).toBe(true);
    });

    it("returns true for punctuated keywords (strips punctuation before matching)", () => {
      expect(service.checkIfUrgent({ subject: "urgent!" })).toBe(true);
      expect(service.checkIfUrgent({ subject: "critical." })).toBe(true);
      expect(service.checkIfUrgent({ subject: "(asap)" })).toBe(true);
    });

    it("does not false-positive on hyphenated compound words", () => {
      expect(service.checkIfUrgent({ subject: "not-urgent at all" })).toBe(
        false,
      );
      expect(service.checkIfUrgent({ subject: "non-critical update" })).toBe(
        false,
      );
      expect(
        service.checkIfUrgent({ subject: "security-critical patch" }),
      ).toBe(false);
    });
  });

  describe("determineBatchDecision", () => {
    it("returns not batched when skipBatching is true", async () => {
      const thread = {} as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        0,
        0,
        { skipBatching: true },
      );
      expect(result.isBatched).toBe(false);
      expect(result.batchDecisionReason).toBe("Initial sync");
    });

    it("returns not batched for starred email", async () => {
      const thread = {} as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        1,
        0,
      );
      expect(result.isBatched).toBe(false);
      expect(result.batchDecisionReason).toBe("Starred email");
    });

    it("returns not batched when schedule is disabled", async () => {
      batchScheduleService.getSchedule.mockResolvedValue({
        isEnabled: false,
        urgentBypassSchedule: false,
      } as any);

      const thread = {} as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        0,
        0,
      );
      expect(result.isBatched).toBe(false);
      expect(result.batchDecisionReason).toBe("Schedule disabled");
    });

    it("returns not batched when getNextBatchReleaseTime returns null", async () => {
      batchScheduleService.getSchedule.mockResolvedValue({
        isEnabled: true,
        urgentBypassSchedule: false,
      } as any);
      batchScheduleService.getNextBatchReleaseTime.mockReturnValue(null);

      const thread = {} as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        0,
        0,
      );
      expect(result.isBatched).toBe(false);
      expect(result.batchDecisionReason).toBe("No upcoming delivery window");
    });

    it("returns batched with release time when schedule has next release", async () => {
      const releaseAt = new Date(Date.now() + 60_000);
      batchScheduleService.getSchedule.mockResolvedValue({
        isEnabled: true,
        urgentBypassSchedule: false,
      } as any);
      batchScheduleService.getNextBatchReleaseTime.mockReturnValue(releaseAt);

      const thread = { batchReleaseAt: null } as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        0,
        0,
      );
      expect(result.isBatched).toBe(true);
      expect(result.batchReleaseAt).toEqual(releaseAt);
    });

    it("uses earlier existing release time when valid", async () => {
      const futureTime = new Date(Date.now() + 120_000);
      const earlierExisting = new Date(Date.now() + 60_000);
      batchScheduleService.getSchedule.mockResolvedValue({
        isEnabled: true,
        urgentBypassSchedule: false,
      } as any);
      batchScheduleService.getNextBatchReleaseTime.mockReturnValue(futureTime);

      const thread = { batchReleaseAt: earlierExisting } as EmailThread;
      const result = await service.determineBatchDecision(
        "user-1",
        thread,
        0,
        0,
      );
      expect(result.isBatched).toBe(true);
      expect(result.batchReleaseAt).toEqual(earlierExisting);
    });
  });

  describe("invalidateSuggestedActionsCache", () => {
    it("calls actionItemRepository.delete for the thread", async () => {
      actionItemRepository.delete.mockResolvedValue({ affected: 3, raw: [] });
      await service.invalidateSuggestedActionsCache("thread-1");
      expect(actionItemRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ emailThreadId: "thread-1" }),
      );
    });

    it("handles delete errors gracefully", async () => {
      actionItemRepository.delete.mockRejectedValue(new Error("DB error"));
      await expect(
        service.invalidateSuggestedActionsCache("thread-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("saveBlockedEmail", () => {
    it("saves email with blocked sender label and queues archive job", async () => {
      const thread = {
        id: "thread-1",
        isProcessingPriority: true,
      } as EmailThread;
      const email = { id: "email-1", labels: [], threadId: "thread-1" } as any;

      emailThreadRepository.save.mockResolvedValue(thread);
      emailRepository.save.mockResolvedValue({
        ...email,
        id: "email-1",
      } as Email);

      const result = await service.saveBlockedEmail({
        userId: "user-1",
        email,
        thread,
        isSenderBlocked: true,
        senderEmail: "spam@bad.com",
        subject: "Buy now",
      });

      expect(emailThreadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isProcessingPriority: false }),
      );
      expect(email.summary).toBe("[Blocked sender]");
      expect(email.labels).toContain("BearlyMail-Blocked");
      expect(emailRepository.save).toHaveBeenCalled();
      expect(result.id).toBe("email-1");
    });

    it("sets blocked keyword summary when keyword triggered", async () => {
      const thread = {
        id: "thread-1",
        isProcessingPriority: true,
      } as EmailThread;
      const email = { id: "email-1", labels: [], threadId: "thread-1" } as any;

      emailThreadRepository.save.mockResolvedValue(thread);
      emailRepository.save.mockResolvedValue({
        ...email,
        id: "email-1",
      } as Email);

      await service.saveBlockedEmail({
        userId: "user-1",
        email,
        thread,
        isSenderBlocked: false,
        senderEmail: "sender@ok.com",
        subject: "Win a prize",
      });

      expect(email.summary).toBe("[Blocked keyword]");
    });
  });

  describe("createEmail — inactive user deferral", () => {
    it("defers email when user is inactive", async () => {
      const thread = {
        id: "thread-1",
        aiProcessingDeferred: false,
        isProcessingPriority: false,
        starCount: 0,
        batchReleaseAt: null,
      } as EmailThread;

      const emailObj = {
        id: "email-1",
        isProcessingSummary: false,
        labels: null,
        emailThreadId: "thread-1",
      } as any;

      emailThreadService.getOrCreateEmailThread.mockResolvedValue(thread);
      blockedSendersService.isSenderBlocked.mockResolvedValue(false);
      blockedKeywordsService.checkSubjectForBlockedKeywords.mockResolvedValue(
        false,
      );
      usersService.isUserActive.mockResolvedValue(false);
      emailRepository.create.mockReturnValue(emailObj);
      emailThreadRepository.save.mockResolvedValue(thread);
      emailRepository.save.mockResolvedValue({
        ...emailObj,
        id: "email-1",
      } as Email);
      contactRepository.findOne.mockResolvedValue(null);

      const result = await service.createEmail("user-1", {
        subject: "Test",
        from: "sender@test.com",
        threadId: "thread-1",
      });

      expect(thread.aiProcessingDeferred).toBe(true);
      expect(thread.isProcessingPriority).toBe(false);
      expect(emailThreadRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ aiProcessingDeferred: true }),
      );
      expect(result.id).toBe("email-1");
    });

    it("proceeds normally when user is active", async () => {
      const thread = {
        id: "thread-1",
        aiProcessingDeferred: false,
        isProcessingPriority: false,
        starCount: 0,
        batchReleaseAt: null,
        priorityScore: 0,
      } as EmailThread;

      const emailObj = {
        id: "email-1",
        isProcessingSummary: false,
        labels: null,
        emailThreadId: "thread-1",
      } as any;

      emailThreadService.getOrCreateEmailThread.mockResolvedValue(thread);
      blockedSendersService.isSenderBlocked.mockResolvedValue(false);
      blockedKeywordsService.checkSubjectForBlockedKeywords.mockResolvedValue(
        false,
      );
      usersService.isUserActive.mockResolvedValue(true);
      emailRepository.create.mockReturnValue(emailObj);
      emailThreadRepository.save.mockResolvedValue(thread);
      emailRepository.save.mockResolvedValue({
        ...emailObj,
        id: "email-1",
      } as Email);
      emailThreadRepository.update.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      actionItemRepository.delete.mockResolvedValue({ affected: 0, raw: [] });
      contactRepository.findOne.mockResolvedValue(null);

      await service.createEmail("user-1", {
        subject: "Test active",
        from: "sender@test.com",
        threadId: "thread-1",
      });

      expect(thread.isProcessingPriority).toBe(true);
    });
  });
});
