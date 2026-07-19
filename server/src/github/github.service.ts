import { Injectable } from "@nestjs/common";

import { GITHUB_LINK_TYPES } from "../constants/domain-types";

export interface ParsedGitHubLink {
  type: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/** Return true when the from address belongs to any GitHub notification service. */
export function isGitHubNotificationEmail(from: string): boolean {
  return !!from && /@(?:.*\.)?github\.com>?\s*$/i.test(from);
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
    // Deduplicate by normalized (lowercase) URL to handle case variations
    const seenNormalized = new Set<string>();

    // GitHub URL pattern: https://github.com/{owner}/{repo}/issues/{number} or /pull/{number}
    const githubUrlPattern =
      /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)(?:[#\/].*)?/gi;

    // Parse from plain text body
    if (emailBody) {
      let match: RegExpExecArray | null;
      while ((match = githubUrlPattern.exec(emailBody)) !== null) {
        // Remove fragments and query params
        const url = match[0].split("#")[0].split("?")[0];
        if (!seenNormalized.has(url.toLowerCase())) {
          seenNormalized.add(url.toLowerCase());
          links.push({
            type:
              match[3] === GITHUB_LINK_TYPES.PULL
                ? GITHUB_LINK_TYPES.PR
                : GITHUB_LINK_TYPES.ISSUE,
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
      let match: RegExpExecArray | null;
      while ((match = githubUrlPattern.exec(textContent)) !== null) {
        const url = match[0].split("#")[0].split("?")[0];
        if (!seenNormalized.has(url.toLowerCase())) {
          seenNormalized.add(url.toLowerCase());
          links.push({
            type:
              match[3] === GITHUB_LINK_TYPES.PULL
                ? GITHUB_LINK_TYPES.PR
                : GITHUB_LINK_TYPES.ISSUE,
            owner: match[1],
            repo: match[2],
            number: parseInt(match[4], 10),
            url,
          });
        }
      }

      // Extract href attributes from <a> tags
      const hrefPattern = /href=["'](https?:\/\/github\.com\/[^"']+)["']/gi;
      let hrefMatch: RegExpExecArray | null;
      while ((hrefMatch = hrefPattern.exec(htmlBody)) !== null) {
        const fullUrl = hrefMatch[1].split("#")[0].split("?")[0];
        const linkMatch = fullUrl.match(
          /https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(issues|pull)\/(\d+)/i,
        );
        if (linkMatch) {
          const url = linkMatch[0];
          if (!seenNormalized.has(url.toLowerCase())) {
            seenNormalized.add(url.toLowerCase());
            links.push({
              type:
                linkMatch[3] === GITHUB_LINK_TYPES.PULL
                  ? GITHUB_LINK_TYPES.PR
                  : GITHUB_LINK_TYPES.ISSUE,
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

  /**
   * Fallback: parse GitHub issue/PR info from a GitHub notification email subject.
   * GitHub notification subjects follow the pattern: [owner/repo] title (#number)
   *
   * Used when body/HTML parsing finds no links (e.g. htmlBody is null or the URL
   * appears only as link text rather than a raw URL in the email body).
   */
  parseGitHubLinksFromSubject(
    subject: string,
    emailBody?: string,
  ): ParsedGitHubLink[] {
    if (!subject) return [];

    // Strip common reply/forward prefixes so "Re: [owner/repo]..." still matches
    const cleanSubject = subject
      .replace(/^(Re|Fwd|FW|RE|FWD)\s*:\s*/gi, "")
      .trim();

    // Pattern: [owner/repo] any title (#number)
    const subjectPattern = /\[([^/\]]+)\/([^\]]+)\].*\(#(\d+)\)/i;
    const match = cleanSubject.match(subjectPattern);
    if (!match) return [];

    const owner = match[1].trim();
    const repo = match[2].trim();
    const number = parseInt(match[3], 10);
    if (!owner || !repo || isNaN(number)) return [];

    // Detect PR from body text ("pull request" indicator); default to issue
    const isPR = !!emailBody && /\bpull request\b/i.test(emailBody);
    const type = isPR ? GITHUB_LINK_TYPES.PR : GITHUB_LINK_TYPES.ISSUE;
    const path = isPR ? "pull" : "issues";
    const url = `https://github.com/${owner}/${repo}/${path}/${number}`;

    return [{ type, owner, repo, number, url }];
  }
}
