import { WritingStyleLearningProcessor } from "./writing-style-learning.processor";

/**
 * Guards the sent-mail watermark: the learning cron must only fetch sent mail
 * it hasn't scanned before, advance the watermark after a scan (even an empty
 * one), and leave it untouched when the provider fetch fails so the window is
 * retried.
 */
describe("WritingStyleLearningProcessor — sent-mail watermark", () => {
  let processor: WritingStyleLearningProcessor;
  let usersService: { update: jest.Mock; findOne?: jest.Mock };
  let writingStyleLearningService: {
    getExampleCount: jest.Mock;
    learnFromSentEmailBodies: jest.Mock;
  };
  let emailProviderManager: { getPrimaryProvider: jest.Mock };
  let contextEmailDataService: { fetchSentThreadsFromProvider: jest.Mock };
  let boss: { send: jest.Mock };

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
    boss = { send: jest.fn().mockResolvedValue("job-2") };
    usersService = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: "user-1", email: "user@example.com" }),
    } as never;
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
      boss as never,
      usersService as never,
      writingStyleLearningService as never,
      emailProviderManager as never,
      contextEmailDataService as never,
      {} as never,
      {
        putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
      } as never,
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

  describe("gradual backfill (LEARN_WRITING_STYLE_FROM_SENT)", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const runBackfill = (before?: string) =>
      (
        processor as unknown as {
          runWritingStyleBackfill: (
            jobData: { userId: string; before?: string },
            workerId: string,
          ) => Promise<void>;
        }
      ).runWritingStyleBackfill({ userId: "user-1", before }, "worker-1");

    it("scans one 7-day window ending at the cursor and re-queues the next window", async () => {
      const before = new Date("2026-09-01T00:00:00.000Z");
      contextEmailDataService.fetchSentThreadsFromProvider.mockResolvedValue([
        { body: "Hi, thanks for the update — I'll review tomorrow." },
      ]);

      await runBackfill(before.toISOString());

      const [, , windowStart, windowEnd, limit] =
        contextEmailDataService.fetchSentThreadsFromProvider.mock.calls[0];
      expect(windowEnd).toEqual(before);
      expect(windowStart).toEqual(new Date(before.getTime() - 7 * DAY_MS));
      expect(limit).toBe(10);
      expect(
        writingStyleLearningService.learnFromSentEmailBodies,
      ).toHaveBeenCalledWith("user-1", [
        "Hi, thanks for the update — I'll review tomorrow.",
      ]);
      expect(boss.send).toHaveBeenCalledWith(
        "learn-writing-style-from-sent",
        { userId: "user-1", before: windowStart.toISOString() },
        expect.objectContaining({
          singletonKey: `learn-writing-style-user-1-${windowStart.getTime()}`,
          startAfter: expect.any(Date),
        }),
      );
    });

    it("stops (no re-queue) once the example target is met", async () => {
      writingStyleLearningService.getExampleCount.mockResolvedValue(20);

      await runBackfill();

      expect(
        contextEmailDataService.fetchSentThreadsFromProvider,
      ).not.toHaveBeenCalled();
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("stops once the 90-day lookback is exhausted", async () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * DAY_MS);

      await runBackfill(ninetyOneDaysAgo.toISOString());

      expect(
        contextEmailDataService.fetchSentThreadsFromProvider,
      ).not.toHaveBeenCalled();
      expect(boss.send).not.toHaveBeenCalled();
    });

    it("swallows provider failures so the job never retry-storms", async () => {
      contextEmailDataService.fetchSentThreadsFromProvider.mockRejectedValue(
        new Error("provider down"),
      );

      await expect(runBackfill()).resolves.toBeUndefined();
      expect(boss.send).not.toHaveBeenCalled();
    });
  });
});
