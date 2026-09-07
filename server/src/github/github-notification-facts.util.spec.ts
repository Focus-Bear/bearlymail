import {
  buildGithubNotificationSubtype,
  detectGithubNotificationEvent,
  detectGithubNotificationFacts,
  detectGithubNotificationReason,
  detectGithubSubtype,
  isGithubBotLogin,
  parseGithubActorLogin,
} from "./github-notification-facts.util";

const HUMAN_FROM = "octocat <notifications@github.com>";
const BOT_FROM = '"dependabot[bot]" <notifications@github.com>';
const PR_URL = "https://github.com/owner/repo/pull/430";
const ISSUE_URL = "https://github.com/owner/repo/issues/2300";

/** Mirrors the plain-text layout of a real GitHub notification. */
function githubBody(
  opener: string,
  url: string,
  reasonFooter = "you are subscribed to this thread",
): string {
  return `${opener}\n\n-- \nReply to this email directly or view it on GitHub:\n${url}\nYou are receiving this because ${reasonFooter}.\n\nMessage ID: <owner/repo/pull/430/1@github.com>`;
}

/** The issue-comment template only says "left a comment" in its HTML part. */
function commentHtml(login: string, url: string): string {
  return `<p><b>@${login}</b> left a comment (<a href="${url}">owner/repo#430</a>)</p><p>Looks good to me.</p><p>—<br>Reply to this email directly, <a href="${url}#issuecomment-1">view it on GitHub</a>, or unsubscribe.<br>You are receiving this because you were mentioned.</p>`;
}

describe("parseGithubActorLogin / isGithubBotLogin", () => {
  it("reads the login from a quoted or bare From display name", () => {
    expect(parseGithubActorLogin(BOT_FROM)).toBe("dependabot[bot]");
    expect(parseGithubActorLogin(HUMAN_FROM)).toBe("octocat");
  });

  it("returns null when the From header has no display name", () => {
    expect(parseGithubActorLogin("notifications@github.com")).toBeNull();
    expect(parseGithubActorLogin("<notifications@github.com>")).toBeNull();
  });

  it("treats [bot]-suffixed and known bare bot logins as bots, everything else as human", () => {
    expect(isGithubBotLogin("dependabot[bot]")).toBe(true);
    expect(isGithubBotLogin("github-actions[bot]")).toBe(true);
    expect(isGithubBotLogin("Copilot")).toBe(true);
    expect(isGithubBotLogin("octocat")).toBe(false);
    expect(isGithubBotLogin("robotics-team")).toBe(false);
  });
});

describe("detectGithubNotificationEvent", () => {
  const cases: Array<[string, string, string]> = [
    [
      "merged",
      "Re: [owner/repo] Add feature (PR #430)",
      "Merged #430 into main.",
    ],
    ["closed", "Re: [owner/repo] Add feature (PR #430)", "Closed #430."],
    [
      "closed",
      "Re: [owner/repo] Bug (Issue #2300)",
      "Closed #2300 as not planned.",
    ],
    [
      "closed",
      "Re: [owner/repo] Bug (Issue #2300)",
      "Closed #2300 as completed.",
    ],
    ["reopened", "Re: [owner/repo] Bug (Issue #2300)", "Reopened #2300."],
    [
      "review_requested",
      "Re: [owner/repo] Add feature (PR #430)",
      "@octocat requested your review on: #430 Add feature.",
    ],
    [
      "review_approved",
      "Re: [owner/repo] Add feature (PR #430)",
      "@octocat approved this pull request.",
    ],
    [
      "changes_requested",
      "Re: [owner/repo] Add feature (PR #430)",
      "@octocat requested changes on this pull request.",
    ],
    [
      "comment",
      "Re: [owner/repo] Add feature (PR #430)",
      "@octocat commented on this pull request.\n\n> line\n\nnit: rename",
    ],
    [
      "comment",
      "Re: [owner/repo] Bug (Issue #2300)",
      "@octocat left a comment (owner/repo#2300)\n\nStill broken.",
    ],
    [
      "push",
      "Re: [owner/repo] Add feature (PR #430)",
      "@octocat pushed 2 commits.\n\nabc1234  fix tests\ndef5678  lint",
    ],
    [
      "assigned",
      "Re: [owner/repo] Bug (Issue #2300)",
      "Assigned #2300 to @octocat.",
    ],
    [
      "mentioned",
      "Re: [owner/repo] Bug (Issue #2300)",
      "@octocat mentioned you.",
    ],
    [
      "opened",
      "[owner/repo] Add feature (PR #430)",
      "Adds the thing.\n\nYou can view, comment on, or merge this pull request online at:\n\n  https://github.com/owner/repo/pull/430",
    ],
  ];

  it.each(cases)(
    "detects %s from the body opener",
    (event, subject, opener) => {
      expect(detectGithubNotificationEvent(subject, opener)).toBe(event);
    },
  );

  it("treats a thread's first message (no reply prefix) with no opener as opened", () => {
    expect(
      detectGithubNotificationEvent(
        "[owner/repo] Crash on launch (Issue #2300)",
        "Steps to reproduce: open the app.",
      ),
    ).toBe("opened");
  });

  it("treats a follow-up (Re:) with an unrecognised opener as other", () => {
    expect(
      detectGithubNotificationEvent(
        "Re: [owner/repo] Crash on launch (Issue #2300)",
        "@octocat marked this pull request as ready for review.",
      ),
    ).toBe("other");
  });

  it("keeps a comment that quotes a state-change opener as a comment", () => {
    expect(
      detectGithubNotificationEvent(
        "Re: [owner/repo] Add feature (PR #430)",
        "@octocat left a comment (owner/repo#430)\n\nSee Merged #12 into main earlier.",
      ),
    ).toBe("comment");
  });
});

describe("detectGithubNotificationReason", () => {
  it.each([
    ["mention", "you were mentioned"],
    ["review_requested", "your review was requested"],
    ["author", "you authored the thread"],
    ["subscribed", "you are subscribed to this thread"],
    ["assign", "you were assigned"],
    ["comment", "you commented"],
    ["state_change", "you modified the open/close state"],
    ["team_mention", "you are on a team that was mentioned"],
  ])("maps the footer to reason %s", (reason, footer) => {
    expect(
      detectGithubNotificationReason(
        githubBody("Merged #430 into main.", PR_URL, footer),
      ),
    ).toBe(reason);
  });

  it("returns null when there is no footer", () => {
    expect(detectGithubNotificationReason("Merged #430 into main.")).toBeNull();
  });
});

describe("detectGithubNotificationFacts", () => {
  it("returns null for non-GitHub senders even with GitHub-looking content", () => {
    expect(
      detectGithubNotificationFacts(
        "octocat <octocat@example.com>",
        "Re: [owner/repo] Add feature (PR #430)",
        githubBody("Merged #430 into main.", PR_URL),
      ),
    ).toBeNull();
  });

  it("returns null for GitHub mail with no PR/issue URL or subject marker", () => {
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "[owner/repo] Weekly digest",
        "Here is what happened this week.",
      ),
    ).toBeNull();
  });

  it("builds bot facts for a dependabot PR comment (HTML-only opener)", () => {
    const facts = detectGithubNotificationFacts(
      BOT_FROM,
      "Re: [owner/repo] Bump ws (PR #430)",
      "Superseded by #431.",
      commentHtml("dependabot[bot]", PR_URL),
    );
    expect(facts).toEqual({
      item: "pr",
      event: "comment",
      actorKind: "bot",
      actorLogin: "dependabot[bot]",
      reason: "mention",
    });
  });

  it("builds human facts for a merged PR with the reason footer", () => {
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "Re: [owner/repo] Add feature (PR #430)",
        githubBody("Merged #430 into main.", PR_URL, "you authored the thread"),
      ),
    ).toEqual({
      item: "pr",
      event: "merged",
      actorKind: "human",
      actorLogin: "octocat",
      reason: "author",
    });
  });

  it("builds issue facts for a closed issue", () => {
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "Re: [owner/repo] Crash on launch (Issue #2300)",
        githubBody(
          "Closed #2300 as completed.",
          ISSUE_URL,
          "you modified the open/close state",
        ),
      ),
    ).toMatchObject({ item: "issue", event: "closed", reason: "state_change" });
  });

  it("classifies a new issue (first message, no opener) as opened by a human", () => {
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "[owner/repo] Crash on launch (Issue #2300)",
        githubBody("Steps to reproduce: open the app.", ISSUE_URL),
      ),
    ).toMatchObject({ item: "issue", event: "opened", actorKind: "human" });
  });

  it("falls back to the subject marker when the body carries no canonical URL", () => {
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "Re: [owner/repo] Add feature (PR #430)",
        "@octocat pushed 1 commit.\n\nabc1234  fix",
      ),
    ).toMatchObject({ item: "pr", event: "push" });
    expect(
      detectGithubNotificationFacts(
        HUMAN_FROM,
        "Re: [owner/repo] Crash (Issue #2300)",
        "Reopened #2300.",
      ),
    ).toMatchObject({ item: "issue", event: "reopened" });
  });

  it("reads the actor from the opener when the From header has no display name", () => {
    expect(
      detectGithubNotificationFacts(
        "notifications@github.com",
        "Re: [owner/repo] Add feature (PR #430)",
        githubBody("@github-actions[bot] pushed 1 commit.", PR_URL),
      ),
    ).toMatchObject({ actorKind: "bot", actorLogin: "github-actions[bot]" });
  });

  it("recognises Copilot as a bot without the [bot] suffix", () => {
    expect(
      detectGithubNotificationFacts(
        "Copilot <notifications@github.com>",
        "Re: [owner/repo] Add feature (PR #430)",
        githubBody("@Copilot commented on this pull request.", PR_URL),
      ),
    ).toMatchObject({ actorKind: "bot", event: "comment" });
  });
});

describe("buildGithubNotificationSubtype / detectGithubSubtype", () => {
  const from = "notifications@github.com";

  it("joins item, event and actor kind", () => {
    expect(
      buildGithubNotificationSubtype({
        item: "pr",
        event: "merged",
        actorKind: "human",
        actorLogin: "octocat",
        reason: null,
      }),
    ).toBe("pr:merged:human");
  });

  it("detects a CI run-failed notification from the subject skeleton (unchanged)", () => {
    expect(
      detectGithubSubtype(from, "[owner/repo] Run failed: CI · main"),
    ).toBe("ci:run_failed");
  });

  it("normalises multi-word run statuses (e.g. 'timed out')", () => {
    expect(
      detectGithubSubtype(from, "[owner/repo] Run timed out: Deploy"),
    ).toBe("ci:run_timed_out");
  });

  it("resolves the fine PR subtype when the subject is not a CI run", () => {
    expect(
      detectGithubSubtype(
        BOT_FROM,
        "Re: [owner/repo] Bump ws (PR #430)",
        githubBody("Merged #430 into main.", PR_URL),
      ),
    ).toBe("pr:merged:bot");
  });

  it("resolves the fine issue subtype", () => {
    expect(
      detectGithubSubtype(
        HUMAN_FROM,
        "[owner/repo] Crash on launch (Issue #2300)",
        githubBody("Steps to reproduce.", ISSUE_URL),
      ),
    ).toBe("issue:opened:human");
  });

  it("returns null for non-GitHub senders and for GitHub mail without an item", () => {
    expect(
      detectGithubSubtype("ci@example.com", "[repo] Run failed: CI"),
    ).toBeNull();
    expect(
      detectGithubSubtype(from, "[owner/repo] Digest", "no links"),
    ).toBeNull();
  });
});
