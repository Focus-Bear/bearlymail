import { EMAIL_MODES } from "../constants/domain-types";
import { EmailServiceDeps } from "./email-service-dependencies.provider";
import { EmailsService } from "./emails.service";

const USER_ID = "user-1";
const TIER_COUNTS = {
  veryHigh: 1,
  high: 0,
  medium: 0,
  low: 0,
  veryLow: 0,
  unprioritised: 0,
};

/**
 * Action and Follow Up both hold starred threads. The priority filter chips
 * showed the same counts on both tabs (and more than the tab held) because the
 * count query only looked at starCount.
 */
describe("EmailsService.getPriorityCounts", () => {
  const makeService = () => {
    const getPriorityCounts = jest.fn().mockResolvedValue(TIER_COUNTS);
    const getInboxSummary = jest.fn().mockResolvedValue({
      total: 2,
      categories: [
        { id: null, name: "Other", count: 1, threadIds: ["thread-a"] },
        { id: "cat-1", name: "Work", count: 1, threadIds: ["thread-b"] },
      ],
    });
    const deps = {
      emailStatusService: { getPriorityCounts },
      emailInboxService: { getInboxSummary },
    } as unknown as EmailServiceDeps;
    return {
      service: new EmailsService(deps),
      getPriorityCounts,
      getInboxSummary,
    };
  };

  it.each([EMAIL_MODES.ACTION, EMAIL_MODES.FOLLOW_UP])(
    "counts only the threads on the %s tab",
    async (mode) => {
      const { service, getPriorityCounts, getInboxSummary } = makeService();

      await service.getPriorityCounts(USER_ID, mode);

      expect(getInboxSummary).toHaveBeenCalledWith(USER_ID, mode, {
        includeThreadIds: true,
      });
      expect(getPriorityCounts).toHaveBeenCalledWith(USER_ID, mode, [
        "thread-a",
        "thread-b",
      ]);
    },
  );

  it("keeps the single-query path for triage", async () => {
    const { service, getPriorityCounts, getInboxSummary } = makeService();

    await service.getPriorityCounts(USER_ID, EMAIL_MODES.TRIAGE);

    expect(getInboxSummary).not.toHaveBeenCalled();
    expect(getPriorityCounts).toHaveBeenCalledWith(USER_ID, EMAIL_MODES.TRIAGE);
  });
});
