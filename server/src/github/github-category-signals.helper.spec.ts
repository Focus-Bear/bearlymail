import {
  buildGithubCategorySignals,
  describeGithubFactsForTrace,
  formatGithubFactsForPrompt,
  githubFactsTraceDetail,
  isGithubMetadataStale,
  needsGithubMetadataRefresh,
  selectMetadataLinkForEmail,
  ThreadGithubMetadata,
} from "./github-category-signals.helper";

const GITHUB_SENDER = "qa-tester <notifications@github.com>";
const EMAIL_RECEIVED_AT = new Date("2026-09-01T10:00:00.000Z");
const FETCHED_BEFORE_EMAIL = "2026-08-31T10:00:00.000Z";
const FETCHED_AFTER_EMAIL = "2026-09-01T11:00:00.000Z";
const ISSUE_URL = "https://github.com/Focus-Bear/Mac-App/issues/812";
const PR_URL = "https://github.com/Focus-Bear/backend/pull/482";

function issueMetadata(
  overrides: Partial<ThreadGithubMetadata["links"][number]["status"]> = {},
  fetchedAt: string = FETCHED_AFTER_EMAIL,
): ThreadGithubMetadata {
  return {
    links: [
      {
        type: "issue",
        owner: "Focus-Bear",
        repo: "Mac-App",
        number: 812,
        url: ISSUE_URL,
        status: {
          state: "open",
          author: { login: "jeremy", type: "User" },
          projects: [{ name: "Mac App roadmap", status: "QA passed" }],
          labels: [{ name: "bug", color: "d73a4a" }],
          ...overrides,
        },
        fetchedAt,
      },
    ],
  };
}

function commentEmail(body: string = `View it on GitHub ${ISSUE_URL}`) {
  return {
    from: GITHUB_SENDER,
    subject: "Re: [Focus-Bear/Mac-App] Timer drifts after sleep (Issue #812)",
    body: `@qa-tester left a comment (Focus-Bear/Mac-App#812)\n\nQA — please proceed with testing.\n\n${body}`,
    htmlBody: null,
    receivedAt: EMAIL_RECEIVED_AT,
  };
}

describe("buildGithubCategorySignals", () => {
  it("returns null for mail that is not a GitHub notification", () => {
    expect(
      buildGithubCategorySignals(
        { from: "sam@example.com", subject: "Hi", body: "hello" },
        null,
      ),
    ).toBeNull();
  });

  it("combines message-level facts with the thread's fetched metadata", () => {
    const signals = buildGithubCategorySignals(commentEmail(), issueMetadata());

    expect(signals).not.toBeNull();
    expect(signals?.item).toBe("issue");
    expect(signals?.reference).toEqual({
      owner: "Focus-Bear",
      repo: "Mac-App",
      number: 812,
    });
    // Message-level: who acted in THIS message.
    expect(signals?.actorKind).toBe("human");
    expect(signals?.actorLogin).toBe("qa-tester");
    // Thread-level: the fetched status of the item itself.
    expect(signals?.state).toBe("open");
    expect(signals?.authorKind).toBe("human");
    expect(signals?.projectStatuses).toEqual([
      { project: "Mac App roadmap", status: "QA passed" },
    ]);
    expect(signals?.labels).toEqual(["bug"]);
    expect(signals?.metadataStale).toBe(false);
  });

  it("still returns message-level facts when no metadata was ever fetched", () => {
    const signals = buildGithubCategorySignals(commentEmail(), null);

    expect(signals?.actorLogin).toBe("qa-tester");
    expect(signals?.state).toBeNull();
    expect(signals?.projectStatuses).toEqual([]);
    expect(signals?.metadataFetchedAt).toBeNull();
    expect(signals?.metadataStale).toBe(true);
  });

  it("reports a merged PR as `merged` and a bot author as `bot`", () => {
    const signals = buildGithubCategorySignals(
      {
        from: "Focus-Bear/backend <notifications@github.com>",
        subject: "Re: [Focus-Bear/backend] Fix flaky snooze test (PR #517)",
        body: `Merged #517 into main.\n\nView it on GitHub ${PR_URL}`,
        htmlBody: null,
        receivedAt: EMAIL_RECEIVED_AT,
      },
      {
        links: [
          {
            type: "pr",
            owner: "Focus-Bear",
            repo: "backend",
            number: 482,
            url: PR_URL,
            status: {
              state: "closed",
              merged: true,
              author: {
                login: "devin-ai-integration[bot]",
                type: "User",
              },
              checks: { state: "passing", total: 4, failingChecks: [] },
            },
            fetchedAt: FETCHED_AFTER_EMAIL,
          },
        ],
      },
    );

    expect(signals?.state).toBe("merged");
    expect(signals?.authorKind).toBe("bot");
    expect(signals?.checksState).toBe("passing");
  });

  it("marks metadata fetched BEFORE the email as stale", () => {
    const signals = buildGithubCategorySignals(
      commentEmail(),
      issueMetadata({}, FETCHED_BEFORE_EMAIL),
    );

    expect(signals?.metadataStale).toBe(true);
    expect(signals?.metadataFetchedAt).toBe(FETCHED_BEFORE_EMAIL);
  });
});

describe("isGithubMetadataStale", () => {
  it("treats a never-fetched item as stale", () => {
    expect(isGithubMetadataStale(EMAIL_RECEIVED_AT, null)).toBe(true);
  });

  it("treats a fetch after the email as fresh", () => {
    expect(isGithubMetadataStale(EMAIL_RECEIVED_AT, FETCHED_AFTER_EMAIL)).toBe(
      false,
    );
  });

  it("treats a fetch before the email as stale", () => {
    expect(isGithubMetadataStale(EMAIL_RECEIVED_AT, FETCHED_BEFORE_EMAIL)).toBe(
      true,
    );
  });
});

describe("selectMetadataLinkForEmail", () => {
  const { links } = issueMetadata();

  it("prefers the link the email itself references", () => {
    const other = {
      ...links[0],
      number: 999,
      url: "https://github.com/Focus-Bear/Mac-App/issues/999",
    };
    const selected = selectMetadataLinkForEmail(
      [other, links[0]],
      [
        {
          type: "issue",
          owner: "Focus-Bear",
          repo: "Mac-App",
          number: 812,
          url: ISSUE_URL,
        },
      ],
    );

    expect(selected?.number).toBe(812);
  });

  it("falls back to the most recently fetched link when the email links none", () => {
    const stale = { ...links[0], number: 1, fetchedAt: FETCHED_BEFORE_EMAIL };
    expect(selectMetadataLinkForEmail([stale, links[0]], [])?.number).toBe(812);
  });

  it("returns null when the thread has no links", () => {
    expect(selectMetadataLinkForEmail([], [])).toBeNull();
  });
});

describe("needsGithubMetadataRefresh", () => {
  it("is false when the item's status was fetched after the email arrived", () => {
    expect(needsGithubMetadataRefresh(commentEmail(), issueMetadata())).toBe(
      false,
    );
  });

  it("is true when the status predates the email", () => {
    expect(
      needsGithubMetadataRefresh(
        commentEmail(),
        issueMetadata({}, FETCHED_BEFORE_EMAIL),
      ),
    ).toBe(true);
  });

  it("is true when there is no metadata at all", () => {
    expect(needsGithubMetadataRefresh(commentEmail(), null)).toBe(true);
  });

  it("is false for non-GitHub mail", () => {
    expect(
      needsGithubMetadataRefresh(
        { from: "sam@example.com", subject: "Hi", body: "hello" },
        null,
      ),
    ).toBe(false);
  });
});

describe("formatGithubFactsForPrompt", () => {
  it("renders only the facts that are present, board status included", () => {
    const signals = buildGithubCategorySignals(commentEmail(), issueMetadata());

    const rendered = formatGithubFactsForPrompt(signals!);

    expect(rendered).toContain("Item: issue #812 Focus-Bear/Mac-App");
    expect(rendered).toContain("state: open");
    expect(rendered).toContain("project status: QA passed (Mac App roadmap)");
    expect(rendered).toContain("labels: bug");
    expect(rendered).not.toContain("review:");
    expect(rendered).not.toContain("outdated");
  });

  it("flags a stale fetch so the model does not trust an old board status", () => {
    const signals = buildGithubCategorySignals(
      commentEmail(),
      issueMetadata({}, FETCHED_BEFORE_EMAIL),
    );

    expect(formatGithubFactsForPrompt(signals!)).toContain(
      "status fetched before this email arrived (may be outdated)",
    );
  });

  it("says so when nothing was ever fetched", () => {
    const signals = buildGithubCategorySignals(commentEmail(), null);

    expect(formatGithubFactsForPrompt(signals!)).toContain("no fetched status");
  });
});

describe("trace formatting", () => {
  it("prefixes the facts line for the decision trace", () => {
    const signals = buildGithubCategorySignals(commentEmail(), issueMetadata());

    expect(describeGithubFactsForTrace(signals)).toContain(
      "GitHub facts: Item: issue #812",
    );
  });

  it("reports `none available` for a GitHub email with no resolvable facts", () => {
    expect(
      githubFactsTraceDetail(
        { from: GITHUB_SENDER, subject: "Digest", body: "nothing linkable" },
        null,
      ),
    ).toBe("GitHub facts: none available");
  });

  it("returns null for ordinary mail, where the line would be noise", () => {
    expect(
      githubFactsTraceDetail(
        { from: "sam@example.com", subject: "Hi", body: "hello" },
        null,
      ),
    ).toBeNull();
  });
});
