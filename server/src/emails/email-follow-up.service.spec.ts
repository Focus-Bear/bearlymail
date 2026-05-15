import { Test, TestingModule } from "@nestjs/testing";

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
});
