import {
  notificationSubtypeDepth,
  notificationSubtypeMatches,
  notificationSubtypeMatchesAny,
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

  it("resolves GitHub PRs to the fine item:event:actor subtype, namespaced by platform", () => {
    expect(
      resolveNotificationSubtype({
        from: "octocat <notifications@github.com>",
        subject: "Re: [owner/repo] Add feature (PR #42)",
        body: "Merged #42 into main.\n\nhttps://github.com/owner/repo/pull/42",
      }),
    ).toBe("github:pr:merged:human");
  });

  it("resolves a bot issue comment to the bot actor kind", () => {
    expect(
      resolveNotificationSubtype({
        from: '"github-actions[bot]" <notifications@github.com>',
        subject: "Re: [owner/repo] Crash (Issue #7)",
        body: "https://github.com/owner/repo/issues/7",
        htmlBody: "<p><b>@github-actions[bot]</b> left a comment</p>",
      }),
    ).toBe("github:issue:comment:bot");
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

describe("notificationSubtypeMatches", () => {
  it("matches an identical subtype (case-insensitive, trimmed)", () => {
    expect(
      notificationSubtypeMatches(
        "github:pr:merged:human",
        " GitHub:PR:merged:human ",
      ),
    ).toBe(true);
  });

  it("lets a coarse pinned subtype match any finer refinement (legacy github:pr rules keep matching)", () => {
    expect(
      notificationSubtypeMatches("github:pr", "github:pr:comment:bot"),
    ).toBe(true);
    expect(
      notificationSubtypeMatches(
        "github:pr:comment",
        "github:pr:comment:human",
      ),
    ).toBe(true);
    expect(
      notificationSubtypeMatches("github:ci", "github:ci:run_failed"),
    ).toBe(true);
  });

  it("never lets a fine pinned subtype match a coarser email subtype", () => {
    expect(
      notificationSubtypeMatches("github:pr:merged:human", "github:pr"),
    ).toBe(false);
  });

  it("matches whole segments only, and rejects other sub-streams", () => {
    expect(
      notificationSubtypeMatches("github:pr", "github:prx:comment:bot"),
    ).toBe(false);
    expect(
      notificationSubtypeMatches(
        "github:pr:comment:bot",
        "github:pr:comment:human",
      ),
    ).toBe(false);
    expect(
      notificationSubtypeMatches("github:issue", "github:pr:comment:bot"),
    ).toBe(false);
  });

  it("is never satisfied by an unresolved email subtype or an empty pin", () => {
    expect(notificationSubtypeMatches("github:pr", undefined)).toBe(false);
    expect(notificationSubtypeMatches("github:pr", null)).toBe(false);
    expect(notificationSubtypeMatches("", "github:pr")).toBe(false);
  });

  it("matches a set when any member matches", () => {
    const humanPrUpdates = [
      "github:pr:comment:human",
      "github:pr:push:human",
      "github:pr:review_approved:human",
    ];
    expect(
      notificationSubtypeMatchesAny(humanPrUpdates, "github:pr:push:human"),
    ).toBe(true);
    expect(
      notificationSubtypeMatchesAny(humanPrUpdates, "github:pr:push:bot"),
    ).toBe(false);
    expect(
      notificationSubtypeMatchesAny(humanPrUpdates, "github:pr:merged:human"),
    ).toBe(false);
    expect(notificationSubtypeMatchesAny([], "github:pr:push:human")).toBe(
      false,
    );
  });

  it("reports subtype depth as the segment count", () => {
    expect(notificationSubtypeDepth("github:pr")).toBe(2);
    expect(notificationSubtypeDepth("github:pr:comment:bot")).toBe(4);
    expect(notificationSubtypeDepth("tag:alert")).toBe(2);
  });
});
