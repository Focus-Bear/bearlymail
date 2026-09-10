import { Test, TestingModule } from "@nestjs/testing";
import type { Job } from "pg-boss";

import {
  EMAIL_SEND_FAILURE_REASON,
  EMAIL_SEND_STATUS,
  EMAIL_SEND_TYPE,
} from "../constants/email-send.constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailSendAttempt } from "../database/entities/email-send-attempt.entity";
import { EmailAdminService } from "../emails/email-admin.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { FollowUpsService } from "../follow-ups/follow-ups.service";
import { PusherService } from "../pusher/pusher.service";
import { RepliesService } from "../replies/replies.service";
import { UsersService } from "../users/users.service";
import { EmailSendProcessor } from "./email-send.processor";
import {
  EmailSendQueueService,
  SendQueuedEmailJobData,
} from "./email-send-queue.service";

type JobHandler = (jobs: Job<SendQueuedEmailJobData>[]) => Promise<unknown>;

const USER_ID = "user-1";
const SEND_ID = "send-1";
const EMAIL_ID = "email-1";
const SENT = { messageId: "msg-1", threadId: "thread-1" };
const FOLLOW_UP_HOURS = 48;

function buildAttempt(overrides: Partial<EmailSendAttempt> = {}) {
  return {
    id: SEND_ID,
    userId: USER_ID,
    status: EMAIL_SEND_STATUS.SENDING,
    sendType: EMAIL_SEND_TYPE.REPLY,
    emailId: EMAIL_ID,
    payload: { body: "Hello", isForward: false, keepInAction: false },
    attempts: 1,
    ...overrides,
  } as EmailSendAttempt;
}

describe("EmailSendProcessor", () => {
  let handlers: Record<string, JobHandler>;
  let sendQueueService: {
    claimForSending: jest.Mock;
    markSent: jest.Mock;
    markFailed: jest.Mock;
    releaseForRetry: jest.Mock;
    hasExhaustedAttempts: jest.Mock;
    findStaleQueued: jest.Mock;
    findStaleSending: jest.Mock;
    requeue: jest.Mock;
  };
  let repliesService: { sendReply: jest.Mock };
  let pusherService: {
    triggerEmailSendSucceeded: jest.Mock;
    triggerEmailSendFailed: jest.Mock;
  };
  let emailProviderManager: { getPrimaryProvider: jest.Mock };
  let emailAdminService: { trackEmailRecipients: jest.Mock };
  let followUpsService: { createFollowUpForSentMessage: jest.Mock };

  const runSendJob = () =>
    handlers[JOB_NAMES.SEND_QUEUED_EMAIL]([
      { data: { userId: USER_ID, sendId: SEND_ID } },
    ] as Job<SendQueuedEmailJobData>[]);

  // The cron job carries no data; registerWorker still delivers it as a batch
  // of one, so the handler must be invoked with a single placeholder job.
  const runSweepJob = () =>
    handlers[JOB_NAMES.SWEEP_STALLED_EMAIL_SENDS]([
      {},
    ] as Job<SendQueuedEmailJobData>[]);

  beforeEach(async () => {
    handlers = {};
    const mockBoss = {
      work: jest.fn((name: string, _options: unknown, handler: JobHandler) => {
        handlers[name] = handler;
        return Promise.resolve(name);
      }),
      schedule: jest.fn().mockResolvedValue(undefined),
    };

    sendQueueService = {
      claimForSending: jest.fn(),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      releaseForRetry: jest.fn().mockResolvedValue(undefined),
      hasExhaustedAttempts: jest.fn().mockReturnValue(false),
      findStaleQueued: jest.fn().mockResolvedValue([]),
      findStaleSending: jest.fn().mockResolvedValue([]),
      requeue: jest.fn().mockResolvedValue(undefined),
    };
    repliesService = { sendReply: jest.fn().mockResolvedValue(SENT) };
    pusherService = {
      triggerEmailSendSucceeded: jest.fn().mockResolvedValue(undefined),
      triggerEmailSendFailed: jest.fn().mockResolvedValue(undefined),
    };
    emailProviderManager = { getPrimaryProvider: jest.fn() };
    emailAdminService = {
      trackEmailRecipients: jest.fn().mockResolvedValue(undefined),
    };
    followUpsService = {
      createFollowUpForSentMessage: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
        { provide: EmailSendQueueService, useValue: sendQueueService },
        { provide: RepliesService, useValue: repliesService },
        { provide: EmailProviderManager, useValue: emailProviderManager },
        { provide: EmailAdminService, useValue: emailAdminService },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
        {
          provide: UserEncryptionService,
          useValue: {
            withUserKey: (_userId: string, task: () => Promise<unknown>) =>
              task(),
          },
        },
        { provide: FollowUpsService, useValue: followUpsService },
        { provide: PusherService, useValue: pusherService },
      ],
    }).compile();

    await module.get(EmailSendProcessor).onModuleInit();
  });

  describe("sending a queued reply", () => {
    it("sends via the provider and publishes the real message ids", async () => {
      sendQueueService.claimForSending.mockResolvedValue(buildAttempt());

      await runSendJob();

      expect(repliesService.sendReply).toHaveBeenCalledWith(
        USER_ID,
        EMAIL_ID,
        "Hello",
        expect.objectContaining({ isForward: false, keepInAction: false }),
      );
      expect(sendQueueService.markSent).toHaveBeenCalledWith(SEND_ID, SENT);
      expect(pusherService.triggerEmailSendSucceeded).toHaveBeenCalledWith(
        USER_ID,
        {
          sendId: SEND_ID,
          sendType: EMAIL_SEND_TYPE.REPLY,
          emailId: EMAIL_ID,
          messageId: SENT.messageId,
          threadId: SENT.threadId,
        },
      );
      expect(pusherService.triggerEmailSendFailed).not.toHaveBeenCalled();
    });

    it("decodes base64 attachments back to Buffers", async () => {
      sendQueueService.claimForSending.mockResolvedValue(
        buildAttempt({
          payload: {
            body: "Hello",
            isForward: false,
            keepInAction: false,
            attachments: [
              {
                filename: "a.pdf",
                mimeType: "application/pdf",
                content: Buffer.from("bytes").toString("base64"),
              },
            ],
          },
        }),
      );

      await runSendJob();

      expect(repliesService.sendReply).toHaveBeenCalledWith(
        USER_ID,
        EMAIL_ID,
        "Hello",
        expect.objectContaining({
          attachments: [
            {
              filename: "a.pdf",
              mimeType: "application/pdf",
              content: Buffer.from("bytes"),
            },
          ],
        }),
      );
    });
  });

  describe("sending a queued new email", () => {
    it("dispatches to the provider and tracks recipients", async () => {
      const provider = { sendEmail: jest.fn().mockResolvedValue(SENT) };
      emailProviderManager.getPrimaryProvider.mockResolvedValue(provider);
      sendQueueService.claimForSending.mockResolvedValue(
        buildAttempt({
          sendType: EMAIL_SEND_TYPE.NEW,
          emailId: null,
          payload: {
            to: [{ email: "to@example.com" }],
            cc: [{ email: "cc@example.com" }],
            subject: "Hi",
            body: "Body",
          },
        }),
      );

      await runSendJob();

      expect(provider.sendEmail).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ subject: "Hi" }),
      );
      expect(emailAdminService.trackEmailRecipients).toHaveBeenCalledWith(
        USER_ID,
        [{ email: "to@example.com" }, { email: "cc@example.com" }],
      );
      expect(pusherService.triggerEmailSendSucceeded).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          sendType: EMAIL_SEND_TYPE.NEW,
          emailId: undefined,
        }),
      );
    });
  });

  describe("compose follow-up", () => {
    const claimNewEmail = (expectedReplyHours?: number) =>
      sendQueueService.claimForSending.mockResolvedValue(
        buildAttempt({
          sendType: EMAIL_SEND_TYPE.NEW,
          emailId: null,
          payload: {
            to: [{ email: "to@example.com" }],
            subject: "Hi",
            body: "Body",
            expectedReplyHours,
          },
        }),
      );

    it("creates exactly one follow-up on the provider's real thread", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValue({
        sendEmail: jest.fn().mockResolvedValue(SENT),
      });
      claimNewEmail(FOLLOW_UP_HOURS);

      await runSendJob();

      expect(
        followUpsService.createFollowUpForSentMessage,
      ).toHaveBeenCalledTimes(1);
      expect(
        followUpsService.createFollowUpForSentMessage,
      ).toHaveBeenCalledWith(USER_ID, SENT.threadId, FOLLOW_UP_HOURS, {
        subject: "Hi",
      });
    });

    it("leaves no follow-up behind when the send fails", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValue({
        sendEmail: jest.fn().mockRejectedValue(new Error("gmail 400")),
      });
      sendQueueService.hasExhaustedAttempts.mockReturnValue(true);
      claimNewEmail(FOLLOW_UP_HOURS);

      await runSendJob();

      expect(
        followUpsService.createFollowUpForSentMessage,
      ).not.toHaveBeenCalled();
      expect(pusherService.triggerEmailSendFailed).toHaveBeenCalled();
    });

    it("creates no second follow-up when a retried job loses the claim", async () => {
      sendQueueService.claimForSending.mockResolvedValue(null);

      await runSendJob();

      expect(
        followUpsService.createFollowUpForSentMessage,
      ).not.toHaveBeenCalled();
    });

    it("still reports success when the follow-up could not be created", async () => {
      emailProviderManager.getPrimaryProvider.mockResolvedValue({
        sendEmail: jest.fn().mockResolvedValue(SENT),
      });
      followUpsService.createFollowUpForSentMessage.mockRejectedValue(
        new Error("db down"),
      );
      claimNewEmail(FOLLOW_UP_HOURS);

      await runSendJob();

      expect(pusherService.triggerEmailSendSucceeded).toHaveBeenCalled();
      expect(pusherService.triggerEmailSendFailed).not.toHaveBeenCalled();
    });

    it("does not touch follow-ups for a reply (RepliesService owns those)", async () => {
      sendQueueService.claimForSending.mockResolvedValue(buildAttempt());

      await runSendJob();

      expect(
        followUpsService.createFollowUpForSentMessage,
      ).not.toHaveBeenCalled();
    });
  });

  describe("idempotency", () => {
    it("does nothing when the attempt cannot be claimed", async () => {
      sendQueueService.claimForSending.mockResolvedValue(null);

      await runSendJob();

      expect(repliesService.sendReply).not.toHaveBeenCalled();
      expect(sendQueueService.markSent).not.toHaveBeenCalled();
      expect(pusherService.triggerEmailSendSucceeded).not.toHaveBeenCalled();
      expect(pusherService.triggerEmailSendFailed).not.toHaveBeenCalled();
    });
  });

  describe("failure handling", () => {
    it("releases the attempt and rethrows while retries remain", async () => {
      sendQueueService.claimForSending.mockResolvedValue(buildAttempt());
      sendQueueService.hasExhaustedAttempts.mockReturnValue(false);
      repliesService.sendReply.mockRejectedValue(new Error("gmail 503"));

      await expect(runSendJob()).rejects.toThrow("gmail 503");

      expect(sendQueueService.releaseForRetry).toHaveBeenCalledWith(
        SEND_ID,
        "gmail 503",
      );
      expect(pusherService.triggerEmailSendFailed).not.toHaveBeenCalled();
    });

    it("publishes a failure event once retries are exhausted", async () => {
      sendQueueService.claimForSending.mockResolvedValue(
        buildAttempt({ attempts: 3 }),
      );
      sendQueueService.hasExhaustedAttempts.mockReturnValue(true);
      repliesService.sendReply.mockRejectedValue(new Error("gmail 400"));

      await expect(runSendJob()).resolves.toBeUndefined();

      expect(sendQueueService.markFailed).toHaveBeenCalledWith(
        SEND_ID,
        EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED,
        "gmail 400",
      );
      expect(pusherService.triggerEmailSendFailed).toHaveBeenCalledWith(
        USER_ID,
        {
          sendId: SEND_ID,
          sendType: EMAIL_SEND_TYPE.REPLY,
          emailId: EMAIL_ID,
          reason: EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED,
        },
      );
      expect(sendQueueService.releaseForRetry).not.toHaveBeenCalled();
    });
  });

  describe("stalled-send sweeper", () => {
    it("re-enqueues sends whose job never ran", async () => {
      const stranded = buildAttempt({ status: EMAIL_SEND_STATUS.QUEUED });
      sendQueueService.findStaleQueued.mockResolvedValue([stranded]);

      await runSweepJob();

      expect(sendQueueService.requeue).toHaveBeenCalledWith(stranded);
      expect(pusherService.triggerEmailSendFailed).not.toHaveBeenCalled();
    });

    it("reports sends stranded mid-provider-call as unconfirmed", async () => {
      sendQueueService.findStaleSending.mockResolvedValue([buildAttempt()]);

      await runSweepJob();

      expect(sendQueueService.markFailed).toHaveBeenCalledWith(
        SEND_ID,
        EMAIL_SEND_FAILURE_REASON.UNCONFIRMED,
        expect.any(String),
      );
      expect(pusherService.triggerEmailSendFailed).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          reason: EMAIL_SEND_FAILURE_REASON.UNCONFIRMED,
        }),
      );
      // Never re-sent: a duplicate message is worse than an unconfirmed one.
      expect(sendQueueService.requeue).not.toHaveBeenCalled();
    });
  });
});
