import { Test, TestingModule } from "@nestjs/testing";
import { GitHubService } from "./github.service";

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
      expect(links.find((l) => l.type === "issue")?.number).toBe(123);
      expect(links.find((l) => l.type === "pr")?.number).toBe(456);
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
      expect(links[0].url).toBe("https://github.com/owner/repo/issues/123");
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
});
