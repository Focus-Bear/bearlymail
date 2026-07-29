import {
  resolveNotificationSubtype,
  structuralSubjectSubtype,
} from "./notification-subtype.util";

describe("structuralSubjectSubtype", () => {
  it("keys off a leading [tag], collapsing digits", () => {
    expect(structuralSubjectSubtype("[Build 1234] failed")).toBe("tag:build #");
    // A literal '#' in the tag is preserved alongside the digit placeholder.
    expect(structuralSubjectSubtype("[Build #1234] failed")).toBe(
      "tag:build ##",
    );
  });

  it("keys off a leading (TICKET-123) marker", () => {
    expect(structuralSubjectSubtype("(PROJ-988) Something changed")).toBe(
      "tag:proj-#",
    );
  });

  it("strips reply prefixes before reading the tag", () => {
    expect(structuralSubjectSubtype("Re: [Alerts] disk full")).toBe(
      "tag:alerts",
    );
  });

  it("returns null for ordinary subjects with no structural prefix", () => {
    expect(structuralSubjectSubtype("Your weekly newsletter")).toBeNull();
  });
});

describe("resolveNotificationSubtype", () => {
  it("resolves GitHub CI runs via the platform resolver, namespaced by platform", () => {
    expect(
      resolveNotificationSubtype({
        from: "notifications@github.com",
        subject: "[owner/repo] Run failed: CI",
        body: "https://github.com/owner/repo/actions/runs/1",
      }),
    ).toBe("github:ci:run_failed");
  });

  it("resolves GitHub PRs via the canonical URL, namespaced by platform", () => {
    expect(
      resolveNotificationSubtype({
        from: "notifications@github.com",
        subject: "[owner/repo] Add feature (#42)",
        body: "https://github.com/owner/repo/pull/42",
      }),
    ).toBe("github:pr");
  });

  it("falls back to the subject skeleton for a known platform with no dedicated resolver", () => {
    // Jira/Atlassian has no dedicated resolver yet — the general skeleton keys
    // off its `(PROJ-123)` subject marker, still namespaced by platform.
    expect(
      resolveNotificationSubtype({
        from: "jira@company.atlassian.net",
        subject: "(PROJ-123) Ticket assigned to you",
      }),
    ).toBe("atlassian:tag:proj-#");
  });

  it("uses the general skeleton for unrecognised notification senders", () => {
    expect(
      resolveNotificationSubtype({
        from: "alerts@monitoring.example.com",
        subject: "[Alert] CPU high",
      }),
    ).toBe("tag:alert");
  });

  it("returns null for ordinary senders with no structural subject", () => {
    expect(
      resolveNotificationSubtype({
        from: "friend@example.com",
        subject: "lunch tomorrow?",
      }),
    ).toBeNull();
  });
});
