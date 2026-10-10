import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  EMAIL_SEND_RETRY_LIMIT,
  EMAIL_SEND_STATUS,
  EMAIL_SEND_TYPE,
  MAX_EMAIL_SEND_ATTEMPTS,
} from "../constants/email-send.constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { EmailSendAttempt } from "../database/entities/email-send-attempt.entity";
import { JobPriority } from "../queue/job-priorities";
import { EmailSendQueueService } from "./email-send-queue.service";

const USER_ID = "user-1";
const SEND_ID = "send-1";

describe("EmailSendQueueService", () => {
  let service: EmailSendQueueService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let boss: { send: jest.Mock };
  let updateExecute: jest.Mock;

  beforeEach(async () => {
    updateExecute = jest.fn();
    repository = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: SEND_ID })),
      update: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: SEND_ID }),
      createQueryBuilder: jest.fn(() => ({
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => ({ execute: updateExecute }),
            }),
          }),
        }),
      })),
    };
    boss = { send: jest.fn().mockResolvedValue("job-1") };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSendQueueService,
        {
          provide: getRepositoryToken(EmailSendAttempt),
          useValue: repository,
        },
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss },
      ],
    }).compile();

    service = module.get(EmailSendQueueService);
  });

  describe("queueNewEmail", () => {
    it("persists the message before enqueueing and returns its id", async () => {
      const result = await service.queueNewEmail(USER_ID, {
        to: [{ email: "to@example.com" }],
        subject: "Hi",
        body: "Body",
      });

      expect(result).toEqual({
        sendId: SEND_ID,
        status: EMAIL_SEND_STATUS.QUEUED,
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          sendType: EMAIL_SEND_TYPE.NEW,
          status: EMAIL_SEND_STATUS.QUEUED,
        }),
      );
      // The row must exist before the job, or a worker could pick up an id
      // that has nothing behind it.
      expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(
        boss.send.mock.invocationCallOrder[0],
      );
    });

    it("enqueues at user-triggered HIGH priority, keyed by the attempt", async () => {
      await service.queueNewEmail(USER_ID, {
        to: [{ email: "to@example.com" }],
        subject: "Hi",
        body: "Body",
      });

      expect(boss.send).toHaveBeenCalledWith(
        JOB_NAMES.SEND_QUEUED_EMAIL,
        { userId: USER_ID, sendId: SEND_ID },
        expect.objectContaining({
          priority: JobPriority.HIGH,
          retryLimit: EMAIL_SEND_RETRY_LIMIT,
          singletonKey: `send-queued-email-${SEND_ID}`,
        }),
      );
    });
  });

  describe("queueReply", () => {
    it("records the source email so the worker can thread the reply", async () => {
      await service.queueReply(USER_ID, "email-1", {
        body: "Hello",
        isForward: false,
        keepInAction: false,
      });

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          sendType: EMAIL_SEND_TYPE.REPLY,
          emailId: "email-1",
        }),
      );
    });
  });

  describe("claimForSending", () => {
    it("returns the attempt when it won the queued -> sending transition", async () => {
      updateExecute.mockResolvedValue({ affected: 1 });

      await expect(service.claimForSending(SEND_ID)).resolves.toEqual({
        id: SEND_ID,
      });
    });

    it("returns null when another worker already claimed it", async () => {
      updateExecute.mockResolvedValue({ affected: 0 });

      await expect(service.claimForSending(SEND_ID)).resolves.toBeNull();
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe("hasExhaustedAttempts", () => {
    it("is true only once the retry budget is spent", () => {
      const attempt = { attempts: MAX_EMAIL_SEND_ATTEMPTS - 1 };
      expect(service.hasExhaustedAttempts(attempt as EmailSendAttempt)).toBe(
        false,
      );
      expect(
        service.hasExhaustedAttempts({
          attempts: MAX_EMAIL_SEND_ATTEMPTS,
        } as EmailSendAttempt),
      ).toBe(true);
    });
  });
});
