import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { UsersService } from "../users/users.service";
import { SnoozeReleaseService } from "./snooze-release.service";

const USER_ID = "user-1";

function setup(snoozedThreadIds: string[]) {
  const emailThreadRepository = {
    find: jest.fn().mockResolvedValue(
      snoozedThreadIds.map((threadId, index) => ({
        id: `row-${index}`,
        threadId,
      })),
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const emailRepository = { update: jest.fn().mockResolvedValue(undefined) };
  const provider = { unsnoozeThread: jest.fn().mockResolvedValue(undefined) };
  const emailProviderManager = {
    getPrimaryProvider: jest.fn().mockResolvedValue(provider),
  };
  const userEncryptionService = {
    withUserKey: jest.fn((_userId: string, task: () => Promise<unknown>) =>
      task(),
    ),
  };
  const register = jest.fn();
  const usersService = { beforeAccountDeletion: { register } };

  const service = new SnoozeReleaseService(
    emailThreadRepository as unknown as Repository<EmailThread>,
    emailRepository as unknown as Repository<Email>,
    emailProviderManager as unknown as EmailProviderManager,
    userEncryptionService as unknown as UserEncryptionService,
    usersService as unknown as UsersService,
  );
  return {
    service,
    provider,
    emailProviderManager,
    emailThreadRepository,
    emailRepository,
    register,
  };
}

describe("SnoozeReleaseService", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("puts every snoozed thread back in the inbox and clears the snooze", async () => {
    const { service, provider, emailThreadRepository, emailRepository } = setup(
      ["t-1", "t-2"],
    );

    await expect(service.releaseAllSnoozedThreads(USER_ID)).resolves.toEqual({
      released: 2,
      stillSnoozed: 0,
    });
    expect(provider.unsnoozeThread).toHaveBeenCalledWith(USER_ID, "t-1");
    expect(provider.unsnoozeThread).toHaveBeenCalledWith(USER_ID, "t-2");
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { userId: USER_ID, threadId: "t-1" },
      { isSnoozed: false, snoozeUntil: null },
    );
    expect(emailRepository.update).toHaveBeenCalledWith(
      { userId: USER_ID, threadId: "t-2" },
      { isSnoozed: false, snoozeUntil: null },
    );
  });

  it("reads only plaintext columns of the user's snoozed threads", async () => {
    const { service, emailThreadRepository } = setup(["t-1"]);

    await service.releaseAllSnoozedThreads(USER_ID);

    expect(emailThreadRepository.find).toHaveBeenCalledWith({
      where: { userId: USER_ID, isSnoozed: true },
      select: { id: true, threadId: true },
    });
  });

  it("does nothing when no thread is snoozed", async () => {
    const { service, emailProviderManager } = setup([]);

    await expect(service.releaseAllSnoozedThreads(USER_ID)).resolves.toEqual({
      released: 0,
      stillSnoozed: 0,
    });
    expect(emailProviderManager.getPrimaryProvider).not.toHaveBeenCalled();
  });

  it("counts a thread the provider refuses (e.g. an expired token) as still snoozed", async () => {
    const { service, provider, emailThreadRepository } = setup(["t-1", "t-2"]);
    provider.unsnoozeThread.mockImplementation(
      async (_userId: string, threadId: string) => {
        if (threadId === "t-2") {
          throw new Error("invalid_grant");
        }
      },
    );

    await expect(service.releaseAllSnoozedThreads(USER_ID)).resolves.toEqual({
      released: 1,
      stillSnoozed: 1,
    });
    expect(emailThreadRepository.update).not.toHaveBeenCalledWith(
      { userId: USER_ID, threadId: "t-2" },
      expect.anything(),
    );
  });

  it("reports every thread as still snoozed when no mailbox is connected", async () => {
    const { service, emailProviderManager } = setup(["t-1", "t-2"]);
    emailProviderManager.getPrimaryProvider.mockResolvedValue(null);

    await expect(service.releaseAllSnoozedThreads(USER_ID)).resolves.toEqual({
      released: 0,
      stillSnoozed: 2,
    });
  });

  it("never throws, even when the provider lookup fails", async () => {
    const { service, emailProviderManager } = setup(["t-1"]);
    emailProviderManager.getPrimaryProvider.mockRejectedValue(
      new Error("decryption failed"),
    );

    await expect(service.releaseAllSnoozedThreads(USER_ID)).resolves.toEqual({
      released: 0,
      stillSnoozed: 1,
    });
  });

  it("restores snoozed threads before an account is deleted and reports what it couldn't", async () => {
    const { service, provider, register } = setup(["t-1", "t-2"]);
    provider.unsnoozeThread.mockRejectedValueOnce(new Error("invalid_grant"));
    service.onModuleInit();

    const beforeDeletion = register.mock.calls[0][0] as (
      userId: string,
    ) => Promise<{ stillSnoozedThreads: number }>;

    await expect(beforeDeletion(USER_ID)).resolves.toEqual({
      stillSnoozedThreads: 1,
    });
  });
});
