/**
 * Category accordion loads (`GET /emails/inbox?categoryIds=…`) are tracked under
 * their own performance budget and must resolve the user's category names once
 * per request — not once for the SQL scope and again for the post-query filter.
 */
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { EmailInboxService } from "./email-inbox.service";

const USER = "user-1";
const CATEGORY_ID = "11111111-1111-1111-1111-111111111111";

function buildService() {
  const emailRepository = {
    query: jest.fn().mockResolvedValue([{ id: "email-1" }]),
  };
  const userContextRepository = {
    find: jest
      .fn()
      .mockResolvedValue([
        { contextId: CATEGORY_ID, contextValue: "Newsletters" },
      ]),
  };
  const blockedSendersService = {
    getBlockedEmailHashes: jest.fn().mockResolvedValue([]),
    filterBlockedEmails: jest.fn().mockResolvedValue([]),
  };
  const emailInboxCategoryService = {
    resolveUserEmailLower: jest.fn().mockResolvedValue(null),
  };
  const emailInboxDecryptService = {
    decryptRawEmailRow: jest.fn(() => ({
      id: "email-1",
      from: "news@example.com",
      categoryId: CATEGORY_ID,
      category: "Newsletters",
    })),
    convertEmailLabels: jest.fn().mockResolvedValue(undefined),
    assignCategoryIds: jest.fn(),
  };
  const emailFollowUpService = {
    filterActionModeEmails: jest.fn(async (_userId, emails) => emails),
  };
  const cloudWatchService = {
    putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
  };

  const service = new EmailInboxService(
    emailRepository as never,
    {} as never,
    userContextRepository as never,
    blockedSendersService as never,
    emailFollowUpService as never,
    emailInboxCategoryService as never,
    emailInboxDecryptService as never,
    cloudWatchService as never,
  );
  return { service, userContextRepository, cloudWatchService };
}

describe("EmailInboxService.getInbox — category-scoped fetch", () => {
  it("loads the user's categories once and returns the category's threads", async () => {
    const { service, userContextRepository } = buildService();

    const result = await service.getInbox({
      userId: USER,
      mode: "triage",
      filters: { categoryIds: [CATEGORY_ID] },
    });

    expect(userContextRepository.find).toHaveBeenCalledTimes(1);
    expect(result.emails.map((email) => email.id)).toEqual(["email-1"]);
  });

  it("reports under the category operation with the category budget", async () => {
    const { service, cloudWatchService } = buildService();

    await service.getInbox({
      userId: USER,
      mode: "triage",
      filters: { categoryIds: [CATEGORY_ID] },
    });

    expect(cloudWatchService.putPerformanceBudgetMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetName: "getInboxCategory(triage)",
        budgetMs: PERFORMANCE_BUDGETS.INBOX_CATEGORY_FETCH,
      }),
    );
  });

  it("uses the process-mode category budget for action mode", async () => {
    const { service, cloudWatchService } = buildService();

    await service.getInbox({
      userId: USER,
      mode: "action",
      filters: { categoryIds: [CATEGORY_ID] },
    });

    expect(cloudWatchService.putPerformanceBudgetMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetName: "getInboxCategory(action)",
        budgetMs: PERFORMANCE_BUDGETS.INBOX_CATEGORY_FETCH_PROCESS,
      }),
    );
  });

  it("keeps full inbox loads on the getInbox operation without loading categories", async () => {
    const { service, userContextRepository, cloudWatchService } =
      buildService();

    await service.getInbox({ userId: USER, mode: "triage" });

    expect(userContextRepository.find).not.toHaveBeenCalled();
    expect(cloudWatchService.putPerformanceBudgetMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetName: "getInbox(triage)",
        budgetMs: PERFORMANCE_BUDGETS.INBOX_TOTAL,
      }),
    );
  });
});
