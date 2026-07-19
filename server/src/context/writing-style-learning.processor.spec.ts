import { WritingStyleLearningProcessor } from "./writing-style-learning.processor";

/**
 * Guards the sent-mail watermark: the learning cron must only fetch sent mail
 * it hasn't scanned before, advance the watermark after a scan (even an empty
 * one), and leave it untouched when the provider fetch fails so the window is
 * retried.
 */
describe("WritingStyleLearningProcessor — sent-mail watermark", () => {
  let processor: WritingStyleLearningProcessor;
  let usersService: { update: jest.Mock };
  let writingStyleLearningService: {
    getExampleCount: jest.Mock;
    learnFromSentEmailBodies: jest.Mock;
  };
  let emailProviderManager: { getPrimaryProvider: jest.Mock };
  let contextEmailDataService: { fetchSentThreadsFromProvider: jest.Mock };

  const user = (writingStyleCheckedUpTo: Date | null) =>
    ({
      id: "user-1",
      email: "user@example.com",
      writingStyleCheckedUpTo,
    }) as never;

  const runForUser = (testUser: never): Promise<{ processed: number }> =>
    (
      processor as unknown as {
        processUserWritingStyle: (
          testUser: never,
        ) => Promise<{ processed: number }>;
      }
    ).processUserWritingStyle(testUser);

  beforeEach(() => {
    usersService = { update: jest.fn().mockResolvedValue(undefined) };
    writingStyleLearningService = {
      getExampleCount: jest.fn().mockResolvedValue(0),
      learnFromSentEmailBodies: jest.fn().mockResolvedValue(undefined),
    };
    emailProviderManager = {
      getPrimaryProvider: jest.fn().mockResolvedValue({}),
    };
    contextEmailDataService = {
      fetchSentThreadsFromProvider: jest.fn().mockResolvedValue([]),
    };
    processor = new WritingStyleLearningProcessor(
      {} as never,
      usersService as never,
      writingStyleLearningService as never,
      emailProviderManager as never,
      contextEmailDataService as never,
      {} as never,
      {} as never,
      {
        withUserKey: jest.fn((_id: string, fn: () => unknown) => fn()),
      } as never,
    );
  });

  it("fetches from the watermark instead of the full 7-day window", async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await runForUser(user(oneHourAgo));

    const [, , fetchStart] =
      contextEmailDataService.fetchSentThreadsFromProvider.mock.calls[0];
    expect(fetchStart).toEqual(oneHourAgo);
  });

  it("advances the watermark after scanning an empty window", async () => {
    await runForUser(user(null));

    expect(usersService.update).toHaveBeenCalledWith("user-1", {
      writingStyleCheckedUpTo: expect.any(Date),
    });
  });

  it("leaves the watermark untouched when the provider fetch fails", async () => {
    contextEmailDataService.fetchSentThreadsFromProvider.mockRejectedValue(
      new Error("provider down"),
    );

    await runForUser(user(null));

    expect(usersService.update).not.toHaveBeenCalled();
  });
});
