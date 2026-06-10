import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { LLMService } from "../llm/llm.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSearchService } from "./email-search.service";
import { RawSearchEmail } from "./email-search.types";
import { EmailSearchRankingService } from "./email-search-ranking.service";

/**
 * Focused tests for syncAndFetchMatchedEmails — the resolver that turns provider
 * search hits into local DB emails. Regression cover for the bug where a
 * just-arrived hit (present in the provider results but not yet synced to the
 * local DB) was silently dropped because the method returned early on the first
 * DB hit instead of syncing the missing ones.
 */
describe("EmailSearchService.syncAndFetchMatchedEmails", () => {
  let service: EmailSearchService;
  let mockRepo: { find: jest.Mock };
  let mockProviderManager: { getProvider: jest.Mock };
  let mockSyncEmails: jest.Mock;

  const dbEmail = (id: string, messageId: string): Email =>
    ({
      id,
      messageId,
      threadId: `thread-${messageId}`,
      from: `${id}@example.com`,
      subject: `Subject ${id}`,
      body: "body",
      receivedAt: new Date("2026-06-01T00:00:00.000Z"),
    }) as unknown as Email;

  const rawHit = (messageId: string): RawSearchEmail =>
    ({
      messageId,
      threadId: `thread-${messageId}`,
      _providerType: "gmail",
      receivedAt: new Date("2026-06-01T00:00:00.000Z"),
    }) as unknown as RawSearchEmail;

  const callSync = (
    rawEmails: RawSearchEmail[],
    opts: { skipSync?: boolean; maxSyncThreads?: number } = {},
  ): Promise<{ emails: Email[]; noResultsReason?: string }> =>
    (
      service as unknown as {
        syncAndFetchMatchedEmails: (
          userId: string,
          rawEmails: RawSearchEmail[],
          onProgress?: unknown,
          skipSync?: boolean,
          maxSyncThreads?: number,
        ) => Promise<{ emails: Email[]; noResultsReason?: string }>;
      }
    ).syncAndFetchMatchedEmails(
      "user-1",
      rawEmails,
      undefined,
      opts.skipSync,
      opts.maxSyncThreads,
    );

  beforeEach(() => {
    mockRepo = { find: jest.fn() };
    mockSyncEmails = jest.fn().mockResolvedValue(undefined);
    mockProviderManager = {
      getProvider: jest.fn().mockResolvedValue({ syncEmails: mockSyncEmails }),
    };
    service = new EmailSearchService(
      mockRepo as unknown as Repository<Email>,
      mockProviderManager as unknown as EmailProviderManager,
      {} as unknown as LLMService,
      {} as unknown as EmailSearchRankingService,
    );
  });

  it("syncs the missing hit and includes it, even when other hits are already in the DB", async () => {
    const raw = [rawHit("m-a"), rawHit("m-b")];
    // First lookup: only A is local. After syncing B's thread: both present.
    mockRepo.find
      .mockResolvedValueOnce([dbEmail("a", "m-a")])
      .mockResolvedValueOnce([dbEmail("a", "m-a"), dbEmail("b", "m-b")]);

    const result = await callSync(raw, { maxSyncThreads: 5 });

    // The missing hit's thread was synced...
    expect(mockSyncEmails).toHaveBeenCalledTimes(1);
    expect(mockSyncEmails).toHaveBeenCalledWith("user-1", {
      threadIds: ["thread-m-b"],
      isContinuation: true,
    });
    // ...and the previously-missing email now appears in the results.
    expect(result.emails.map((email) => email.messageId)).toEqual([
      "m-a",
      "m-b",
    ]);
  });

  it("does not sync when every hit is already local", async () => {
    mockRepo.find.mockResolvedValueOnce([dbEmail("a", "m-a")]);

    const result = await callSync([rawHit("m-a")]);

    expect(mockProviderManager.getProvider).not.toHaveBeenCalled();
    expect(mockSyncEmails).not.toHaveBeenCalled();
    expect(result.emails.map((email) => email.messageId)).toEqual(["m-a"]);
  });

  it("defers syncing under skipSync, returning only the already-local hits", async () => {
    mockRepo.find.mockResolvedValueOnce([dbEmail("a", "m-a")]);

    const result = await callSync([rawHit("m-a"), rawHit("m-b")], {
      skipSync: true,
    });

    expect(mockSyncEmails).not.toHaveBeenCalled();
    expect(result.emails.map((email) => email.messageId)).toEqual(["m-a"]);
  });
});
