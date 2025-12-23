import { Injectable } from "@nestjs/common";

export interface ParsedGitHubLink {
  type: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
  url: string;
}

@Injectable()
export class GitHubService {
  /**
   * Parse GitHub URLs from email body (both plain text and HTML)
   * Supports:
   * - https://github.com/{owner}/{repo}/issues/{number}
   * - https://github.com/{owner}/{repo}/pull/{number}
   * - URLs with fragments (#comment-123)
   */
  parseGitHubLinks(emailBody: string, htmlBody?: string): ParsedGitHubLink[] {
    const links: ParsedGitHubLink[] = [];
    const seen = new Set<string>(); // Deduplicate by URL

    // GitHub URL pattern: https://github.com/{owner}/{repo}/issues/{number} or /pull/{number}
    const githubUrlPattern =
      /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)(?:[#\/].*)?/gi;

    // Parse from plain text body
    if (emailBody) {
      let match;
      while ((match = githubUrlPattern.exec(emailBody)) !== null) {
        const url = match[0].split("#")[0].split("?")[0]; // Remove fragments and query params
        if (!seen.has(url)) {
          seen.add(url);
          links.push({
            type: match[3] === "pull" ? "pr" : "issue",
            owner: match[1],
            repo: match[2],
            number: parseInt(match[4], 10),
            url,
          });
        }
      }
    }

    // Parse from HTML body (extract text content and href attributes)
    if (htmlBody) {
      // Reset regex
      githubUrlPattern.lastIndex = 0;

      // Extract text content from HTML (for plain text links in HTML)
      const textContent = htmlBody.replace(/<[^>]*>/g, " ");
      let match;
      while ((match = githubUrlPattern.exec(textContent)) !== null) {
        const url = match[0].split("#")[0].split("?")[0];
        if (!seen.has(url)) {
          seen.add(url);
          links.push({
            type: match[3] === "pull" ? "pr" : "issue",
            owner: match[1],
            repo: match[2],
            number: parseInt(match[4], 10),
            url,
          });
        }
      }

      // Extract href attributes from <a> tags
      const hrefPattern = /href=["'](https?:\/\/github\.com\/[^"']+)["']/gi;
      let hrefMatch;
      while ((hrefMatch = hrefPattern.exec(htmlBody)) !== null) {
        const fullUrl = hrefMatch[1].split("#")[0].split("?")[0];
        const linkMatch = fullUrl.match(
          /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/i,
        );
        if (linkMatch) {
          const url = linkMatch[0];
          if (!seen.has(url)) {
            seen.add(url);
            links.push({
              type: linkMatch[3] === "pull" ? "pr" : "issue",
              owner: linkMatch[1],
              repo: linkMatch[2],
              number: parseInt(linkMatch[4], 10),
              url,
            });
          }
        }
      }
    }

    return links;
  }
}
