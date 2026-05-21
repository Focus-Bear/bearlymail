import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import { EmailThreadService } from "./email-thread.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

const USER_EMAIL = "user@example.com";
const ENCRYPTED_USER_EMAIL = "encrypted-user@example.com";
const OTHER_EMAIL = "other@example.com";
const USER_ID = "user-1";
const THREAD_ID = "thread-abc";

function makeEmail(
  overrides: Partial<{
    from: string;
    receivedAt: Date;
    sentByAutoResponder: boolean;
  }> = {},
) {
  return {
    id: `email-${Math.random()}`,
    from: OTHER_EMAIL,
    receivedAt: new Date("2025-01-01T10:00:00Z"),
    sentByAutoResponder: false,
    ...overrides,
  };
}

describe("EmailFollowUpService", () => {
  let service: EmailFollowUpService;
  let mockUsersService: jest.Mocked<Pick<UsersService, "findOne">>;
  let mockEmailThreadService: jest.Mocked<
    Pick<EmailThreadService, "getThreadEmails">
  >;
  let mockFollowUpRepository: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };
  let mockEmailThreadRepository: { findOne: jest.Mock };
  let mockEmailRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    mockUsersService = {
      findOne: jest.fn().mockResolvedValue({
        id: USER_ID,
        email: ENCRYPTED_USER_EMAIL,
      }),
    };

    mockEmailThreadService = {
      getThreadEmails: jest.fn().mockResolvedValue([]),
    };

    mockFollowUpRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    mockEmailThreadRepository = { findOne: jest.fn() };
    mockEmailRepository = { findOne: jest.fn() };

    jest
      .spyOn(EncryptionHelper, "tryDecrypt")
      .mockImplementation((val: string) =>
        val === ENCRYPTED_USER_EMAIL ? USER_EMAIL : val,
      );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailFollowUpService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: EmailThreadService, useValue: mockEmailThreadService },
        {
          provide: getRepositoryToken(FollowUp),
          useValue: mockFollowUpRepository,
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockEmailThreadRepository,
        },
        {
          provide: getRepositoryToken(Email),
          useValue: mockEmailRepository,
        },
      ],
    }).compile();

    service = module.get(EmailFollowUpService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe("checkThreadFollowUpStatus", () => {
    it("returns userSentLast=false when last email is from other party", async () => {
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: USER_EMAIL }) as never,
        makeEmail({ from: OTHER_EMAIL }) as never,
      ]);

      const result = await service.checkThreadFollowUpStatus(
        USER_ID,
        THREAD_ID,
      );

      expect(result.userSentLast).toBe(false);
      expect(result.replyReceived).toBe(true);
    });

    it("returns userSentLast=true when user sent last email manually", async () => {
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL, sentByAutoResponder: false }) as never,
      ]);

      const result = await service.checkThreadFollowUpStatus(
        USER_ID,
        THREAD_ID,
      );

      expect(result.userSentLast).toBe(true);
      expect(result.replyReceived).toBe(false);
    });

    it("returns userSentLast=false when last email is autoresponder (sentByAutoResponder=true)", async () => {
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL, sentByAutoResponder: true }) as never,
      ]);

      const result = await service.checkThreadFollowUpStatus(
        USER_ID,
        THREAD_ID,
      );

      expect(result.userSentLast).toBe(false);
      expect(result.replyReceived).toBe(true);
    });
  });

  describe("filterActionModeEmails", () => {
    const mockPerf = {
      startSpan: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as PerformanceTracker;

    function makeInboxEmail(overrides: Partial<InboxEmail> = {}): InboxEmail {
      return {
        id: `email-${Math.random()}`,
        from: OTHER_EMAIL,
        sentByAutoResponder: false,
        ...overrides,
      } as InboxEmail;
    }

    it("keeps emails where other party sent last", async () => {
      const email = makeInboxEmail({ from: OTHER_EMAIL });
      const result = await service.filterActionModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result).toContain(email);
    });

    it("removes emails where user sent last (manual reply)", async () => {
      const email = makeInboxEmail({
        from: USER_EMAIL,
        sentByAutoResponder: false,
      });
      const result = await service.filterActionModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result).not.toContain(email);
    });

    it("keeps emails where autoresponder sent last (sentByAutoResponder=true)", async () => {
      // Autoresponder-sent threads must stay in Action mode, not disappear.
      const email = makeInboxEmail({
        from: USER_EMAIL,
        sentByAutoResponder: true,
      });
      const result = await service.filterActionModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result).toContain(email);
    });
  });

  describe("filterFollowUpModeEmails", () => {
    const mockPerf = {
      startSpan: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as PerformanceTracker;

    function makeInboxEmail(overrides: Partial<InboxEmail> = {}): InboxEmail {
      return {
        id: `email-${Math.random()}`,
        threadId: THREAD_ID,
        from: OTHER_EMAIL,
        isSnoozed: false,
        sentByAutoResponder: false,
        ...overrides,
      } as InboxEmail;
    }

    function mockQbForFollowUps(followUps: Partial<FollowUp>[]) {
      mockFollowUpRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(followUps),
      });
    }

    it("includes thread when user sent last and no active follow-up record", async () => {
      mockQbForFollowUps([]);
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const email = makeInboxEmail({ from: USER_EMAIL });
      const result = await service.filterFollowUpModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result).toContain(email);
    });

    it("includes thread even when AWAITING_REPLY follow-up has future due date (snooze should handle suppression)", async () => {
      // The suppression of threads whose follow-up hasn't come due yet is handled
      // by the snooze mechanism (thread.isSnoozed), NOT by filterFollowUpModeEmails.
      // This test documents that filterFollowUpModeEmails does NOT suppress based on
      // follow-up due date — if a thread reaches this filter it means the snooze
      // already expired (or was cancelled, which is the #2125 bug under investigation).
      const msIn48Hours = 48 * 60 * 60 * 1000;
      const futureDate = new Date(Date.now() + msIn48Hours);
      mockQbForFollowUps([
        {
          threadId: THREAD_ID,
          status: FollowUpStatus.AWAITING_REPLY,
          followUpDueAt: futureDate,
        },
      ]);
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const email = makeInboxEmail({ from: USER_EMAIL, threadId: THREAD_ID });
      const result = await service.filterFollowUpModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      // Thread is included — the debug logging will flag this as the #2125 symptom.
      expect(result).toContain(email);
    });

    it("includes thread when AWAITING_REPLY follow-up due date has passed", async () => {
      const msIn24Hours = 24 * 60 * 60 * 1000;
      const pastDate = new Date(Date.now() - msIn24Hours);
      mockQbForFollowUps([
        {
          threadId: THREAD_ID,
          status: FollowUpStatus.AWAITING_REPLY,
          followUpDueAt: pastDate,
        },
      ]);
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const email = makeInboxEmail({ from: USER_EMAIL, threadId: THREAD_ID });
      const result = await service.filterFollowUpModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result).toContain(email);
    });

    it("does not populate followUpDueAt when no follow-up record exists", async () => {
      mockQbForFollowUps([]);
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const email = makeInboxEmail({ from: USER_EMAIL, threadId: THREAD_ID });
      const result = await service.filterFollowUpModeEmails(
        USER_ID,
        [email],
        mockPerf,
      );
      expect(result[0].followUpDueAt).toBeUndefined();
    });
  });

  describe("getFollowUpDebugInfo", () => {
    const EMAIL_ID = "email-debug-1";

    function setupThread(overrides: Partial<EmailThread> = {}) {
      mockEmailRepository.findOne.mockResolvedValue({
        id: EMAIL_ID,
        userId: USER_ID,
        threadId: THREAD_ID,
        emailThreadId: "thread-row-1",
      });
      mockEmailThreadRepository.findOne.mockResolvedValue({
        id: "thread-row-1",
        userId: USER_ID,
        threadId: THREAD_ID,
        starCount: 3,
        isArchived: false,
        isSnoozed: false,
        snoozeUntil: null,
        lastUserOperationAt: null,
        ...overrides,
      });
    }

    it("reports qualifies=YES with a ⚠ note when starred + user-sent-last but no FollowUp record (the #2125 case)", async () => {
      setupThread();
      mockFollowUpRepository.find.mockResolvedValue([]);
      // Last email is from the user → userSentLast=true, replyReceived=false
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const info = await service.getFollowUpDebugInfo(USER_ID, EMAIL_ID);

      expect(info.verdict.qualifiesForFollowUpMode).toBe(true);
      expect(info.activeFollowUpDueAt).toBeNull();
      expect(info.followUpRecords).toHaveLength(0);
      // Verdict and detail must be consistent: a YES verdict still surfaces
      // the missing-record warning rather than hiding it.
      expect(info.verdict.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Thread is starred (starCount=3)"),
          expect.stringContaining("User sent the last message"),
          expect.stringContaining("No active FollowUp record"),
        ]),
      );
    });

    it("reports qualifies=NO with the blocking criterion when starCount is 0", async () => {
      setupThread({ starCount: 0 });
      mockFollowUpRepository.find.mockResolvedValue([]);
      mockEmailThreadService.getThreadEmails.mockResolvedValue([
        makeEmail({ from: OTHER_EMAIL }) as never,
        makeEmail({ from: USER_EMAIL }) as never,
      ]);

      const info = await service.getFollowUpDebugInfo(USER_ID, EMAIL_ID);

      expect(info.verdict.qualifiesForFollowUpMode).toBe(false);
      expect(info.verdict.reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("starCount is 0")]),
      );
    });
  });
});
