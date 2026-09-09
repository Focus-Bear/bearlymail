import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { ContactsService } from "../contacts/contacts.service";
import { ContextService } from "../context/context.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { ScheduledEmail } from "../database/entities/scheduled-email.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EmailsService } from "../emails/emails.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import {
  CreateScheduledEmailDto,
  ScheduledEmailsService,
} from "./scheduled-emails.service";

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe("ScheduledEmailsService", () => {
  let service: ScheduledEmailsService;
  let repo: jest.Mocked<Repository<ScheduledEmail>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledEmailsService,
        {
          provide: getRepositoryToken(ScheduledEmail),
          useFactory: mockRepository,
        },
        { provide: EmailProviderManager, useValue: {} },
        { provide: EmailsService, useValue: {} },
        { provide: UserEncryptionService, useValue: {} },
        { provide: ContactsService, useValue: {} },
        { provide: UsersService, useValue: {} },
        {
          provide: FollowUpsService,
          useValue: { createFollowUpForSentMessage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ScheduledEmailsService);
    repo = module.get(getRepositoryToken(ScheduledEmail));
  });

  describe("scheduleEmail", () => {
    it("saves a scheduled reply with a non-UUID provider thread ID", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        // Gmail thread IDs are short hex strings — NOT UUIDs.
        // Before the fix, this caused: "invalid input syntax for type uuid".
        threadId: "19deabad8035dc29",
        emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
        to: [{ email: "someone@example.com", name: "Someone" }],
        subject: "Re: Test",
        body: "Scheduled reply body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
        userTimezone: "Asia/Manila",
      };

      const fakeEntity = { id: "abc-123", ...dto, status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      const result = await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-uuid",
          threadId: "19deabad8035dc29",
          emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
          to: [{ email: "someone@example.com", name: "Someone" }],
          subject: "Re: Test",
          body: "Scheduled reply body",
          status: "pending",
        }),
      );
      expect(repo.save).toHaveBeenCalledWith(fakeEntity);
      expect(result.id).toBe("abc-123");
    });

    it("saves a scheduled reply with cc and bcc", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        threadId: "19deabad8035dc29",
        emailId: "3369f13c-f07b-4549-aee5-e7a15c2ac848",
        to: [{ email: "to@example.com" }],
        cc: [{ email: "cc@example.com" }],
        bcc: [{ email: "bcc@example.com" }],
        subject: "Re: Test",
        body: "Body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
      };

      const fakeEntity = { id: "def-456", ...dto, status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      const result = await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: [{ email: "cc@example.com" }],
          bcc: [{ email: "bcc@example.com" }],
        }),
      );
      expect(result.id).toBe("def-456");
    });

    it("sets null for optional fields when not provided", async () => {
      const dto: CreateScheduledEmailDto = {
        emailType: "reply",
        to: [{ email: "to@example.com" }],
        subject: "Test",
        body: "Body",
        scheduledSendAt: new Date("2025-05-20T08:00:00Z"),
      };

      const fakeEntity = { id: "ghi-789", status: "pending" };
      repo.create.mockReturnValue(fakeEntity as any);
      repo.save.mockResolvedValue(fakeEntity as any);

      await service.scheduleEmail("user-uuid", dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: null,
          emailId: null,
          cc: null,
          bcc: null,
          attachments: null,
          errorMessage: null,
          sentAt: null,
        }),
      );
    });
  });

  describe("sendScheduledEmail (reply html rendering)", () => {
    const wireSendMocks = (sendReply: jest.Mock) => {
      (service as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ emailSignature: null }),
      };
      (service as any).emailProviderManager = {
        getPrimaryProvider: jest.fn().mockResolvedValue({ sendReply }),
      };
      (service as any).emailsService = {
        getEmailById: jest.fn().mockResolvedValue({ id: "email-1" }),
      };
      (service as any).contactsService = {
        incrementContactFrequency: jest.fn().mockResolvedValue(undefined),
      };
      repo.save.mockResolvedValue({} as any);
    };

    const replyEntity = (body: string): ScheduledEmail =>
      ({
        id: "sched-1",
        userId: "user-1",
        emailType: "reply",
        emailId: "email-1",
        threadId: "19deabad8035dc29",
        to: [{ email: "someone@example.com" }],
        cc: [],
        bcc: [],
        subject: "Re: Test",
        body,
        attachments: null,
        forwardAttachmentIds: null,
      }) as unknown as ScheduledEmail;

    it("sends an htmlBody so HTML replies render (regression: raw <p> tags)", async () => {
      const sendReply = jest.fn().mockResolvedValue({});
      wireSendMocks(sendReply);

      await (service as any).sendScheduledEmail(
        replyEntity("<p>Thanks Nicola.</p><p>cheers,</p>"),
      );

      const arg = sendReply.mock.calls[0][1];
      expect(arg.options.htmlBody).toContain("<p>Thanks Nicola.</p>");
      // HTML-aware signature is appended as <br><br>, not a literal \n\n.
      expect(arg.options.htmlBody).toContain("<br><br>");
    });

    it("leaves htmlBody undefined for a plain-text reply", async () => {
      const sendReply = jest.fn().mockResolvedValue({});
      wireSendMocks(sendReply);

      await (service as any).sendScheduledEmail(
        replyEntity("Thanks Nicola, cheers"),
      );

      expect(sendReply.mock.calls[0][1].options.htmlBody).toBeUndefined();
    });
  });

  describe("sendScheduledEmail (composed message follow-up)", () => {
    const SENT = { messageId: "msg-1", threadId: "thread-9" };

    const wireNewEmailMocks = (createFollowUpForSentMessage: jest.Mock) => {
      const sendEmail = jest.fn().mockResolvedValue(SENT);
      (service as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ emailSignature: null }),
      };
      (service as any).emailProviderManager = {
        getPrimaryProvider: jest.fn().mockResolvedValue({ sendEmail }),
      };
      (service as any).contactsService = {
        incrementContactFrequency: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).followUpsService = { createFollowUpForSentMessage };
      repo.save.mockResolvedValue({} as any);
      return sendEmail;
    };

    const newEmailEntity = (
      expectedReplyHours: number | null,
    ): ScheduledEmail =>
      ({
        id: "sched-2",
        userId: "user-1",
        emailType: "new",
        to: [{ email: "someone@example.com" }],
        cc: [],
        bcc: [],
        subject: "Project kickoff",
        body: "Hello there",
        attachments: null,
        forwardAttachmentIds: null,
        expectedReplyHours,
      }) as unknown as ScheduledEmail;

    it("creates the follow-up on the thread the provider just created", async () => {
      const createFollowUpForSentMessage = jest.fn().mockResolvedValue(null);
      wireNewEmailMocks(createFollowUpForSentMessage);

      await (service as any).sendScheduledEmail(newEmailEntity(48));

      expect(createFollowUpForSentMessage).toHaveBeenCalledWith(
        "user-1",
        SENT.threadId,
        48,
        { subject: "Project kickoff" },
      );
    });

    it("asks for no follow-up when the composer cleared the field", async () => {
      const createFollowUpForSentMessage = jest.fn().mockResolvedValue(null);
      wireNewEmailMocks(createFollowUpForSentMessage);

      await (service as any).sendScheduledEmail(newEmailEntity(null));

      expect(createFollowUpForSentMessage).toHaveBeenCalledWith(
        "user-1",
        SENT.threadId,
        undefined,
        { subject: "Project kickoff" },
      );
    });
  });

  /**
   * A scheduled reply goes through the same entry point as an immediate reply
   * (`FollowUpsService.createFollowUpForSentMessage`, called by
   * `RepliesService.createFollowUpAfterReply`), so these run the real
   * FollowUpsService over mocked repositories: what is asserted is the
   * follow-up actually written, not just that the call was delegated.
   */
  describe("sendScheduledEmail (reply follow-up)", () => {
    const EXPECTED_REPLY_HOURS = 48;
    /** followUpDaysFromHours(48) — the window an immediate reply produces. */
    const FOLLOW_UP_DAYS_FOR_48H = 2;
    const SENT_AT = new Date("2026-03-01T09:00:00.000Z");
    const DUE_AT_FOR_48H = "2026-03-03T09:00:00.000Z";
    const THREAD_ID = "19deabad8035dc29";
    const SOURCE_EMAIL_ID = "email-1";

    let replyService: ScheduledEmailsService;
    let scheduledRepo: jest.Mocked<Repository<ScheduledEmail>>;
    let followUpRepo: jest.Mocked<Repository<FollowUp>>;
    let sendReply: jest.Mock;

    const scheduledReply = (
      expectedReplyHours: number | null,
    ): ScheduledEmail =>
      ({
        id: "sched-3",
        userId: "user-1",
        emailType: "reply",
        emailId: SOURCE_EMAIL_ID,
        threadId: THREAD_ID,
        to: [{ email: "someone@example.com" }],
        cc: [],
        bcc: [],
        subject: "Re: Test",
        body: "Scheduled reply body",
        attachments: null,
        forwardAttachmentIds: null,
        expectedReplyHours,
      }) as unknown as ScheduledEmail;

    /** Drives the private send path the cron job would run. */
    const sendScheduled = (scheduled: ScheduledEmail): Promise<void> =>
      (
        replyService as unknown as {
          sendScheduledEmail: (email: ScheduledEmail) => Promise<void>;
        }
      ).sendScheduledEmail(scheduled);

    beforeEach(async () => {
      jest.useFakeTimers({ now: SENT_AT });
      sendReply = jest
        .fn()
        .mockResolvedValue({ messageId: "msg-1", threadId: THREAD_ID });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ScheduledEmailsService,
          FollowUpsService,
          {
            provide: getRepositoryToken(ScheduledEmail),
            useFactory: mockRepository,
          },
          { provide: getRepositoryToken(FollowUp), useFactory: mockRepository },
          {
            provide: getRepositoryToken(EmailThread),
            useFactory: mockRepository,
          },
          { provide: getRepositoryToken(Email), useFactory: mockRepository },
          {
            provide: EmailProviderManager,
            useValue: {
              getPrimaryProvider: jest.fn().mockResolvedValue({ sendReply }),
            },
          },
          {
            provide: EmailsService,
            useValue: {
              getEmailById: jest.fn().mockResolvedValue({
                id: SOURCE_EMAIL_ID,
              }),
            },
          },
          { provide: UserEncryptionService, useValue: {} },
          {
            provide: ContactsService,
            useValue: {
              incrementContactFrequency: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: UsersService,
            useValue: {
              findOne: jest.fn().mockResolvedValue({ emailSignature: null }),
            },
          },
          { provide: LLMService, useValue: {} },
          { provide: ContextService, useValue: {} },
          { provide: INJECT_TOKENS.PG_BOSS, useValue: {} },
        ],
      }).compile();

      replyService = module.get(ScheduledEmailsService);
      scheduledRepo = module.get(getRepositoryToken(ScheduledEmail));
      followUpRepo = module.get(getRepositoryToken(FollowUp));
      const emailThreadRepo: jest.Mocked<Repository<EmailThread>> = module.get(
        getRepositoryToken(EmailThread),
      );
      const emailRepo: jest.Mocked<Repository<Email>> = module.get(
        getRepositoryToken(Email),
      );

      scheduledRepo.save.mockResolvedValue({} as ScheduledEmail);
      emailThreadRepo.findOne.mockResolvedValue(null);
      emailRepo.find.mockResolvedValue([]);
      followUpRepo.findOne.mockResolvedValue(null);
      followUpRepo.create.mockImplementation(
        (data) => data as unknown as FollowUp,
      );
      followUpRepo.save.mockImplementation((data) =>
        Promise.resolve(data as FollowUp),
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("creates one follow-up on the thread the reply was sent to", async () => {
      await sendScheduled(scheduledReply(EXPECTED_REPLY_HOURS));

      expect(followUpRepo.save).toHaveBeenCalledTimes(1);
      const created = followUpRepo.create.mock.calls[0][0] as FollowUp;
      expect(created).toEqual(
        expect.objectContaining({
          userId: "user-1",
          threadId: THREAD_ID,
          sentEmailId: SOURCE_EMAIL_ID,
          status: FollowUpStatus.AWAITING_REPLY,
          // Identical to what RepliesService produces for 48h, because both
          // paths call createFollowUpForSentMessage.
          followUpDays: FOLLOW_UP_DAYS_FOR_48H,
        }),
      );
      expect(created.followUpDueAt.toISOString()).toBe(DUE_AT_FOR_48H);
    });

    it("creates no follow-up when the composer cleared the field", async () => {
      await sendScheduled(scheduledReply(null));

      expect(sendReply).toHaveBeenCalledTimes(1);
      expect(followUpRepo.save).not.toHaveBeenCalled();
    });

    it("creates no follow-up when the send fails", async () => {
      sendReply.mockRejectedValue(new Error("provider rejected the message"));

      await expect(
        sendScheduled(scheduledReply(EXPECTED_REPLY_HOURS)),
      ).rejects.toThrow("provider rejected the message");

      expect(followUpRepo.save).not.toHaveBeenCalled();
    });

    it("creates no second follow-up when the send is retried", async () => {
      await sendScheduled(scheduledReply(EXPECTED_REPLY_HOURS));
      // The first send persisted a follow-up; the retry now finds it.
      followUpRepo.findOne.mockResolvedValue(
        followUpRepo.create.mock.calls[0][0] as FollowUp,
      );

      await sendScheduled(scheduledReply(EXPECTED_REPLY_HOURS));

      expect(followUpRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
