import { detectGithubLinkType } from "./github-link-type.util";

describe("detectGithubLinkType", () => {
  const from = "notifications@github.com";

  it("returns null for non-GitHub senders", () => {
    expect(
      detectGithubLinkType(
        "hello@example.com",
        "https://github.com/owner/repo/pull/12",
      ),
    ).toBeNull();
  });

  it("detects a pull request from a canonical /pull/ URL in the body", () => {
    expect(
      detectGithubLinkType(
        from,
        "Reply above this line.\nView it on GitHub: https://github.com/owner/repo/pull/128",
      ),
    ).toBe("pr");
  });

  it("detects an issue from a canonical /issues/ URL in the body", () => {
    expect(
      detectGithubLinkType(
        from,
        "https://github.com/owner/repo/issues/57#issuecomment-1",
      ),
    ).toBe("issue");
  });

  it("finds the URL inside an HTML href when the plain body has none", () => {
    expect(
      detectGithubLinkType(
        from,
        "You have a new notification",
        '<a href="https://github.com/owner/repo/pull/9">View it on GitHub</a>',
      ),
    ).toBe("pr");
  });

  it("prefers PR when both a PR and an issue URL are present", () => {
    expect(
      detectGithubLinkType(
        from,
        "https://github.com/o/r/pull/5 references https://github.com/o/r/issues/3",
      ),
    ).toBe("pr");
  });

  it("returns null when a GitHub email carries no canonical PR/issue URL", () => {
    expect(detectGithubLinkType(from, "A digest with no links")).toBeNull();
  });

  it("matches GitHub subdomain senders (e.g. Enterprise) via the notification check", () => {
    expect(
      detectGithubLinkType(
        "notifications@subdomain.github.com",
        "https://github.com/owner/repo/pull/3",
      ),
    ).toBe("pr");
  });
});
