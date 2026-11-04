import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { Email } from "../database/entities/email.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { ReadStatusSyncProcessor } from "./read-status-sync.processor";

const USER_ID = "user-1";
const EMAIL_ID = "email-1";
const TARGET = { threadId: "gmail-thread-1", messageId: "gmail-message-1" };

describe("ReadStatusSyncProcessor", () => {
  let processor: ReadStatusSyncProcessor;
  const emailRepository = { findOne: jest.fn() };
  const syncReadStatus = jest.fn();
  const emailProviderManager = { getPrimaryProvider: jest.fn() };
  const userEncryptionService = {
    withUserKey: jest.fn((_userId: string, run: () => Promise<unknown>) =>
      run(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    syncReadStatus.mockResolvedValue(undefined);
    emailProviderManager.getPrimaryProvider.mockResolvedValue({
      syncReadStatus,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadStatusSyncProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: { work: jest.fn() } },
        { provide: getRepositoryToken(Email), useValue: emailRepository },
        { provide: EmailProviderManager, useValue: emailProviderManager },
        { provide: UserEncryptionService, useValue: userEncryptionService },
      ],
    }).compile();
    processor = module.get(ReadStatusSyncProcessor);
  });

  it("marks the thread read in the provider when the email is read", async () => {
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: true });

    await processor.handleReadStatusSync({
      userId: USER_ID,
      emailId: EMAIL_ID,
    });

    expect(emailRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: EMAIL_ID, userId: USER_ID } }),
    );
    expect(syncReadStatus).toHaveBeenCalledWith(USER_ID, TARGET, true);
  });

  it("marks the message unread in the provider when the email is unread", async () => {
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: false });

    await processor.handleReadStatusSync({
      userId: USER_ID,
      emailId: EMAIL_ID,
    });

    expect(syncReadStatus).toHaveBeenCalledWith(USER_ID, TARGET, false);
  });

  it("runs the provider call under the user's encryption key", async () => {
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: true });

    await processor.handleReadStatusSync({
      userId: USER_ID,
      emailId: EMAIL_ID,
    });

    expect(userEncryptionService.withUserKey).toHaveBeenCalledWith(
      USER_ID,
      expect.any(Function),
    );
  });

  it("skips providers that do not support read sync", async () => {
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: true });
    emailProviderManager.getPrimaryProvider.mockResolvedValue({});

    await expect(
      processor.handleReadStatusSync({ userId: USER_ID, emailId: EMAIL_ID }),
    ).resolves.toBeUndefined();
  });

  it("skips when no provider is connected", async () => {
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: true });
    emailProviderManager.getPrimaryProvider.mockResolvedValue(null);

    await processor.handleReadStatusSync({
      userId: USER_ID,
      emailId: EMAIL_ID,
    });

    expect(syncReadStatus).not.toHaveBeenCalled();
  });

  it("skips an email that no longer exists for this user", async () => {
    emailRepository.findOne.mockResolvedValue(null);

    await processor.handleReadStatusSync({
      userId: USER_ID,
      emailId: EMAIL_ID,
    });

    expect(emailProviderManager.getPrimaryProvider).not.toHaveBeenCalled();
    expect(syncReadStatus).not.toHaveBeenCalled();
  });

  it("logs a warning and rethrows a provider error so pg-boss retries", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    emailRepository.findOne.mockResolvedValue({ ...TARGET, isRead: true });
    syncReadStatus.mockRejectedValueOnce(new Error("Gmail 503"));

    await expect(
      processor.handleReadStatusSync({ userId: USER_ID, emailId: EMAIL_ID }),
    ).rejects.toThrow("Gmail 503");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`emailId=${EMAIL_ID}`),
    );
    warn.mockRestore();
  });
});
