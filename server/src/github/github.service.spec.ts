import { Test, TestingModule } from "@nestjs/testing";

import { GitHubService, isGitHubNotificationEmail } from "./github.service";

describe("isGitHubNotificationEmail", () => {
  it("returns true for notifications@github.com", () => {
    expect(isGitHubNotificationEmail("notifications@github.com")).toBe(true);
  });

  it("returns true for repo-specific noreply address", () => {
    expect(isGitHubNotificationEmail("windows-app-v2@noreply.github.com")).toBe(
      true,
    );
  });

  it("returns true for noreply@github.com", () => {
    expect(isGitHubNotificationEmail("noreply@github.com")).toBe(true);
  });

  it("returns true for display-name format", () => {
    expect(
      isGitHubNotificationEmail(
        '"Focus-Bear/windows-app-v2" <windows-app-v2@noreply.github.com>',
      ),
    ).toBe(true);
  });

  it("returns false for non-GitHub sender", () => {
    expect(isGitHubNotificationEmail("someone@example.com")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isGitHubNotificationEmail("")).toBe(false);
  });
});

describe("GitHubService", () => {
  let service: GitHubService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubService],
    }).compile();

    service = module.get<GitHubService>(GitHubService);
  });

  describe("parseGitHubLinks", () => {
    it("should parse issue URL from plain text", () => {
      const emailBody =
        "Check out this issue: https://github.com/owner/repo/issues/123";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0]).toEqual({
        type: "issue",
        owner: "owner",
        repo: "repo",
        number: 123,
        url: "https://github.com/owner/repo/issues/123",
      });
    });

    it("should parse pull request URL from plain text", () => {
      const emailBody =
        "Check out this PR: https://github.com/owner/repo/pull/456";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0]).toEqual({
        type: "pr",
        owner: "owner",
        repo: "repo",
        number: 456,
        url: "https://github.com/owner/repo/pull/456",
      });
    });

    it("should parse multiple links from plain text", () => {
      const emailBody = `
        Issue 1: https://github.com/owner/repo/issues/123
        PR 1: https://github.com/owner/repo/pull/456
        Issue 2: https://github.com/other/repo/issues/789
      `;
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(3);
      expect(links[0].number).toBe(123);
      expect(links[1].number).toBe(456);
      expect(links[2].number).toBe(789);
    });

    it("should deduplicate identical URLs", () => {
      const emailBody = `
        https://github.com/owner/repo/issues/123
        https://github.com/owner/repo/issues/123
        https://github.com/owner/repo/issues/123
      `;
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });

    it("should remove URL fragments and query params", () => {
      const emailBody =
        "https://github.com/owner/repo/issues/123#comment-456?param=value";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].url).toBe("https://github.com/owner/repo/issues/123");
    });

    it("should parse links from HTML body", () => {
      const htmlBody =
        '<p>Check out <a href="https://github.com/owner/repo/issues/123">this issue</a></p>';
      const links = service.parseGitHubLinks("", htmlBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });

    it("should parse links from HTML text content", () => {
      const htmlBody =
        "<p>Check out https://github.com/owner/repo/issues/123</p>";
      const links = service.parseGitHubLinks("", htmlBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });

    it("should parse both plain text and HTML body", () => {
      const emailBody = "Plain: https://github.com/owner/repo/issues/123";
      const htmlBody =
        '<p>HTML: <a href="https://github.com/owner/repo/pull/456">PR</a></p>';
      const links = service.parseGitHubLinks(emailBody, htmlBody);

      expect(links.length).toBe(2);
      expect(links.find((link) => link.type === "issue")?.number).toBe(123);
      expect(links.find((link) => link.type === "pr")?.number).toBe(456);
    });

    it("should deduplicate between plain text and HTML", () => {
      const emailBody = "https://github.com/owner/repo/issues/123";
      const htmlBody =
        '<p><a href="https://github.com/owner/repo/issues/123">Same issue</a></p>';
      const links = service.parseGitHubLinks(emailBody, htmlBody);

      expect(links.length).toBe(1);
    });

    it("should handle HTTP URLs", () => {
      const emailBody = "http://github.com/owner/repo/issues/123";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].url).toContain("http://");
    });

    it("should handle URLs with trailing slashes", () => {
      const emailBody = "https://github.com/owner/repo/issues/123/";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      // URL may or may not have trailing slash depending on implementation
      expect(links[0].url).toMatch(
        /^https:\/\/github\.com\/owner\/repo\/issues\/123\/?$/,
      );
    });

    it("should return empty array for email with no GitHub links", () => {
      const emailBody = "This is a regular email with no GitHub links.";
      const links = service.parseGitHubLinks(emailBody);

      expect(links).toEqual([]);
    });

    it("should return empty array for empty email body", () => {
      const links = service.parseGitHubLinks("");

      expect(links).toEqual([]);
    });

    it("should handle complex HTML with multiple links", () => {
      const htmlBody = `
        <div>
          <p>Issue: <a href="https://github.com/owner/repo/issues/123">#123</a></p>
          <p>PR: <a href="https://github.com/owner/repo/pull/456">#456</a></p>
          <p>Another: https://github.com/other/repo/issues/789</p>
        </div>
      `;
      const links = service.parseGitHubLinks("", htmlBody);

      expect(links.length).toBe(3);
    });

    it("should handle URLs with special characters in owner/repo names", () => {
      const emailBody = "https://github.com/user-name/repo.name/issues/123";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].owner).toBe("user-name");
      expect(links[0].repo).toBe("repo.name");
    });

    it("should handle case-insensitive matching in href attributes", () => {
      const htmlBody =
        '<a href="HTTPS://GITHUB.COM/OWNER/REPO/ISSUES/123">Link</a>';
      const links = service.parseGitHubLinks("", htmlBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });

    it("should handle single quotes in href attributes", () => {
      const htmlBody =
        "<a href='https://github.com/owner/repo/issues/123'>Link</a>";
      const links = service.parseGitHubLinks("", htmlBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });

    it("should parse large issue numbers", () => {
      const emailBody = "https://github.com/owner/repo/issues/99999";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(99999);
    });

    it("should handle URLs in markdown-style links", () => {
      const emailBody =
        "[Issue #123](https://github.com/owner/repo/issues/123)";
      const links = service.parseGitHubLinks(emailBody);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(123);
    });
  });

  describe("parseGitHubLinksFromSubject", () => {
    it("should parse issue link from standard GitHub notification subject", () => {
      const subject = "[Focus-Bear/windows-app-v2] Some issue title (#1190)";
      const links = service.parseGitHubLinksFromSubject(subject);

      expect(links.length).toBe(1);
      expect(links[0]).toEqual({
        type: "issue",
        owner: "Focus-Bear",
        repo: "windows-app-v2",
        number: 1190,
        url: "https://github.com/Focus-Bear/windows-app-v2/issues/1190",
      });
    });

    it("should handle Re: prefix in subject", () => {
      const subject = "Re: [owner/repo] Fix something (#456)";
      const links = service.parseGitHubLinksFromSubject(subject);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(456);
      expect(links[0].owner).toBe("owner");
      expect(links[0].repo).toBe("repo");
    });

    it("should detect PR type when body mentions pull request", () => {
      const subject = "[owner/repo] Add feature (#789)";
      const body = "User opened a pull request to add this feature.";
      const links = service.parseGitHubLinksFromSubject(subject, body);

      expect(links.length).toBe(1);
      expect(links[0].type).toBe("pr");
      expect(links[0].url).toBe("https://github.com/owner/repo/pull/789");
    });

    it("should default to issue type when body has no pull request mention", () => {
      const subject = "[owner/repo] Bug report (#321)";
      const body = "User commented on this issue.";
      const links = service.parseGitHubLinksFromSubject(subject, body);

      expect(links.length).toBe(1);
      expect(links[0].type).toBe("issue");
    });

    it("should return empty array when subject has no GitHub pattern", () => {
      const links = service.parseGitHubLinksFromSubject(
        "Regular email subject",
      );
      expect(links).toEqual([]);
    });

    it("should return empty array for empty subject", () => {
      expect(service.parseGitHubLinksFromSubject("")).toEqual([]);
    });

    it("should handle repos with hyphens and dots in names", () => {
      const subject = "[my-org/my.repo] Fix bug (#99)";
      const links = service.parseGitHubLinksFromSubject(subject);

      expect(links.length).toBe(1);
      expect(links[0].owner).toBe("my-org");
      expect(links[0].repo).toBe("my.repo");
      expect(links[0].number).toBe(99);
    });

    it("should handle subject with extra text before issue number", () => {
      const subject =
        "[owner/repo] Implement feature: add new API endpoint (#42)";
      const links = service.parseGitHubLinksFromSubject(subject);

      expect(links.length).toBe(1);
      expect(links[0].number).toBe(42);
    });
  });
});
