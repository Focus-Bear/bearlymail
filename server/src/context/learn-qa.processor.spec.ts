import { ContextEmailDataService } from "./context-gmail-data.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";
import { LearnQaProcessor } from "./learn-qa.processor";

describe("LearnQaProcessor", () => {
  let processor: LearnQaProcessor;

  const boss = { send: jest.fn(), work: jest.fn() };
  const usersService = { findOne: jest.fn() };
  const emailProviderManager = { getPrimaryProvider: jest.fn() };
  const contextEmailDataService = { fetchSentThreadsFromProvider: jest.fn() };
  const qaExtractionService = { extractQAndAFromSentEmails: jest.fn() };
  const cloudWatchService = {
    putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
  };
  // withUserKey should just run the task in tests
  const userEncryptionService = {
    withUserKey: jest.fn((_userId: string, task: () => Promise<unknown>) =>
      task(),
    ),
  };

  // Invoke the private per-user handler directly.
  const learnForUser = (userId: string) =>
    (
      processor as unknown as {
        learnForUser: (userId: string, workerId: string) => Promise<void>;
      }
    ).learnForUser(userId, "test-worker");

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new LearnQaProcessor(
      boss as never,
      usersService as never,
      emailProviderManager as never,
      contextEmailDataService as unknown as ContextEmailDataService,
      qaExtractionService as unknown as ContextQaExtractionService,
      cloudWatchService as never,
      userEncryptionService as never,
    );
  });

  it("extracts Q&A from recent sent emails within the user's key context", async () => {
    usersService.findOne.mockResolvedValue({ email: "me@example.com" });
    emailProviderManager.getPrimaryProvider.mockResolvedValue({});
    const sent = [
      {
        id: "1",
        body: "By Friday.",
        subject: "Re: update",
        receivedAt: new Date(),
      },
    ];
    contextEmailDataService.fetchSentThreadsFromProvider.mockResolvedValue(
      sent,
    );

    await learnForUser("user1");

    expect(userEncryptionService.withUserKey).toHaveBeenCalledWith(
      "user1",
      expect.any(Function),
    );
    expect(qaExtractionService.extractQAndAFromSentEmails).toHaveBeenCalledWith(
      "user1",
      sent,
    );
  });

  it("does nothing when the user has no email", async () => {
    usersService.findOne.mockResolvedValue({ email: null });

    await learnForUser("user1");

    expect(emailProviderManager.getPrimaryProvider).not.toHaveBeenCalled();
    expect(
      qaExtractionService.extractQAndAFromSentEmails,
    ).not.toHaveBeenCalled();
  });

  it("does not extract when there are no recent sent emails", async () => {
    usersService.findOne.mockResolvedValue({ email: "me@example.com" });
    emailProviderManager.getPrimaryProvider.mockResolvedValue({});
    contextEmailDataService.fetchSentThreadsFromProvider.mockResolvedValue([]);

    await learnForUser("user1");

    expect(
      qaExtractionService.extractQAndAFromSentEmails,
    ).not.toHaveBeenCalled();
  });

  it("swallows extraction errors (best-effort learning must not throw)", async () => {
    usersService.findOne.mockResolvedValue({ email: "me@example.com" });
    emailProviderManager.getPrimaryProvider.mockResolvedValue({});
    contextEmailDataService.fetchSentThreadsFromProvider.mockResolvedValue([
      { id: "1", body: "x", subject: "s", receivedAt: new Date() },
    ]);
    qaExtractionService.extractQAndAFromSentEmails.mockRejectedValue(
      new Error("LLM down"),
    );

    await expect(learnForUser("user1")).resolves.toBeUndefined();
  });
});
