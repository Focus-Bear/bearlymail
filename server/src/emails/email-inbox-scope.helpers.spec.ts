import { INBOX_FILTER_VALUES } from "../constants/domain-types";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  appendInboxScopeFilters,
  buildUserCategoryJoinSql,
  inboxRowLimit,
  isUserSentLast,
  shouldKeepInActionMode,
} from "./email-inbox-scope.helpers";

/**
 * Issue #2062: the category summary (header counts) and the thread query (rows)
 * must be built from one scope definition. These tests pin the shared pieces so
 * a change to one side cannot silently diverge from the other.
 */
describe("appendInboxScopeFilters", () => {
  const ACCOUNT = "acc-1";

  it("produces the same fragments and param order for the summary and the list aliases", () => {
    const filters = {
      accountIds: [ACCOUNT],
      minPriority: 30,
      maxPriority: 50,
      assigneeId: "user-2",
    };
    const summaryParams: (string | number)[] = ["user-1"];
    const listParams: (string | number)[] = ["user-1"];

    const summary = appendInboxScopeFilters(
      filters,
      2,
      summaryParams,
      "latest_email",
    );
    const list = appendInboxScopeFilters(filters, 2, listParams, "e");

    expect(summaryParams).toEqual(listParams);
    expect(summary.paramIndex).toBe(list.paramIndex);
    // Only the alias of the representative-email lateral differs.
    expect(summary.additionalFilters.replace(/latest_email\./g, "e.")).toBe(
      list.additionalFilters,
    );
  });

  it("tests the account filter on the representative email row of the given alias", () => {
    const params: (string | number)[] = ["user-1"];
    const { additionalFilters } = appendInboxScopeFilters(
      { accountIds: [ACCOUNT] },
      2,
      params,
      "latest_email",
    );
    expect(additionalFilters).toContain(
      'latest_email."googleAccountId" IN ($2)',
    );
    expect(additionalFilters).toContain(
      'latest_email."office365AccountId" IN ($3)',
    );
    expect(additionalFilters).toContain('latest_email."zohoAccountId" IN ($4)');
    expect(params).toEqual(["user-1", ACCOUNT, ACCOUNT, ACCOUNT]);
  });

  it("supports the unassigned sentinel without binding a param", () => {
    const params: (string | number)[] = ["user-1"];
    const { additionalFilters, paramIndex } = appendInboxScopeFilters(
      { assigneeId: INBOX_FILTER_VALUES.UNASSIGNED },
      2,
      params,
      "e",
    );
    expect(additionalFilters).toContain('thread."assigneeId" IS NULL');
    expect(paramIndex).toBe(2);
    expect(params).toEqual(["user-1"]);
  });

  it("adds nothing when there are no filters", () => {
    const params: (string | number)[] = ["user-1"];
    const { additionalFilters, paramIndex } = appendInboxScopeFilters(
      undefined,
      2,
      params,
      "e",
    );
    expect(additionalFilters).toBe("");
    expect(paramIndex).toBe(2);
  });
});

describe("buildUserCategoryJoinSql", () => {
  it("restricts the category join to the user's own EMAIL_CATEGORY contexts", () => {
    const sql = buildUserCategoryJoinSql("$1");
    expect(sql).toContain('uc."contextId" = thread."categoryId"');
    expect(sql).toContain('uc."userId" = $1');
    expect(sql).toContain(`uc."contextKey" = 'EMAIL_CATEGORY'`);
  });
});

describe("inboxRowLimit", () => {
  it("uses the larger cap for action mode and the default elsewhere", () => {
    expect(inboxRowLimit("action")).toBe(QUERY_LIMITS.INBOX_PROCESS_TOTAL);
    expect(inboxRowLimit("triage")).toBe(QUERY_LIMITS.INBOX_TOTAL);
    expect(inboxRowLimit("follow-up")).toBe(QUERY_LIMITS.INBOX_TOTAL);
  });
});

describe("action-mode rule", () => {
  const USER = "me@example.com";

  it("matches the sender address exactly, case-insensitively", () => {
    expect(isUserSentLast("Me@Example.com", USER)).toBe(true);
    expect(isUserSentLast("notme@example.com", USER)).toBe(false);
    expect(isUserSentLast(undefined, USER)).toBe(false);
  });

  it("keeps threads where someone else sent last", () => {
    expect(shouldKeepInActionMode({ from: "them@example.com" }, USER)).toBe(
      true,
    );
  });

  it("drops threads where the user sent last", () => {
    expect(shouldKeepInActionMode({ from: USER }, USER)).toBe(false);
  });

  it("keeps user-sent-last threads that were auto-responded or pinned to Action", () => {
    expect(
      shouldKeepInActionMode({ from: USER, sentByAutoResponder: true }, USER),
    ).toBe(true);
    expect(
      shouldKeepInActionMode({ from: USER, keepInAction: true }, USER),
    ).toBe(true);
  });
});
