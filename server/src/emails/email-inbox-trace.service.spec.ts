import { EmailInboxTraceService } from "./email-inbox-trace.service";

/**
 * Issue #2062: the trace must replay the real per-category fetch and compare the
 * renderer's summary entry against a fresh server summary, so a section whose
 * count came from an older state is reported as stale instead of "(unknown)".
 */
describe("EmailInboxTraceService", () => {
  const USER = "user-1";
  const CATEGORY = "11111111-1111-1111-1111-111111111111";
  const PRESENT = "thread-present";
  const GONE = "thread-gone";

  function makeEmail(threadId: string) {
    return {
      id: `email-${threadId}`,
      threadId,
      categoryId: CATEGORY,
      category: "Security & Compliance",
      from: "them@example.com",
    };
  }

  function makeService(overrides: {
    summaryCategories?: Array<{
      id: string | null;
      name: string;
      count: number;
      threadIds: string[];
    }>;
    rawRows?: Array<{ threadId: string }>;
  }) {
    const emailInboxService = {
      getInboxSummary: jest.fn().mockResolvedValue({
        total: overrides.summaryCategories?.length ?? 0,
        categories: overrides.summaryCategories ?? [],
      }),
      runInboxQuery: jest.fn().mockResolvedValue(overrides.rawRows ?? []),
      decryptRawEmailRow: jest.fn((row: { threadId: string }) =>
        makeEmail(row.threadId),
      ),
    };
    const blockedSendersService = {
      filterBlockedEmails: jest.fn().mockResolvedValue([]),
    };
    const emailFollowUpService = {
      filterActionModeEmails: jest.fn(
        async (_userId: string, emails: unknown[]) => emails,
      ),
      filterFollowUpModeEmails: jest.fn(
        async (_userId: string, emails: unknown[]) => emails,
      ),
    };
    const usersService = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new EmailInboxTraceService(
      emailInboxService as never,
      blockedSendersService as never,
      emailFollowUpService as never,
      usersService as never,
    );
    return { service, emailInboxService };
  }

  it("replays the real per-category fetch: same mode, filters and SQL narrowing", async () => {
    const { service, emailInboxService } = makeService({
      rawRows: [{ threadId: PRESENT }],
    });

    await service.traceCategoryFetch(USER, CATEGORY, "action", {
      filters: { accountIds: ["acc-1"], minPriority: 30 },
    });

    expect(emailInboxService.runInboxQuery).toHaveBeenCalledWith(
      USER,
      "action",
      { accountIds: ["acc-1"], minPriority: 30, categoryIds: [CATEGORY] },
    );
    expect(emailInboxService.getInboxSummary).toHaveBeenCalledWith(
      USER,
      "action",
      { accountIds: ["acc-1"], minPriority: 30, includeThreadIds: true },
    );
  });

  it("flags the renderer's summary as stale when it lists a thread the fresh summary and query lack", async () => {
    const { service } = makeService({
      summaryCategories: [
        {
          id: CATEGORY,
          name: "Security & Compliance",
          count: 1,
          threadIds: [PRESENT],
        },
      ],
      rawRows: [{ threadId: PRESENT }],
    });

    const trace = await service.traceCategoryFetch(USER, CATEGORY, "action", {
      clientSummary: {
        name: "Security & Compliance",
        threadIds: [PRESENT, GONE],
      },
    });

    expect(trace.summaryStale).toBe(true);
    expect(trace.clientSummaryThreadIds).toEqual([PRESENT, GONE]);
    expect(trace.serverSummaryThreadIds).toEqual([PRESENT]);
    expect(trace.categoryName).toBe("Security & Compliance");
    expect(trace.afterModeFilterThreadIds).toEqual([PRESENT]);
  });

  it("reports the renderer's name and no staleness flag when the summaries agree", async () => {
    const { service } = makeService({
      summaryCategories: [
        {
          id: CATEGORY,
          name: "Security & Compliance",
          count: 1,
          threadIds: [PRESENT],
        },
      ],
      rawRows: [{ threadId: PRESENT }],
    });

    const trace = await service.traceCategoryFetch(USER, CATEGORY, "action", {
      clientSummary: { threadIds: [PRESENT] },
    });

    expect(trace.summaryStale).toBe(false);
    expect(trace.summaryOnlyThreadIds).toEqual([]);
  });

  it("falls back to the renderer's name when the fresh summary no longer has the category", async () => {
    const { service } = makeService({ summaryCategories: [], rawRows: [] });

    const trace = await service.traceCategoryFetch(USER, CATEGORY, "action", {
      clientSummary: { name: "Newsletters", threadIds: [GONE] },
    });

    expect(trace.categoryName).toBe("Newsletters");
    expect(trace.summaryStale).toBe(true);
    expect(trace.serverSummaryThreadIds).toEqual([]);
    expect(trace.summaryOnlyThreadIds).toEqual([]);
  });

  it("does not report staleness when the caller supplied no client summary", async () => {
    const { service } = makeService({ summaryCategories: [], rawRows: [] });

    const trace = await service.traceCategoryFetch(USER, CATEGORY, "triage");

    expect(trace.clientSummaryThreadIds).toBeNull();
    expect(trace.summaryStale).toBe(false);
    expect(trace.categoryName).toBe("(unknown)");
  });
});
